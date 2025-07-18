import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, faucetRequestSchema, normalizeSuiAddress } from '../validation/schemas.js';
import { checkWalletRateLimit, trackSuccessfulWalletRequest } from '../middleware/rateLimiter.js';
import { requireApiKey } from '../middleware/apiKeyAuth.js';
import { suiService } from '../services/sui.js';
import { redisClient } from '../services/redis.js';
import { databaseService } from '../services/database.js';
import { config } from '../config/index.js';
import { logFaucetRequest, logger } from '../utils/logger.js';

const router = Router();

/**
 * @swagger
 * /api/v1/faucet/request:
 *   post:
 *     summary: Request SUI testnet tokens
 *     description: |
 *       Request SUI testnet tokens for development purposes.
 *
 *       **Rate Limits:**
 *       - 1 request per hour per wallet address
 *       - 100 requests per hour per IP address
 *
 *       **Amount:** 0.1 SUI per request (100,000,000 mist)
 *     tags: [Faucet]
 *     security:
 *       - ApiKeyAuth: []
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
 *           examples:
 *             example1:
 *               summary: Valid wallet address
 *               value:
 *                 walletAddress: "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
 *     responses:
 *       200:
 *         description: Tokens sent successfully
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
 *       429:
 *         description: Rate limit exceeded
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// Faucet request interface
interface FaucetRequestBody {
  walletAddress: string;
  amount?: string;
}

// Faucet response interface
interface FaucetResponse {
  success: boolean;
  transactionHash?: string;
  amount?: string;
  message: string;
  retryAfter?: number;
  walletAddress?: string;
  faucetAddress?: string;
  error?: {
    code: string;
    details?: string;
  };
}

// POST /api/v1/faucet/request - Request tokens from faucet (requires API key)
router.post('/request',
  requireApiKey,
  validate(faucetRequestSchema, 'body'),
  asyncHandler(async (req: Request<{}, FaucetResponse, FaucetRequestBody>, res: Response<FaucetResponse>) => {
    const { walletAddress, amount } = req.body;
    const requestId = req.requestId;
    const clientIP = req.ip || 'unknown';

    logger.info(`🔥 DEBUG: Faucet request started`, {
      requestId,
      walletAddress,
      amount,
      ip: clientIP,
    });

    // Normalize wallet address
    const normalizedAddress = normalizeSuiAddress(walletAddress);

    logger.info(`🔥 DEBUG: Address normalized`, {
      requestId,
      original: walletAddress,
      normalized: normalizedAddress,
    });

    logger.info(`Faucet request received`, {
      requestId,
      walletAddress: normalizedAddress,
      amount: amount || config.sui.defaultAmount,
      ip: clientIP,
    });

    try {
      logger.info(`🔥 DEBUG: Checking wallet rate limit`, { requestId, normalizedAddress });

      // Check wallet-specific rate limit
      await checkWalletRateLimit(normalizedAddress, requestId);

      logger.info(`🔥 DEBUG: Rate limit check passed`, { requestId });

      // Determine amount to send
      const amountToSend = amount ? BigInt(amount) : BigInt(config.sui.defaultAmount);

      // Check if Sui service is ready
      if (!suiService.isReady) {
        throw new Error('Sui service is not ready');
      }

      // Check faucet wallet balance
      const walletInfo = await suiService.getWalletInfo();
      if (walletInfo.isLowBalance) {
        logger.warn('Faucet wallet balance is low', {
          requestId,
          balance: walletInfo.balance.toString(),
          minBalance: config.sui.minWalletBalance,
        });

        return res.status(503).json({
          success: false,
          message: '💰 Faucet is temporarily out of funds. Please try again later.',
          error: {
            code: 'INSUFFICIENT_FAUCET_BALANCE',
            details: 'The faucet wallet needs to be refunded',
          },
        });
      }

      // Send tokens
      const result = await suiService.sendTokens(normalizedAddress, amountToSend, requestId);

      if (result.success && result.transactionHash) {
        // Track successful wallet request for rate limiting
        await trackSuccessfulWalletRequest(normalizedAddress);

        // Track successful request metrics
        await redisClient.incrementMetric('requests_total');
        await redisClient.incrementMetric('requests_success');
        await redisClient.trackRequest(requestId, {
          walletAddress: normalizedAddress,
          amount: amountToSend.toString(),
          transactionHash: result.transactionHash,
          timestamp: Date.now(),
          status: 'success',
          ip: clientIP,
        });

        // Log successful request
        logFaucetRequest(
          requestId,
          normalizedAddress,
          amountToSend.toString(),
          clientIP,
          true,
          result.transactionHash
        );

        // Save transaction to database
        try {
          await databaseService.saveTransaction({
            request_id: requestId,
            wallet_address: normalizedAddress,
            amount: amountToSend.toString(),
            transaction_hash: result.transactionHash,
            status: 'success',
            ip_address: clientIP,
            user_agent: req.get('User-Agent') || 'unknown',
            created_at: new Date().toISOString(),
          });
        } catch (dbError: any) {
          logger.error('Failed to save transaction to database', {
            requestId,
            error: dbError.message,
          });
        }

        const amountInSui = Number(amountToSend) / 1_000_000_000;

        return res.status(200).json({
          success: true,
          transactionHash: result.transactionHash,
          amount: amountToSend.toString(),
          message: `✅ Successfully sent ${amountInSui} SUI to ${normalizedAddress}`,
          walletAddress: normalizedAddress,
          faucetAddress: suiService.faucetAddress,
        });

      } else {
        // Track failed request
        await redisClient.incrementMetric('requests_total');
        await redisClient.incrementMetric('requests_failed');
        await redisClient.trackRequest(requestId, {
          walletAddress: normalizedAddress,
          amount: amountToSend.toString(),
          timestamp: Date.now(),
          status: 'failed',
          error: result.error,
          ip: clientIP,
        });

        // Log failed request
        logFaucetRequest(
          requestId,
          normalizedAddress,
          amountToSend.toString(),
          clientIP,
          false,
          undefined,
          result.error
        );

        // Save failed transaction to database
        try {
          await databaseService.saveTransaction({
            request_id: requestId,
            wallet_address: normalizedAddress,
            amount: amountToSend.toString(),
            transaction_hash: 'failed',
            status: 'failed',
            error_message: result.error || 'Unknown error',
            ip_address: clientIP,
            user_agent: req.get('User-Agent') || 'unknown',
            created_at: new Date().toISOString(),
          });
        } catch (dbError: any) {
          logger.error('Failed to save failed transaction to database', {
            requestId,
            error: dbError.message,
          });
        }

        return res.status(500).json({
          success: false,
          message: `❌ Faucet request failed: ${result.error || 'Unknown error occurred'}`,
          walletAddress: normalizedAddress,
          error: {
            code: 'FAUCET_TRANSACTION_FAILED',
            ...(result.error && { details: result.error }),
          },
        });
      }

    } catch (error: any) {
      // Track failed request
      await redisClient.incrementMetric('requests_total');
      await redisClient.incrementMetric('requests_failed');

      // Log failed request
      logFaucetRequest(
        requestId,
        normalizedAddress,
        amount || config.sui.defaultAmount,
        clientIP,
        false,
        undefined,
        error.message
      );

      // Handle rate limit errors
      if (error.name === 'RateLimitError') {
        return res.status(429).json({
          success: false,
          message: `🚫 ${error.message}`,
          retryAfter: error.retryAfter,
          walletAddress: normalizedAddress,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            details: `Please wait ${error.retryAfter} seconds before requesting again`,
          },
        });
      }

      // Handle other errors
      logger.error('Faucet request failed', {
        requestId,
        error: error.message,
        stack: error.stack,
        walletAddress: normalizedAddress,
      });

      return res.status(500).json({
        success: false,
        message: 'Internal server error occurred while processing faucet request',
        walletAddress: normalizedAddress,
      });
    }
  })
);

// GET /api/v1/faucet/status - Get faucet status
router.get('/status', 
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const walletInfo = await suiService.getWalletInfo();
      const networkInfo = suiService.networkInfo;

      const status = {
        faucetAddress: walletInfo.address,
        network: networkInfo.network,
        rpcUrl: networkInfo.rpcUrl,
        balance: walletInfo.balance.toString(),
        balanceSui: Number(walletInfo.balance) / 1_000_000_000,
        isLowBalance: walletInfo.isLowBalance,
        defaultAmount: config.sui.defaultAmount,
        defaultAmountSui: Number(config.sui.defaultAmount) / 1_000_000_000,
        maxAmount: config.sui.maxAmount,
        maxAmountSui: Number(config.sui.maxAmount) / 1_000_000_000,
        rateLimits: {
          windowMs: config.rateLimits.windowMs,
          maxRequestsPerWallet: config.rateLimits.maxRequestsPerWallet,
          maxRequestsPerIP: config.rateLimits.maxRequestsPerIP,
        },
        isOperational: suiService.isReady && !walletInfo.isLowBalance,
      };

      res.json({
        success: true,
        data: status,
      });

    } catch (error: any) {
      logger.error('Failed to get faucet status', {
        error: error.message,
        requestId: req.requestId,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve faucet status',
      });
    }
  })
);

// GET /api/v1/faucet/info - Get basic faucet information (public endpoint)
router.get('/info', 
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const networkInfo = suiService.networkInfo;

      const info = {
        network: networkInfo.network,
        faucetAddress: networkInfo.walletAddress,
        defaultAmountSui: Number(config.sui.defaultAmount) / 1_000_000_000,
        maxAmountSui: Number(config.sui.maxAmount) / 1_000_000_000,
        rateLimitWindowHours: config.rateLimits.windowMs / (1000 * 60 * 60),
        endpoints: {
          request: '/api/v1/faucet/request',
          status: '/api/v1/faucet/status',
          health: '/api/v1/health',
        },
      };

      res.json({
        success: true,
        data: info,
      });

    } catch (error: any) {
      logger.error('Failed to get faucet info', {
        error: error.message,
        requestId: req.requestId,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve faucet information',
      });
    }
  })
);

export { router as faucetRoutes };
