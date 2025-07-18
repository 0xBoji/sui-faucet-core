import winston from 'winston';
import { config } from '../config/index.js';

// Custom log format for development
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;
    
    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// JSON format for production
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Create transports array
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: config.server.environment === 'production' ? productionFormat : developmentFormat,
  }),
];

// Add file transport if specified
if (config.logging.file) {
  transports.push(
    new winston.transports.File({
      filename: config.logging.file,
      format: productionFormat,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  transports,
  exitOnError: false,
  // Don't log uncaught exceptions (we handle them manually)
  handleExceptions: false,
  handleRejections: false,
});

// Add request ID to logger context
export const createRequestLogger = (requestId: string) => {
  return logger.child({ requestId });
};

// Structured logging helpers
export const logRequest = (
  requestId: string,
  method: string,
  url: string,
  ip: string,
  userAgent?: string
) => {
  logger.info('Request received', {
    requestId,
    method,
    url,
    ip,
    userAgent,
    type: 'request',
  });
};

export const logResponse = (
  requestId: string,
  statusCode: number,
  responseTime: number,
  contentLength?: number
) => {
  logger.info('Request completed', {
    requestId,
    statusCode,
    responseTime,
    contentLength,
    type: 'response',
  });
};

export const logFaucetRequest = (
  requestId: string,
  walletAddress: string,
  amount: string,
  ip: string,
  success: boolean,
  transactionHash?: string,
  error?: string
) => {
  const logData = {
    requestId,
    walletAddress,
    amount,
    ip,
    success,
    type: 'faucet_request',
    ...(transactionHash && { transactionHash }),
    ...(error && { error }),
  };

  if (success) {
    logger.info('Faucet request successful', logData);
  } else {
    logger.warn('Faucet request failed', logData);
  }
};

export const logRateLimit = (
  requestId: string,
  ip: string,
  limitType: 'ip' | 'wallet' | 'global',
  walletAddress?: string
) => {
  logger.warn('Rate limit exceeded', {
    requestId,
    ip,
    walletAddress,
    limitType,
    type: 'rate_limit',
  });
};

export const logSuiTransaction = (
  requestId: string,
  transactionHash: string,
  fromAddress: string,
  toAddress: string,
  amount: string,
  gasUsed?: string
) => {
  logger.info('Sui transaction executed', {
    requestId,
    transactionHash,
    fromAddress,
    toAddress,
    amount,
    gasUsed,
    type: 'sui_transaction',
  });
};

export const logWalletBalance = (
  balance: string,
  threshold: string,
  isLow: boolean
) => {
  const logLevel = isLow ? 'warn' : 'info';
  logger[logLevel]('Wallet balance check', {
    balance,
    threshold,
    isLow,
    type: 'wallet_balance',
  });
};

export const logError = (
  error: Error,
  context?: Record<string, any>
) => {
  logger.error('Application error', {
    message: error.message,
    stack: error.stack,
    name: error.name,
    ...context,
    type: 'error',
  });
};

// Performance monitoring
export const logPerformance = (
  operation: string,
  duration: number,
  success: boolean,
  metadata?: Record<string, any>
) => {
  logger.info('Performance metric', {
    operation,
    duration,
    success,
    ...metadata,
    type: 'performance',
  });
};

// Health check logging
export const logHealthCheck = (
  component: string,
  status: 'healthy' | 'unhealthy',
  details?: Record<string, any>
) => {
  const logLevel = status === 'healthy' ? 'info' : 'error';
  logger[logLevel]('Health check', {
    component,
    status,
    ...details,
    type: 'health_check',
  });
};

// Security event logging
export const logSecurityEvent = (
  event: string,
  ip: string,
  severity: 'low' | 'medium' | 'high',
  details?: Record<string, any>
) => {
  logger.warn('Security event', {
    event,
    ip,
    severity,
    ...details,
    type: 'security',
  });
};

export default logger;
