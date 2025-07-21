import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export interface FaucetResponse {
  success: boolean;
  transactionHash?: string;
  amount?: string;
  message: string;
  walletAddress?: string;
  faucetAddress?: string;
  error?: {
    code: string;
    details?: string;
  };
  retryAfter?: number;
}

export interface FaucetStatus {
  success: boolean;
  faucetAddress: string;
  balance: string;
  balanceSui: number;
  balanceInSui: number; // Alias for compatibility
  network: string;
  rpcUrl: string;
  defaultAmount: string;
  defaultAmountSui: number;
  maxAmount: string;
  maxAmountSui: number;
  isLowBalance: boolean;
  isHealthy: boolean;
  rateLimits: {
    windowMs: number;
    maxRequestsPerWallet: number;
    maxRequestsPerIP: number;
  };
  isOperational: boolean;
}

export class FaucetApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: config.faucet.apiUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.faucet.apiKey,
      },
    });

    // Request interceptor for logging
    this.api.interceptors.request.use(
      (config) => {
        logger.debug('Faucet API Request', {
          method: config.method,
          url: config.url,
          data: config.data,
        });
        return config;
      },
      (error) => {
        logger.error('Faucet API Request Error', { error: error.message });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.api.interceptors.response.use(
      (response) => {
        logger.debug('Faucet API Response', {
          status: response.status,
          data: response.data,
        });
        return response;
      },
      (error) => {
        logger.error('Faucet API Response Error', {
          status: error.response?.status,
          data: error.response?.data,
          message: error.message,
        });
        return Promise.reject(error);
      }
    );
  }

  async requestTokens(walletAddress: string): Promise<FaucetResponse> {
    try {
      const response = await this.api.post('/faucet/request', {
        address: walletAddress,
      });

      return response.data;
    } catch (error) {
      if (error instanceof AxiosError) {
        // Handle rate limiting specifically
        if (error.response?.status === 429) {
          const errorData = error.response.data;
          return {
            success: false,
            message: errorData.message || 'Rate limit exceeded',
            error: {
              code: 'RATE_LIMIT_EXCEEDED',
              details: errorData.error?.details || 'Please wait before requesting again',
            },
            retryAfter: errorData.retryAfter || 3600, // Default 1 hour
          };
        }

        // Handle other API errors
        if (error.response?.data) {
          return error.response.data;
        }

        return {
          success: false,
          message: `API Error: ${error.message}`,
          error: {
            code: 'API_ERROR',
            details: error.message,
          },
        };
      }

      return {
        success: false,
        message: 'Unknown error occurred',
        error: {
          code: 'UNKNOWN_ERROR',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  async getFaucetStatus(): Promise<FaucetStatus | null> {
    try {
      const response = await this.api.get('/faucet/status');
      return response.data;
    } catch (error) {
      logger.error('Failed to get faucet status', { error });
      return null;
    }
  }

  async getHealth(): Promise<boolean> {
    try {
      const response = await this.api.get('/health');
      return response.data.success === true;
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }

  async getAdminStats(days: number = 7): Promise<any> {
    try {
      const response = await this.api.get(`/admin/faucet/stats?days=${days}`);
      return response.data;
    } catch (error) {
      logger.error('Failed to get admin stats', { error });
      return null;
    }
  }
}

export const faucetApi = new FaucetApiService();
