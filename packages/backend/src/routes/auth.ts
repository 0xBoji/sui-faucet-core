import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate } from '../validation/schemas.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';
import Joi from 'joi';

const router = Router();

/**
 * @swagger
 * /api/v1/auth/verify:
 *   post:
 *     summary: Verify API key
 *     description: Verify if the provided API key is valid and active
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - apiKey
 *             properties:
 *               apiKey:
 *                 type: string
 *                 example: ""
 *                 description: "API key to verify"
 *     responses:
 *       200:
 *         description: API key verification result
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     valid:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Invalid request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/v1/auth/key:
 *   get:
 *     summary: Get API key information
 *     description: Get information about the current API key
 *     tags: [Auth]
 *     security:
 *       - ApiKeyAuth: []
 *     responses:
 *       200:
 *         description: API key information
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
 *                         keyInfo:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               example: "api_key"
 *                             permissions:
 *                               type: array
 *                               items:
 *                                 type: string
 *                               example: ["faucet_request"]
 *       401:
 *         description: Invalid or missing API key
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

// API Key request schema
const apiKeySchema = Joi.object({
  apiKey: Joi.string()
    .required()
    .messages({
      'any.required': 'API key is required',
      'string.empty': 'API key cannot be empty',
    }),
});

// API Key response interface
interface ApiKeyResponse {
  success: boolean;
  message: string;
  valid?: boolean;
  timestamp?: string;
  error?: {
    code: string;
    details?: string;
  };
}

// POST /api/v1/auth/verify - Verify API key
router.post('/verify',
  validate(apiKeySchema, 'body'),
  asyncHandler(async (req: Request<{}, ApiKeyResponse, { apiKey: string }>, res: Response<ApiKeyResponse>) => {
    const { apiKey } = req.body;
    const requestId = req.requestId;
    const clientIP = req.ip || 'unknown';

    logger.info(`API key verification attempt`, {
      requestId,
      ip: clientIP,
      timestamp: new Date().toISOString(),
    });

    try {
      // Check if API key matches configured key
      if (apiKey === config.auth.apiKey) {
        logger.info(`✅ API key valid`, {
          requestId,
          ip: clientIP,
          timestamp: new Date().toISOString(),
        });

        return res.status(200).json({
          success: true,
          valid: true,
          message: '🎉 API key is valid! Access granted.',
          timestamp: new Date().toISOString(),
        });

      } else {
        logger.warn(`❌ API key invalid`, {
          requestId,
          ip: clientIP,
          timestamp: new Date().toISOString(),
        });

        return res.status(401).json({
          success: false,
          valid: false,
          message: '🚫 Invalid API key. Access denied.',
          error: {
            code: 'INVALID_API_KEY',
            details: 'The provided API key is incorrect',
          },
        });
      }

    } catch (error: any) {
      logger.error('API key verification error', {
        error: error.message,
        requestId,
        ip: clientIP,
      });

      return res.status(500).json({
        success: false,
        message: '❌ API key verification service error',
        error: {
          code: 'API_KEY_SERVICE_ERROR',
          details: 'Internal server error during API key verification',
        },
      });
    }
  })
);

// GET /api/v1/auth/status - Check auth service status
router.get('/status',
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;

    logger.info(`Auth service status check`, {
      requestId,
      ip: req.ip || 'unknown',
    });

    return res.status(200).json({
      success: true,
      message: '🔐 API Key verification service is operational',
      endpoints: {
        verify: 'POST /api/v1/auth/verify',
        status: 'GET /api/v1/auth/status',
      },
      timestamp: new Date().toISOString(),
    });
  })
);

// GET /api/v1/auth/key - Get API key info (for testing)
router.get('/key',
  asyncHandler(async (req: Request, res: Response) => {
    const requestId = req.requestId;

    logger.info(`API key info request`, {
      requestId,
      ip: req.ip || 'unknown',
    });

    return res.status(200).json({
      success: true,
      message: '🔑 API Key Information',
      info: {
        description: 'Use the API key "" to authenticate faucet requests',
        usage: {
          header: 'Authorization: Bearer ',
          example: 'curl -H "Authorization: Bearer " -X POST /api/v1/faucet/request',
          verification: 'POST /api/v1/auth/verify with {"apiKey": ""}',
        },
        validKey: config.auth.apiKey,
        protectedEndpoints: ['/api/v1/faucet/request'],
      },
      timestamp: new Date().toISOString(),
    });
  })
);

export { router as authRoutes };
