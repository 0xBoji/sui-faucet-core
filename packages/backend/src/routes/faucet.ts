import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, faucetRequestSchema, normalizeSuiAddress } from '../validation/schemas.js';
import { checkWalletRateLimit, trackSuccessfulWalletRequest } from '../middleware/rateLimiter.js';
import { requireApiKey } from '../middleware/apiKeyAuth.js'; // API key required for security
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
  address?: string;
  walletAddress?: string;
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

// TEST ROUTE - Simple faucet without validation or asyncHandler
router.post('/test', (req: Request, res: Response) => {
  console.log('🔥 DEBUG: Test route hit!');
  console.log('🔥 DEBUG: Request body:', req.body);

  res.json({
    success: true,
    message: 'Test route working!',
    body: req.body
  });
});

// SIMPLE TEST ROUTE - Just return OK
router.get('/simple', (_req: Request, res: Response) => {
  console.log('🔥 DEBUG: Simple route hit!');
  res.json({ message: 'Simple route OK!' });
});

// POST /api/v1/faucet/request - Request tokens from faucet (requires API key)
router.post('/request',
  requireApiKey, // API key required for security
  validate(faucetRequestSchema, 'body'), // Validation enabled
  asyncHandler(async (req: Request<{}, FaucetResponse, FaucetRequestBody>, res: Response<FaucetResponse>) => {
    console.log('🔥 DEBUG: Faucet request handler started');
    console.log('🔥 DEBUG: Request body:', req.body);

    const { address, walletAddress, amount } = req.body;
    const requestId = req.requestId || 'unknown';
    const clientIP = req.ip || 'unknown';

    console.log('🔥 DEBUG: Extracted values:', { address, walletAddress, amount, requestId, clientIP });

    // Use either address or walletAddress (validation ensures at least one exists)
    const inputAddress = address || walletAddress;
    if (!inputAddress) {
      console.log('🔥 DEBUG: No address provided');
      return res.status(400).json({
        success: false,
        message: 'Either "address" or "walletAddress" field is required',
        error: { code: 'MISSING_ADDRESS' }
      });
    }

    console.log('🔥 DEBUG: Input address:', inputAddress);

    logger.info(`🔥 DEBUG: Faucet request started`, {
      requestId,
      address: inputAddress,
      amount,
      ip: clientIP,
    });

    // Normalize wallet address
    const normalizedAddress = normalizeSuiAddress(inputAddress);

    if (!normalizedAddress) {
      return res.status(400).json({
        success: false,
        message: 'Invalid wallet address format',
        error: { code: 'INVALID_ADDRESS' }
      });
    }

    // At this point, normalizedAddress is guaranteed to be a non-empty string
    const validAddress = normalizedAddress as string;

    logger.info(`🔥 DEBUG: Address normalized`, {
      requestId,
      original: inputAddress,
      normalized: validAddress,
    });

    logger.info(`Faucet request received`, {
      requestId,
      walletAddress: validAddress,
      amount: amount || config.sui.defaultAmount,
      ip: clientIP,
    });

    try {
      logger.info(`🔥 DEBUG: Checking wallet rate limit`, { requestId, normalizedAddress: validAddress });

      // Check wallet-specific rate limit
      await checkWalletRateLimit(validAddress, requestId);

      logger.info(`🔥 DEBUG: Wallet rate limit check passed`, { requestId });

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
      const result = await suiService.sendTokens(validAddress, amountToSend, requestId);

      if (result.success && result.transactionHash) {
        // Track successful wallet request for rate limiting
        await trackSuccessfulWalletRequest(validAddress);

        // Track successful request metrics
        await redisClient.incrementMetric('requests_total');
        await redisClient.incrementMetric('requests_success');
        await redisClient.trackRequest(requestId, {
          walletAddress: validAddress,
          amount: amountToSend.toString(),
          transactionHash: result.transactionHash,
          timestamp: Date.now(),
          status: 'success',
          ip: clientIP,
        });

        // Log successful request
        logFaucetRequest(
          requestId,
          validAddress,
          amountToSend.toString(),
          clientIP,
          true,
          result.transactionHash
        );

        // Save transaction to database
        try {
          // Save full transaction record
          await databaseService.saveTransaction({
            request_id: requestId,
            wallet_address: validAddress,
            amount: amountToSend.toString(),
            transaction_hash: result.transactionHash || '',
            status: 'success',
            ip_address: clientIP,
            user_agent: req.get('User-Agent') || 'unknown',
            created_at: new Date().toISOString(),
          });

          // Also save minimal metrics (for backward compatibility)
          await databaseService.saveMetrics({
            date: new Date().toISOString().split('T')[0]!, // YYYY-MM-DD
            amount: amountToSend.toString(),
            status: 'success',
            ...(result.transactionHash && { transaction_hash: result.transactionHash }), // For debugging only
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
          message: `✅ Successfully sent ${amountInSui} SUI to ${validAddress}`,
          walletAddress: validAddress,
          faucetAddress: suiService.faucetAddress,
        });

      } else {
        // Track failed request
        await redisClient.incrementMetric('requests_total');
        await redisClient.incrementMetric('requests_failed');
        await redisClient.trackRequest(requestId, {
          walletAddress: validAddress,
          amount: amountToSend.toString(),
          timestamp: Date.now(),
          status: 'failed',
          error: result.error,
          ip: clientIP,
        });

        // Log failed request
        logFaucetRequest(
          requestId,
          validAddress,
          amountToSend.toString(),
          clientIP,
          false,
          undefined,
          result.error
        );

        // Save failed transaction to database
        try {
          // Save full transaction record
          await databaseService.saveTransaction({
            request_id: requestId,
            wallet_address: validAddress,
            amount: amountToSend.toString(),
            transaction_hash: '',
            status: 'failed',
            error_message: result.error || 'Unknown error',
            ip_address: clientIP,
            user_agent: req.get('User-Agent') || 'unknown',
            created_at: new Date().toISOString(),
          });

          // Also save minimal metrics (for backward compatibility)
          await databaseService.saveMetrics({
            date: new Date().toISOString().split('T')[0]!,
            amount: amountToSend.toString(),
            status: 'failed',
            error_type: 'network_error',
          });
        } catch (dbError: any) {
          logger.error('Failed to save failed transaction', {
            requestId,
            error: dbError.message,
          });
        }

        return res.status(500).json({
          success: false,
          message: `❌ Faucet request failed: ${result.error || 'Unknown error occurred'}`,
          walletAddress: validAddress,
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
        validAddress,
        amount || config.sui.defaultAmount,
        clientIP,
        false,
        undefined,
        error.message
      );

      // Handle rate limit errors
      if (error.name === 'RateLimitError') {
        // Save rate limit metrics
        try {
          await databaseService.saveMetrics({
            date: new Date().toISOString().split('T')[0]!,
            amount: (amount || config.sui.defaultAmount).toString(),
            status: 'failed',
            error_type: 'rate_limit',
          });
        } catch (dbError: any) {
          logger.error('Failed to save rate limit metrics', {
            requestId,
            error: dbError.message,
          });
        }

        return res.status(429).json({
          success: false,
          message: `🚫 ${error.message}`,
          retryAfter: error.retryAfter,
          walletAddress: validAddress,
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
        walletAddress: validAddress,
      });

      return res.status(500).json({
        success: false,
        message: 'Internal server error occurred while processing faucet request',
        walletAddress: validAddress,
      });
    }
  })
);

// GET /api/v1/faucet/mode - Get current faucet mode
router.get('/mode', requireApiKey, asyncHandler(async (req: Request, res: Response) => {
  try {
    // Get faucet mode from database
    const query = `
      SELECT setting_value FROM rate_limit_settings
      WHERE setting_name = 'faucet_mode' AND is_active = true
    `;
    const result = await databaseService.query(query);

    let mode = 'wallet'; // Default mode
    if (result.rows.length > 0) {
      mode = result.rows[0].setting_value === 'sui_sdk' ? 'sui_sdk' : 'wallet';
    }

    const description = mode === 'sui_sdk'
      ? 'Using official Sui faucet - frontend should handle requests directly'
      : 'Using backend wallet - send requests to backend API';

    // Get wallet address if in wallet mode
    let walletAddress = null;
    if (mode === 'wallet') {
      walletAddress = suiService.getWalletAddress();
    }

    res.json({
      success: true,
      data: {
        mode,
        description,
        walletAddress,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error: any) {
    logger.error('Error getting faucet mode:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get faucet mode',
      error: error.message
    });
  }
}));

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
