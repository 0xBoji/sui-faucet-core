import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export interface FaucetConfig {
  sui: {
    network: 'testnet' | 'devnet';
    rpcUrl: string;
    privateKey: string;
    defaultAmount: string; // In MIST (smallest SUI unit)
    maxAmount: string;
    minWalletBalance: string;
  };
  rateLimits: {
    windowMs: number;
    maxRequestsPerWindow: number;
    maxRequestsPerWallet: number;
    maxRequestsPerIP: number;
    skipSuccessfulRequests: boolean;
    skipFailedRequests: boolean;
  };
  auth: {
    apiKey: string;
    adminUsername: string;
    adminPassword: string;
  };
  server: {
    port: number;
    corsOrigins: string[];
    requestTimeout: number;
    environment: 'development' | 'production' | 'test';
  };
  redis: {
    url: string;
    keyPrefix: string;
    ttl: number;
  };
  database: {
    url: string;
    ssl: boolean;
  };
  logging: {
    level: string;
    format: 'json' | 'simple';
    file?: string;
  };
}

// Validate required environment variables
const requiredEnvVars = [
  'SUI_PRIVATE_KEY',
  'REDIS_URL',
  'DATABASE_URL',
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Parse CORS origins
const parseCorsOrigins = (origins: string | undefined): string[] => {
  if (!origins) return ['http://localhost:3000', 'http://localhost:5173'];
  return origins.split(',').map(origin => origin.trim());
};

// Configuration object
export const config: FaucetConfig = {
  sui: {
    network: (process.env['SUI_NETWORK'] as 'testnet' | 'devnet') || 'testnet',
    rpcUrl: process.env['SUI_RPC_URL'] || 'https://fullnode.testnet.sui.io/',
    privateKey: process.env['SUI_PRIVATE_KEY']!,
    defaultAmount: process.env['SUI_DEFAULT_AMOUNT'] || '1000000000',
    maxAmount: process.env['SUI_MAX_AMOUNT'] || '5000000000',
    minWalletBalance: process.env['SUI_MIN_WALLET_BALANCE'] || '10000000000',
  },
  rateLimits: {
    windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] || '3600000'),
    maxRequestsPerWindow: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] || '100'),
    maxRequestsPerWallet: parseInt(process.env['RATE_LIMIT_MAX_PER_WALLET'] || '1'),
    maxRequestsPerIP: parseInt(process.env['RATE_LIMIT_MAX_PER_IP'] || '5'),
    skipSuccessfulRequests: process.env['RATE_LIMIT_SKIP_SUCCESS'] === 'true',
    skipFailedRequests: process.env['RATE_LIMIT_SKIP_FAILED'] === 'true',
  },
  auth: {
    apiKey: process.env['API_KEY'] || 'suisuisui',
    adminUsername: process.env['ADMIN_USERNAME'] || 'admin',
    adminPassword: process.env['ADMIN_PASSWORD'] || 'adminsuisuisui',
  },
  server: {
    port: parseInt(process.env['PORT'] || '3001'),
    corsOrigins: parseCorsOrigins(process.env['CORS_ORIGINS']),
    requestTimeout: parseInt(process.env['REQUEST_TIMEOUT'] || '30000'), // 30 seconds
    environment: (process.env['NODE_ENV'] as 'development' | 'production' | 'test') || 'development',
  },
  redis: {
    url: process.env['REDIS_URL']!,
    keyPrefix: process.env['REDIS_KEY_PREFIX'] || 'sui-faucet:',
    ttl: parseInt(process.env['REDIS_TTL'] || '3600'),
  },
  database: {
    url: process.env['DATABASE_URL']!,
    ssl: process.env['DATABASE_SSL'] !== 'false',
  },
  logging: {
    level: process.env['LOG_LEVEL'] || 'info',
    format: (process.env['LOG_FORMAT'] as 'json' | 'simple') || 'json',
    ...(process.env['LOG_FILE'] && { file: process.env['LOG_FILE'] }),
  },
};

// Validate configuration
export const validateConfig = (): void => {
  // Validate SUI amounts
  const defaultAmount = BigInt(config.sui.defaultAmount);
  const maxAmount = BigInt(config.sui.maxAmount);
  const minWalletBalance = BigInt(config.sui.minWalletBalance);

  if (defaultAmount <= 0) {
    throw new Error('SUI_DEFAULT_AMOUNT must be greater than 0');
  }

  if (maxAmount < defaultAmount) {
    throw new Error('SUI_MAX_AMOUNT must be greater than or equal to SUI_DEFAULT_AMOUNT');
  }

  if (minWalletBalance <= maxAmount) {
    throw new Error('SUI_MIN_WALLET_BALANCE must be greater than SUI_MAX_AMOUNT');
  }

  // Validate rate limits
  if (config.rateLimits.maxRequestsPerWindow <= 0) {
    throw new Error('RATE_LIMIT_MAX_REQUESTS must be greater than 0');
  }

  if (config.rateLimits.maxRequestsPerWallet <= 0) {
    throw new Error('RATE_LIMIT_MAX_PER_WALLET must be greater than 0');
  }

  if (config.rateLimits.maxRequestsPerIP <= 0) {
    throw new Error('RATE_LIMIT_MAX_PER_IP must be greater than 0');
  }

  // Validate server port
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('PORT must be between 1 and 65535');
  }

  console.log('✅ Configuration validated successfully');
};

// Validate configuration on import
validateConfig();
