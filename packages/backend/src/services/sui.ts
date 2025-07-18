import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { fromB64 } from '@mysten/sui/utils';
import { config } from '../config/index.js';
import { logger, logError, logSuiTransaction, logWalletBalance } from '../utils/logger.js';

export interface TransferResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
  gasUsed?: string;
}

export interface WalletInfo {
  address: string;
  balance: bigint;
  isLowBalance: boolean;
}

class SuiService {
  private client: SuiClient;
  private keypair: Ed25519Keypair;
  private walletAddress: string;
  private isInitialized = false;

  constructor() {
    // Initialize SUI client
    this.client = new SuiClient({
      url: config.sui.rpcUrl || getFullnodeUrl(config.sui.network),
    });

    // Initialize keypair from private key
    try {
      let privateKeyBytes: Uint8Array;

      if (config.sui.privateKey.startsWith('suiprivkey1')) {
        // Handle Sui private key format (bech32)
        this.keypair = Ed25519Keypair.fromSecretKey(config.sui.privateKey);
      } else {
        // Handle base64 format
        privateKeyBytes = fromB64(config.sui.privateKey);
        this.keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
      }

      this.walletAddress = this.keypair.getPublicKey().toSuiAddress();
      logger.info(`Sui wallet initialized: ${this.walletAddress}`);
    } catch (error) {
      logError(error as Error, { context: 'Sui keypair initialization' });
      throw new Error('Failed to initialize Sui keypair from private key');
    }
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      await this.client.getLatestSuiSystemState();
      
      // Check wallet balance
      const balance = await this.getWalletBalance();
      const minBalance = BigInt(config.sui.minWalletBalance);
      
      if (balance < minBalance) {
        const balanceInSui = Number(balance) / 1_000_000_000;
        const minBalanceInSui = Number(minBalance) / 1_000_000_000;
        
        logWalletBalance(
          balanceInSui.toString(),
          minBalanceInSui.toString(),
          true
        );
        
        logger.warn(`⚠️  Wallet balance is low: ${balanceInSui} SUI (minimum: ${minBalanceInSui} SUI)`);
      } else {
        const balanceInSui = Number(balance) / 1_000_000_000;
        logger.info(`✅ Wallet balance: ${balanceInSui} SUI`);
      }

      this.isInitialized = true;
      logger.info('Sui service initialized successfully');
    } catch (error) {
      logError(error as Error, { context: 'Sui service initialization' });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    // SUI client doesn't need explicit disconnection
    this.isInitialized = false;
    logger.info('Sui service disconnected');
  }

  async getWalletBalance(): Promise<bigint> {
    try {
      const balance = await this.client.getBalance({
        owner: this.walletAddress,
      });
      
      return BigInt(balance.totalBalance);
    } catch (error) {
      logError(error as Error, { context: 'Get wallet balance' });
      throw error;
    }
  }

  async getWalletInfo(): Promise<WalletInfo> {
    try {
      const balance = await this.getWalletBalance();
      const minBalance = BigInt(config.sui.minWalletBalance);
      
      return {
        address: this.walletAddress,
        balance,
        isLowBalance: balance < minBalance,
      };
    } catch (error) {
      logError(error as Error, { context: 'Get wallet info' });
      throw error;
    }
  }

  validateAddress(address: string): boolean {
    try {
      // Basic format validation
      if (!address || typeof address !== 'string') {
        return false;
      }

      // Remove 0x prefix if present
      const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
      
      // Check length (64 hex characters)
      if (cleanAddress.length !== 64) {
        return false;
      }

      // Check if it's valid hex
      if (!/^[0-9a-fA-F]+$/.test(cleanAddress)) {
        return false;
      }

      return true;
    } catch (error) {
      logError(error as Error, { context: 'Address validation', address });
      return false;
    }
  }

  async sendTokens(
    recipientAddress: string,
    amount: bigint,
    requestId: string
  ): Promise<TransferResult> {
    try {
      if (!this.isInitialized) {
        throw new Error('Sui service not initialized');
      }

      // Validate recipient address
      if (!this.validateAddress(recipientAddress)) {
        return {
          success: false,
          error: 'Invalid recipient address format',
        };
      }

      // Normalize address (add 0x prefix if missing)
      const normalizedAddress = recipientAddress.startsWith('0x') 
        ? recipientAddress 
        : `0x${recipientAddress}`;

      // Check if we have enough balance
      const currentBalance = await this.getWalletBalance();
      const maxAmount = BigInt(config.sui.maxAmount);
      
      if (amount > maxAmount) {
        return {
          success: false,
          error: `Amount exceeds maximum allowed: ${Number(maxAmount) / 1_000_000_000} SUI`,
        };
      }

      if (currentBalance < amount) {
        return {
          success: false,
          error: 'Insufficient faucet balance',
        };
      }

      // Create transaction
      const tx = new Transaction();
      
      // Split coins and transfer
      const [coin] = tx.splitCoins(tx.gas, [amount]);
      tx.transferObjects([coin], normalizedAddress);

      // Execute transaction
      const result = await this.client.signAndExecuteTransaction({
        transaction: tx,
        signer: this.keypair,
        options: {
          showEffects: true,
          showEvents: true,
        },
      });

      // Check if transaction was successful
      if (result.effects?.status?.status !== 'success') {
        const error = result.effects?.status?.error || 'Transaction failed';
        logError(new Error(error), { 
          context: 'Sui transaction failed',
          requestId,
          recipientAddress: normalizedAddress,
          amount: amount.toString(),
        });
        
        return {
          success: false,
          error: `Transaction failed: ${error}`,
        };
      }

      const transactionHash = result.digest;
      const gasUsed = result.effects?.gasUsed?.computationCost || '0';

      // Log successful transaction
      logSuiTransaction(
        requestId,
        transactionHash,
        this.walletAddress,
        normalizedAddress,
        amount.toString(),
        gasUsed
      );

      logger.info(`✅ Sent ${Number(amount) / 1_000_000_000} SUI to ${normalizedAddress}`, {
        transactionHash,
        gasUsed,
        requestId,
      });

      return {
        success: true,
        transactionHash,
        gasUsed,
      };

    } catch (error) {
      logError(error as Error, { 
        context: 'Send tokens',
        requestId,
        recipientAddress,
        amount: amount.toString(),
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }> {
    try {
      const start = Date.now();
      
      // Test RPC connection
      const systemState = await this.client.getLatestSuiSystemState();
      const rpcLatency = Date.now() - start;

      // Check wallet balance
      const walletInfo = await this.getWalletInfo();
      
      const details = {
        rpcLatency,
        walletAddress: this.walletAddress,
        walletBalance: walletInfo.balance.toString(),
        walletBalanceSui: Number(walletInfo.balance) / 1_000_000_000,
        isLowBalance: walletInfo.isLowBalance,
        epoch: systemState.epoch,
        network: config.sui.network,
        rpcUrl: config.sui.rpcUrl,
      };

      return {
        status: 'healthy',
        details,
      };

    } catch (error) {
      logError(error as Error, { context: 'Sui health check' });
      
      return {
        status: 'unhealthy',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          walletAddress: this.walletAddress,
          network: config.sui.network,
          rpcUrl: config.sui.rpcUrl,
        },
      };
    }
  }

  // Utility methods
  formatAmount(amount: bigint): string {
    return (Number(amount) / 1_000_000_000).toFixed(9);
  }

  parseAmount(amountSui: string): bigint {
    const amount = parseFloat(amountSui);
    if (isNaN(amount) || amount <= 0) {
      throw new Error('Invalid amount');
    }
    return BigInt(Math.floor(amount * 1_000_000_000));
  }

  get isReady(): boolean {
    return this.isInitialized;
  }

  get faucetAddress(): string {
    return this.walletAddress;
  }

  get networkInfo() {
    return {
      network: config.sui.network,
      rpcUrl: config.sui.rpcUrl,
      walletAddress: this.walletAddress,
    };
  }
}

export const suiService = new SuiService();
