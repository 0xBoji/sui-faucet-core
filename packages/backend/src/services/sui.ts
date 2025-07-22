import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
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
  private faucetHost: string;
  private keypair?: Ed25519Keypair;
  private walletAddress: string = 'official-faucet'; // Default for SDK mode
  private isInitialized = false;

  constructor() {
    // Initialize SUI client
    this.client = new SuiClient({
      url: config.sui.rpcUrl || getFullnodeUrl(config.sui.network),
    });

    // Get faucet host for the network
    this.faucetHost = getFaucetHost(config.sui.network);

    // Initialize wallet if private key is provided
    if (config.sui.privateKey) {
      try {
        if (config.sui.privateKey.startsWith('suiprivkey1')) {
          this.keypair = Ed25519Keypair.fromSecretKey(config.sui.privateKey);
        } else {
          const privateKeyBytes = fromB64(config.sui.privateKey);
          this.keypair = Ed25519Keypair.fromSecretKey(privateKeyBytes);
        }
        this.walletAddress = this.keypair.getPublicKey().toSuiAddress();
        logger.info(`Wallet initialized: ${this.walletAddress}`);
      } catch (error) {
        logger.warn('Failed to initialize wallet, will use SDK faucet only');
      }
    }

    logger.info(`Sui service initialized for network: ${config.sui.network}`);
    logger.info(`Using faucet host: ${this.faucetHost}`);
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      await this.client.getLatestSuiSystemState();

      this.isInitialized = true;
      logger.info('✅ Sui service initialized successfully', {
        network: config.sui.network,
        faucetHost: this.faucetHost,
      });
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

  // Compatibility methods for existing code
  async getWalletBalance(): Promise<bigint> {
    // Return a placeholder balance since we're using official faucet
    return BigInt('1000000000000'); // 1000 SUI placeholder
  }

  async getWalletInfo(): Promise<WalletInfo> {
    const balance = await this.getWalletBalance();
    return {
      address: this.walletAddress,
      balance,
      isLowBalance: false, // Never low since using official faucet
    };
  }

  getWalletAddress(): string {
    return this.walletAddress;
  }

  private async getFaucetMode(): Promise<'wallet' | 'sui_sdk'> {
    try {
      // Import database service dynamically to avoid circular dependency
      const { databaseService } = await import('./database.js');

      const query = `
        SELECT setting_value FROM rate_limit_settings
        WHERE setting_name = 'faucet_mode' AND is_active = true
      `;
      const result = await databaseService.query(query);

      if (result.rows.length > 0) {
        const mode = result.rows[0].setting_value;
        return mode === 'sui_sdk' ? 'sui_sdk' : 'wallet';
      }

      // Default to wallet mode
      return 'wallet';
    } catch (error) {
      logger.warn('Failed to get faucet mode from database, using wallet mode');
      return 'wallet';
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
      console.log(`🔥 DEBUG: sendTokens started for ${recipientAddress}, amount: ${amount}`);

      if (!this.isInitialized) {
        throw new Error('Sui service not initialized');
      }

      console.log(`🔥 DEBUG: Sui service is initialized`);

      // Validate recipient address
      if (!this.validateAddress(recipientAddress)) {
        console.log(`🔥 DEBUG: Invalid address format: ${recipientAddress}`);
        return {
          success: false,
          error: 'Invalid recipient address format',
        };
      }

      console.log(`🔥 DEBUG: Address validation passed`);

      // Normalize address (add 0x prefix if missing)
      const normalizedAddress = recipientAddress.startsWith('0x')
        ? recipientAddress
        : `0x${recipientAddress}`;

      // Check amount limits
      const maxAmount = BigInt(config.sui.maxAmount);

      if (amount > maxAmount) {
        return {
          success: false,
          error: `Amount exceeds maximum allowed: ${Number(maxAmount) / 1_000_000_000} SUI`,
        };
      }

      // Get faucet mode from database
      const faucetMode = await this.getFaucetMode();
      console.log(`🔥 DEBUG: Using faucet mode: ${faucetMode}`);

      if (faucetMode === 'sui_sdk') {
        return await this.sendTokensViaSuiSDK(normalizedAddress, amount, requestId);
      } else {
        return await this.sendTokensViaWallet(normalizedAddress, amount, requestId);
      }

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

  private async sendTokensViaSuiSDK(
    normalizedAddress: string,
    amount: bigint,
    requestId: string
  ): Promise<TransferResult> {
    try {
      console.log(`🔥 DEBUG: Requesting SUI from official faucet for ${normalizedAddress}`);

      const faucetResult = await requestSuiFromFaucetV2({
        host: this.faucetHost,
        recipient: normalizedAddress,
      });

      console.log(`🔥 DEBUG: Official faucet success:`, faucetResult);

      // Extract transaction hash from faucet response
      const transactionHash = typeof faucetResult === 'string' ? faucetResult :
                             (faucetResult as any).task ||
                             (faucetResult as any).digest ||
                             'faucet-request-success';

      // Log successful transaction
      logSuiTransaction(
        requestId,
        transactionHash,
        'official-faucet',
        normalizedAddress,
        amount.toString(),
        '0'
      );

      logger.info(`✅ Official faucet success for ${normalizedAddress}`, {
        transactionHash,
        requestId,
      });

      return {
        success: true,
        transactionHash,
        gasUsed: '0',
      };

    } catch (faucetError: any) {
      console.log(`🔥 DEBUG: Official faucet failed:`, faucetError.message);

      return {
        success: false,
        error: faucetError.message?.includes('Too many requests')
          ? 'Official Sui faucet is rate limited. Please try again later or switch to wallet mode.'
          : `Official faucet error: ${faucetError.message}`,
      };
    }
  }

  private async sendTokensViaWallet(
    normalizedAddress: string,
    amount: bigint,
    requestId: string
  ): Promise<TransferResult> {
    try {
      if (!this.keypair) {
        return {
          success: false,
          error: 'Wallet not configured. Please set up private key or switch to SDK mode.',
        };
      }

      console.log(`🔥 DEBUG: Sending SUI via wallet to ${normalizedAddress}`);

      // Check wallet balance
      const currentBalance = await this.getActualWalletBalance();
      if (currentBalance < amount) {
        return {
          success: false,
          error: 'Insufficient wallet balance',
        };
      }

      // Create transaction
      const tx = new Transaction();
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

    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Wallet transaction failed',
      };
    }
  }

  private async getActualWalletBalance(): Promise<bigint> {
    if (!this.keypair) return BigInt(0);

    try {
      const balance = await this.client.getBalance({
        owner: this.walletAddress,
      });
      return BigInt(balance.totalBalance);
    } catch (error) {
      return BigInt(0);
    }
  }

  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; details: Record<string, any> }> {
    try {
      const start = Date.now();

      // Test RPC connection
      const systemState = await this.client.getLatestSuiSystemState();
      const rpcLatency = Date.now() - start;

      const details = {
        rpcLatency,
        epoch: systemState.epoch,
        network: config.sui.network,
        rpcUrl: config.sui.rpcUrl,
        faucetHost: this.faucetHost,
        usingOfficialFaucet: true,
        walletAddress: this.walletAddress,
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
          network: config.sui.network,
          walletAddress: this.walletAddress,
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
