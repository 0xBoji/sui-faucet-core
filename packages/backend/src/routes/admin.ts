import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../validation/schemas.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import { suiService } from '../services/sui.js';
import { redisClient } from '../services/redis.js';
import { databaseService } from '../services/database.js';
import Joi from 'joi';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { rateLimitAdminRoutes } from './rateLimitAdmin.js';

const router = Router();

/**
 * @swagger
 * /api/v1/admin/login:
 *   post:
 *     summary: Admin login
 *     description: Authenticate admin user and get access token
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: "admin"
 *               password:
 *                 type: string
 *                 example: ""
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         token:
 *                           type: string
 *                           example: "YWRtaW5fMTc1MjgxODQzMDY2NF8wLjI2NTM2ODYyOTYyMTIyMzY1"
 *                         expiresIn:
 *                           type: string
 *                           example: "24h"
 *                         user:
 *                           type: object
 *                           properties:
 *                             username:
 *                               type: string
 *                               example: "admin"
 *                             role:
 *                               type: string
 *                               example: "super_admin"
 *                             lastLogin:
 *                               type: string
 *                               format: date-time
 *       401:
 *         description: Invalid credentials
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/v1/admin/dashboard:
 *   get:
 *     summary: Get admin dashboard data
 *     description: Get system overview including wallet balance, statistics, and health status
 *     tags: [Admin]
 *     security:
 *       - AdminAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         system:
 *                           type: object
 *                           properties:
 *                             status:
 *                               type: string
 *                               example: "healthy"
 *                             uptime:
 *                               type: string
 *                               example: "2h 30m"
 *                             version:
 *                               type: string
 *                               example: "1.0.0"
 *                         wallet:
 *                           type: object
 *                           properties:
 *                             address:
 *                               $ref: '#/components/schemas/WalletAddress'
 *                             balance:
 *                               $ref: '#/components/schemas/Amount'
 *                             network:
 *                               type: string
 *                               example: "testnet"
 *                         stats:
 *                           type: object
 *                           properties:
 *                             redis:
 *                               type: object
 *                               properties:
 *                                 totalRequests:
 *                                   type: number
 *                                   example: 150
 *                                 successfulRequests:
 *                                   type: number
 *                                   example: 145
 *                                 failedRequests:
 *                                   type: number
 *                                   example: 5
 *                                 successRate:
 *                                   type: string
 *                                   example: "96.67%"
 *                             database:
 *                               type: object
 *                               properties:
 *                                 totalTransactions:
 *                                   type: number
 *                                   example: 145
 *                                 successfulTransactions:
 *                                   type: number
 *                                   example: 140
 *                                 failedTransactions:
 *                                   type: number
 *                                   example: 5
 *                                 totalAmountDistributed:
 *                                   $ref: '#/components/schemas/Amount'
 *                                 successRate:
 *                                   type: string
 *                                   example: "96.55%"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Admin login schema
const adminLoginSchema = Joi.object({
  username: Joi.string().required(),
  password: Joi.string().required(),
});

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || (config as any).jwtSecret || 'changeme';
const JWT_EXPIRES_IN = '24h';

// Blacklisted tokens (for logout/revocation)
const blacklistedTokens = new Set<string>();

// Active admin tokens (for session management)
const adminTokens = new Set<string>();

// Generate secure admin JWT token
const generateAdminToken = (user: any): string => {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'sui-faucet-admin',
      audience: 'sui-faucet-api'
    }
  );
};

// Verify JWT token
const verifyAdminToken = (token: string): any => {
  try {
    if (blacklistedTokens.has(token)) {
      throw new Error('Token has been revoked');
    }

    return jwt.verify(token, JWT_SECRET, {
      issuer: 'sui-faucet-admin',
      audience: 'sui-faucet-api'
    });
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

// Admin authentication middleware
const adminAuth = (req: Request, res: Response, next: any) => {
  // Allow Discord bot with API key to access admin endpoints
  const apiKey = req.get('X-API-Key');
  const userAgent = req.get('User-Agent') || '';

  if (apiKey === config.auth.apiKey && userAgent.includes('axios')) {
    return next();
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '🚫 Admin authentication required. Please login first.',
      error: {
        code: 'ADMIN_AUTH_REQUIRED',
        details: 'Use POST /api/v1/admin/login to get access token',
      },
    });
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  if (!adminTokens.has(token)) {
    return res.status(401).json({
      success: false,
      message: '🚫 Invalid or expired admin token',
      error: {
        code: 'INVALID_ADMIN_TOKEN',
        details: 'Please login again to get a new token',
      },
    });
  }

  next();
};

// POST /api/v1/admin/login - Admin login
router.post('/login',
  validate(adminLoginSchema, 'body'),
  asyncHandler(async (req: Request, res: Response): Promise<any> => {
    const { username, password } = req.body;
    const requestId = req.requestId;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

    try {
      // Authenticate admin user from database
      const adminUser = await databaseService.authenticateAdmin(username, password);

      if (adminUser) {
        // Generate new admin token
        const token = generateAdminToken(adminUser);
        adminTokens.add(token);

        // Log admin activity
        await databaseService.saveAdminActivity({
          admin_username: username,
          action: 'login',
          details: 'Admin login successful',
          ip_address: clientIP,
          created_at: new Date().toISOString(),
        });

        logger.info(`✅ Admin login successful`, { requestId, username, role: adminUser.role });

        return res.status(200).json({
          success: true,
          message: '🎉 Admin login successful! Welcome to Sui Faucet Admin.',
          data: {
            token,
            expiresIn: '24h',
            user: {
              username: adminUser.username,
              role: adminUser.role,
              lastLogin: adminUser.last_login,
            },
          },
          timestamp: new Date().toISOString(),
        });
      } else {
        // Log failed login attempt
        await databaseService.saveAdminActivity({
          admin_username: username,
          action: 'login_failed',
          details: 'Invalid credentials provided',
          ip_address: clientIP,
          created_at: new Date().toISOString(),
        });

        logger.warn(`❌ Admin login failed`, { requestId, username });

        return res.status(401).json({
          success: false,
          message: '🚫 Invalid admin credentials',
          error: {
            code: 'INVALID_CREDENTIALS',
            details: 'Please check your username and password',
          },
        });
      }
    } catch (error: any) {
      logger.error('Admin login error', { error: error.message, requestId, username });

      return res.status(500).json({
        success: false,
        message: '❌ Login failed due to server error',
        error: { code: 'SERVER_ERROR' },
      });
    }
  })
);

// POST /api/v1/admin/logout - Admin logout
router.post('/logout',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.substring(7); // Remove 'Bearer ' prefix
    const requestId = req.requestId;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

    if (token) {
      adminTokens.delete(token);

      // Log admin activity
      try {
        await databaseService.saveAdminActivity({
          admin_username: 'admin', // We could store username in token for better tracking
          action: 'logout',
          details: 'Admin logout successful',
          ip_address: clientIP,
          created_at: new Date().toISOString(),
        });
      } catch (error: any) {
        logger.error('Failed to log admin logout activity', { error: error.message });
      }

      logger.info(`✅ Admin logout successful`, { requestId });
    }

    return res.status(200).json({
      success: true,
      message: '👋 Admin logout successful',
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/v1/admin/me - Get current admin info
router.get('/me',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;

    try {
      // Get admin user from database
      const adminUser = await databaseService.getAdminUser(config.auth.adminUsername);

      if (!adminUser) {
        return res.status(404).json({
          success: false,
          message: '🚫 Admin user not found',
          error: { code: 'USER_NOT_FOUND' },
        });
      }

      logger.info(`Admin info requested`, { requestId, username: adminUser.username });

      return res.status(200).json({
        success: true,
        data: {
          user: {
            username: adminUser.username,
            role: adminUser.role,
            email: adminUser.email,
            lastLogin: adminUser.last_login,
            createdAt: adminUser.created_at,
          },
          permissions: [
            'view_dashboard',
            'view_health',
            'clear_cache',
            'view_logs',
            'view_transactions',
            'view_activities',
            ...(adminUser.role === 'super_admin' ? ['manage_users', 'system_config'] : []),
          ],
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      logger.error('Failed to get admin info', { error: error.message, requestId });

      return res.status(500).json({
        success: false,
        message: '❌ Failed to get admin info',
        error: { code: 'SERVER_ERROR' },
      });
    }
  })
);

// GET /api/v1/admin/dashboard - Admin dashboard data
router.get('/dashboard', 
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;
    
    try {
      // Get system stats
      const [
        walletBalance,
        totalRequests,
        successfulRequests,
        failedRequests,
        dbStats,
      ] = await Promise.all([
        suiService.getWalletBalance(),
        redisClient.getMetric('requests_total'),
        redisClient.getMetric('requests_success'),
        redisClient.getMetric('requests_failed'),
        databaseService.getTransactionStats(),
      ]);

      const successRate = totalRequests > 0 ? (successfulRequests / totalRequests * 100).toFixed(2) : '0';
      
      logger.info(`Admin dashboard accessed`, { requestId });
      
      return res.status(200).json({
        success: true,
        data: {
          system: {
            status: 'operational',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
          },
          faucet: {
            walletAddress: suiService.faucetAddress,
            balance: {
              mist: walletBalance.toString(),
              sui: (Number(walletBalance) / 1_000_000_000).toFixed(6),
            },
            network: config.sui.network,
            rpcUrl: config.sui.rpcUrl,
          },
          stats: {
            // Redis metrics (real-time)
            redis: {
              totalRequests: totalRequests || 0,
              successfulRequests: successfulRequests || 0,
              failedRequests: failedRequests || 0,
              successRate: `${successRate}%`,
            },
            // Database metrics (persistent)
            database: {
              totalTransactions: dbStats.total,
              successfulTransactions: dbStats.successful,
              failedTransactions: dbStats.failed,
              totalAmountDistributed: {
                mist: dbStats.totalAmount,
                sui: (Number(dbStats.totalAmount) / 1_000_000_000).toFixed(6),
              },
              successRate: dbStats.total > 0 ? `${(dbStats.successful / dbStats.total * 100).toFixed(2)}%` : '0%',
            },
          },
          config: {
            defaultAmount: {
              mist: config.sui.defaultAmount,
              sui: (Number(config.sui.defaultAmount) / 1_000_000_000).toFixed(1),
            },
            maxAmount: {
              mist: config.sui.maxAmount,
              sui: (Number(config.sui.maxAmount) / 1_000_000_000).toFixed(1),
            },
            rateLimits: {
              windowMs: config.rateLimits.windowMs,
              maxPerWallet: config.rateLimits.maxRequestsPerWallet,
              maxPerIP: config.rateLimits.maxRequestsPerIP,
            },
          },
        },
      });
      
    } catch (error: any) {
      logger.error('Admin dashboard error', { error: error.message, requestId });
      
      return res.status(500).json({
        success: false,
        message: '❌ Failed to load dashboard data',
        error: { code: 'DASHBOARD_ERROR', details: error.message },
      });
    }
  })
);

// GET /api/v1/admin/health - Detailed health check for admin
router.get('/health',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;
    
    try {
      // Check all services
      const suiHealth = await suiService.healthCheck();
      const redisHealth = await redisClient.healthCheck();
      
      const overallStatus = suiHealth.status === 'healthy' && redisHealth.status === 'healthy' 
        ? 'healthy' : 'unhealthy';
      
      logger.info(`Admin health check`, { requestId, status: overallStatus });
      
      return res.status(200).json({
        success: true,
        data: {
          status: overallStatus,
          timestamp: new Date().toISOString(),
          services: {
            sui: suiHealth,
            redis: redisHealth,
          },
          system: {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
          },
        },
      });
      
    } catch (error: any) {
      logger.error('Admin health check error', { error: error.message, requestId });
      
      return res.status(500).json({
        success: false,
        message: '❌ Health check failed',
        error: { code: 'HEALTH_CHECK_ERROR', details: error.message },
      });
    }
  })
);

// POST /api/v1/admin/clear-cache - Clear Redis cache
router.post('/clear-cache',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;
    
    try {
      await redisClient.clearAll();
      
      logger.info(`✅ Admin cleared cache`, { requestId });
      
      return res.status(200).json({
        success: true,
        message: '✅ Cache cleared successfully',
        timestamp: new Date().toISOString(),
      });
      
    } catch (error: any) {
      logger.error('Admin clear cache error', { error: error.message, requestId });
      
      return res.status(500).json({
        success: false,
        message: '❌ Failed to clear cache',
        error: { code: 'CLEAR_CACHE_ERROR', details: error.message },
      });
    }
  })
);

// GET /api/v1/admin/transactions - Get recent transactions
router.get('/transactions',
  adminAuth,
  asyncHandler(async (req: Request, res: Response): Promise<any> => {
    const requestId = req.requestId;
    const limit = parseInt(req.query['limit'] as string) || 50;
    const offset = parseInt(req.query['offset'] as string) || 0;

    try {
      const transactions = await databaseService.getTransactions(limit, offset);

      logger.info(`Admin transactions viewed`, { requestId, limit, offset });

      return res.status(200).json({
        success: true,
        data: {
          transactions,
          pagination: {
            limit,
            offset,
            total: transactions.length,
          },
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Failed to get transactions', {
        error: error.message,
        requestId,
      });

      res.status(500).json({
        success: false,
        message: '❌ Failed to retrieve transactions',
        error: { code: 'DATABASE_ERROR' },
      });
    }
  })
);

// GET /api/v1/admin/activities - Get admin activities
router.get('/activities',
  adminAuth,
  asyncHandler(async (req: Request, res: Response): Promise<any> => {
    const requestId = req.requestId;
    const limit = parseInt(req.query['limit'] as string) || 50;

    try {
      const activities = await databaseService.getAdminActivities(limit);

      logger.info(`Admin activities viewed`, { requestId, limit });

      return res.status(200).json({
        success: true,
        data: {
          activities,
          total: activities.length,
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Failed to get admin activities', {
        error: error.message,
        requestId,
      });

      res.status(500).json({
        success: false,
        message: '❌ Failed to retrieve admin activities',
        error: { code: 'DATABASE_ERROR' },
      });
    }
  })
);

/**
 * @swagger
 * /api/v1/admin/faucet:
 *   get:
 *     summary: Get faucet wallet information
 *     description: Get complete information about the faucet wallet including balance, configuration, and status
 *     tags: [Admin Faucet]
 *     security:
 *       - AdminAuth: []
 *     responses:
 *       200:
 *         description: Faucet wallet information
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         wallet:
 *                           type: object
 *                           properties:
 *                             address:
 *                               $ref: '#/components/schemas/WalletAddress'
 *                             balance:
 *                               $ref: '#/components/schemas/Amount'
 *                             network:
 *                               type: string
 *                               example: "testnet"
 *                             rpcUrl:
 *                               type: string
 *                               example: "https://fullnode.testnet.sui.io:443"
 *                         config:
 *                           type: object
 *                           properties:
 *                             defaultAmount:
 *                               $ref: '#/components/schemas/Amount'
 *                             maxAmount:
 *                               $ref: '#/components/schemas/Amount'
 *                         status:
 *                           type: object
 *                           properties:
 *                             isActive:
 *                               type: boolean
 *                               example: true
 *                             lowBalanceWarning:
 *                               type: boolean
 *                               example: false
 *                             minimumBalance:
 *                               $ref: '#/components/schemas/Amount'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/v1/admin/faucet/balance:
 *   get:
 *     summary: Get real-time faucet balance
 *     description: Get the current balance of the faucet wallet
 *     tags: [Admin Faucet]
 *     security:
 *       - AdminAuth: []
 *     responses:
 *       200:
 *         description: Current faucet balance
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         address:
 *                           $ref: '#/components/schemas/WalletAddress'
 *                         balance:
 *                           $ref: '#/components/schemas/Amount'
 *                         network:
 *                           type: string
 *                           example: "testnet"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/v1/admin/faucet/stats:
 *   get:
 *     summary: Get faucet usage statistics
 *     description: Get detailed statistics about faucet usage including daily breakdown
 *     tags: [Admin Faucet]
 *     security:
 *       - AdminAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *           minimum: 1
 *           maximum: 30
 *         description: Number of days to include in statistics
 *     responses:
 *       200:
 *         description: Faucet usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         overview:
 *                           type: object
 *                           properties:
 *                             totalTransactions:
 *                               type: number
 *                               example: 150
 *                             successfulTransactions:
 *                               type: number
 *                               example: 145
 *                             failedTransactions:
 *                               type: number
 *                               example: 5
 *                             totalDistributed:
 *                               $ref: '#/components/schemas/Amount'
 *                             successRate:
 *                               type: string
 *                               example: "96.67%"
 *                         dailyStats:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               date:
 *                                 type: string
 *                                 format: date
 *                                 example: "2025-07-17"
 *                               transactions:
 *                                 type: number
 *                                 example: 25
 *                               successfulTransactions:
 *                                 type: number
 *                                 example: 24
 *                               totalAmount:
 *                                 $ref: '#/components/schemas/Amount'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/v1/admin/faucet/test:
 *   post:
 *     summary: Test faucet transaction
 *     description: Send a test transaction from the faucet (admin only)
 *     tags: [Admin Faucet]
 *     security:
 *       - AdminAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - walletAddress
 *             properties:
 *               walletAddress:
 *                 $ref: '#/components/schemas/WalletAddress'
 *               amount:
 *                 type: string
 *                 example: "100000000"
 *                 description: "Amount in mist (optional, uses default if not provided)"
 *     responses:
 *       200:
 *         description: Test transaction successful
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         transactionHash:
 *                           $ref: '#/components/schemas/TransactionHash'
 *                         amount:
 *                           $ref: '#/components/schemas/Amount'
 *                         walletAddress:
 *                           $ref: '#/components/schemas/WalletAddress'
 *                         network:
 *                           type: string
 *                           example: "testnet"
 *                         explorerUrl:
 *                           type: string
 *                           example: "https://suiscan.xyz/testnet/tx/5AbRLKAT9cr66TNEvpGwbz4teVDSJc7qZcuDGuukDa69"
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Transaction failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// GET /api/v1/admin/faucet - Get faucet wallet information
router.get('/faucet',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;

    try {
      // Get faucet wallet balance
      const balance = await suiService.getWalletBalance();

      // Log admin activity
      await databaseService.saveAdminActivity({
        admin_username: 'admin', // Could be extracted from token
        action: 'view_faucet_info',
        details: 'Viewed faucet wallet information',
        ip_address: req.ip || req.connection.remoteAddress || 'unknown',
        created_at: new Date().toISOString(),
      });

      logger.info(`Admin viewed faucet info`, { requestId });

      return res.status(200).json({
        success: true,
        data: {
          wallet: {
            address: suiService.faucetAddress,
            balance: {
              mist: balance.toString(),
              sui: (Number(balance) / 1_000_000_000).toFixed(6),
            },
            network: config.sui.network,
            rpcUrl: config.sui.rpcUrl,
          },
          config: {
            defaultAmount: {
              mist: config.sui.defaultAmount,
              sui: (Number(config.sui.defaultAmount) / 1_000_000_000).toFixed(1),
            },
            maxAmount: {
              mist: config.sui.maxAmount,
              sui: (Number(config.sui.maxAmount) / 1_000_000_000).toFixed(1),
            },
          },
          status: {
            isActive: Number(balance) > Number(config.sui.defaultAmount),
            lowBalanceWarning: Number(balance) < Number(config.sui.defaultAmount) * 10,
            minimumBalance: {
              mist: (Number(config.sui.defaultAmount) * 10).toString(),
              sui: (Number(config.sui.defaultAmount) * 10 / 1_000_000_000).toFixed(1),
            },
          },
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Failed to get faucet info', {
        error: error.message,
        requestId,
      });

      res.status(500).json({
        success: false,
        message: '❌ Failed to retrieve faucet information',
        error: { code: 'SERVER_ERROR' },
      });
    }
  })
);

// GET /api/v1/admin/faucet/balance - Get real-time faucet balance
router.get('/faucet/balance',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;

    try {
      const balance = await suiService.getWalletBalance();

      logger.info(`Admin checked faucet balance`, { requestId, balance: balance.toString() });

      return res.status(200).json({
        success: true,
        data: {
          address: suiService.faucetAddress,
          balance: {
            mist: balance.toString(),
            sui: (Number(balance) / 1_000_000_000).toFixed(6),
          },
          network: config.sui.network,
          timestamp: new Date().toISOString(),
        },
      });

    } catch (error: any) {
      logger.error('Failed to get faucet balance', {
        error: error.message,
        requestId,
      });

      res.status(500).json({
        success: false,
        message: '❌ Failed to retrieve faucet balance',
        error: { code: 'SERVER_ERROR' },
      });
    }
  })
);

// GET /api/v1/admin/faucet/stats - Get faucet usage statistics
router.get('/faucet/stats',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;
    const days = parseInt(req.query['days'] as string) || 7;

    try {
      // Get database stats
      const dbStats = await databaseService.getTransactionStats();

      // Get recent transactions for trend analysis
      const recentTransactions = await databaseService.getTransactions(100, 0);

      // Calculate daily distribution
      const now = new Date();
      const dailyStats = [];

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const dayTransactions = recentTransactions.filter(tx => {
          const txDate = new Date(tx.created_at);
          return txDate >= date && txDate < nextDate;
        });

        const dayAmount = dayTransactions.reduce((sum, tx) =>
          sum + (tx.status === 'success' ? Number(tx.amount) : 0), 0
        );

        dailyStats.push({
          date: date.toISOString().split('T')[0],
          transactions: dayTransactions.length,
          successfulTransactions: dayTransactions.filter(tx => tx.status === 'success').length,
          totalAmount: {
            mist: dayAmount.toString(),
            sui: (dayAmount / 1_000_000_000).toFixed(6),
          },
        });
      }

      logger.info(`Admin viewed faucet stats`, { requestId, days });

      return res.status(200).json({
        success: true,
        data: {
          overview: {
            totalTransactions: dbStats.total,
            successfulTransactions: dbStats.successful,
            failedTransactions: dbStats.failed,
            totalDistributed: {
              mist: dbStats.totalAmount,
              sui: (Number(dbStats.totalAmount) / 1_000_000_000).toFixed(6),
            },
            successRate: dbStats.total > 0 ? `${(dbStats.successful / dbStats.total * 100).toFixed(2)}%` : '0%',
          },
          dailyStats,
          period: {
            days,
            from: dailyStats[0]?.date,
            to: dailyStats[dailyStats.length - 1]?.date,
          },
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('Failed to get faucet stats', {
        error: error.message,
        requestId,
      });

      res.status(500).json({
        success: false,
        message: '❌ Failed to retrieve faucet statistics',
        error: { code: 'SERVER_ERROR' },
      });
    }
  })
);

// POST /api/v1/admin/faucet/test - Test faucet transaction (admin only)
router.post('/faucet/test',
  adminAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;
    const { walletAddress, amount } = req.body;
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

    try {
      // Validate wallet address
      if (!walletAddress || typeof walletAddress !== 'string') {
        return res.status(400).json({
          success: false,
          message: '❌ Valid wallet address is required',
          error: { code: 'INVALID_WALLET_ADDRESS' },
        });
      }

      // Validate amount (optional, use default if not provided)
      const testAmount = amount ? amount.toString() : config.sui.defaultAmount;

      if (Number(testAmount) <= 0 || Number(testAmount) > Number(config.sui.maxAmount)) {
        return res.status(400).json({
          success: false,
          message: `❌ Amount must be between 0 and ${Number(config.sui.maxAmount) / 1_000_000_000} SUI`,
          error: { code: 'INVALID_AMOUNT' },
        });
      }

      // Execute test transaction
      const result = await suiService.sendTokens(walletAddress, testAmount, requestId);

      // Save to database
      await databaseService.saveTransaction({
        request_id: requestId || 'admin-test',
        wallet_address: walletAddress,
        amount: testAmount,
        transaction_hash: result.transactionHash || '',
        status: 'success',
        ip_address: clientIP,
        user_agent: req.get('User-Agent') || 'unknown',
        created_at: new Date().toISOString(),
      });

      // Log admin activity
      await databaseService.saveAdminActivity({
        admin_username: 'admin',
        action: 'test_transaction',
        details: `Test transaction sent: ${Number(testAmount) / 1_000_000_000} SUI to ${walletAddress}`,
        ip_address: clientIP,
        created_at: new Date().toISOString(),
      });

      logger.info(`Admin test transaction successful`, {
        requestId,
        walletAddress,
        amount: testAmount,
        transactionHash: result.transactionHash
      });

      return res.status(200).json({
        success: true,
        message: '🎉 Test transaction successful!',
        data: {
          transactionHash: result.transactionHash,
          amount: {
            mist: testAmount,
            sui: (Number(testAmount) / 1_000_000_000).toFixed(6),
          },
          walletAddress,
          network: config.sui.network,
          explorerUrl: result.transactionHash ? `https://suiscan.xyz/testnet/tx/${result.transactionHash}` : null,
        },
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      // Save failed transaction
      if (walletAddress) {
        await databaseService.saveTransaction({
          request_id: requestId || 'admin-test-failed',
          wallet_address: walletAddress,
          amount: amount?.toString() || config.sui.defaultAmount,
          transaction_hash: '',
          status: 'failed',
          error_message: error.message,
          ip_address: clientIP,
          user_agent: req.get('User-Agent') || 'unknown',
          created_at: new Date().toISOString(),
        });
      }

      logger.error('Admin test transaction failed', {
        error: error.message,
        requestId,
        walletAddress,
      });

      res.status(500).json({
        success: false,
        message: '❌ Test transaction failed',
        error: {
          code: 'TRANSACTION_FAILED',
          details: error.message,
        },
      });
    }
  })
);

// Mount rate limit admin routes
router.use('/', rateLimitAdminRoutes);

export { router as adminRoutes };
