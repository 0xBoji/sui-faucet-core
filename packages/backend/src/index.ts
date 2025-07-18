import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { logger } from './utils/logger.js';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { rateLimiter } from './middleware/rateLimiter.js';
import { faucetRoutes } from './routes/faucet.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { redisClient } from './services/redis.js';
import { suiService } from './services/sui.js';
import { databaseService } from './services/database.js';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: config.server.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Basic request logging
app.use((req, res, next) => {
  const requestId = Math.random().toString(36).substring(2, 15);
  req.requestId = requestId;
  logger.info(`Request received`, {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

// Rate limiting
app.use(rateLimiter);

// API routes
app.use('/api/v1/faucet', faucetRoutes);
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/admin', adminRoutes);

// Root endpoint
app.get('/', (_req, res) => {
  res.json({
    name: 'Sui Testnet Faucet API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      faucet: '/api/v1/faucet/request',
      health: '/api/v1/health',
      auth: '/api/v1/auth/verify',
      admin: '/api/v1/admin/login',
    },
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await redisClient.disconnect();
      logger.info('Redis connection closed');

      await suiService.disconnect();
      logger.info('Sui service disconnected');

      await databaseService.disconnect();
      logger.info('Database disconnected');

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Initialize services and start server
async function startServer() {
  try {
    // Initialize Redis connection
    await redisClient.connect();
    logger.info('Redis connected successfully');

    // Initialize Sui service
    await suiService.initialize();
    logger.info('Sui service initialized successfully');

    // Initialize Database
    await databaseService.connect();
    await databaseService.initialize();
    logger.info('Database initialized successfully');

    // Start HTTP server
    server.listen(config.server.port, () => {
      logger.info(`🚀 Sui Faucet API server running on port ${config.server.port}`);
      logger.info(`📊 Health check: http://localhost:${config.server.port}/api/v1/health`);
      logger.info(`💧 Faucet endpoint: http://localhost:${config.server.port}/api/v1/faucet/request`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

// Start the server
startServer();