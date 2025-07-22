import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { getFaucetHost, requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
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
  private walletAddress: string = 'official-faucet'; // Placeholder for compatibility
  private isInitialized = false;

  constructor() {
    // Initialize SUI client
    this.client = new SuiClient({
      url: config.sui.rpcUrl || getFullnodeUrl(config.sui.network),
    });

    // Get faucet host for the network
    this.faucetHost = getFaucetHost(config.sui.network);

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

      // Use official Sui faucet
      console.log(`🔥 DEBUG: Requesting SUI from official faucet for ${normalizedAddress}`);

      const faucetResult = await requestSuiFromFaucetV2({
        host: this.faucetHost,
        recipient: normalizedAddress,
      });

      console.log(`🔥 DEBUG: Faucet result:`, faucetResult);

      // Check if faucet request was successful
      if (!faucetResult) {
        return {
          success: false,
          error: 'Failed to request SUI from faucet',
        };
      }

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
        '0' // No gas cost for faucet requests
      );

      logger.info(`✅ Requested SUI from official faucet for ${normalizedAddress}`, {
        transactionHash,
        faucetHost: this.faucetHost,
        requestId,
      });

      return {
        success: true,
        transactionHash,
        gasUsed: '0', // No gas cost for faucet requests
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
