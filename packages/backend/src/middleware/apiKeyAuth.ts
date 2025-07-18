import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

// API Key authentication middleware
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.requestId;
  const clientIP = req.ip || 'unknown';

  // Try to get API key from multiple sources
  let apiKey: string | undefined;

  // 1. Check X-API-Key header (most common for API keys)
  const xApiKey = req.headers['x-api-key'] as string;
  if (xApiKey) {
    apiKey = xApiKey;
  }

  // 2. Check Authorization Bearer header (fallback)
  const authHeader = req.headers.authorization;
  if (!apiKey && authHeader && authHeader.startsWith('Bearer ')) {
    apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  // 3. Check Authorization header without Bearer (simple format)
  if (!apiKey && authHeader && !authHeader.startsWith('Bearer ')) {
    apiKey = authHeader;
  }

  if (!apiKey) {
    logger.warn('🚫 Missing API key', {
      requestId,
      ip: clientIP,
      path: req.path,
    });

    res.status(401).json({
      success: false,
      message: '🚫 Missing API key. Please provide API key.',
      error: {
        code: 'MISSING_API_KEY',
        details: 'API key required',
      },
    });
    return;
  }
  
  // Validate API key
  if (apiKey !== config.auth.apiKey) {
    logger.warn('🚫 Invalid API key', {
      requestId,
      ip: clientIP,
      path: req.path,
      providedKey: apiKey.substring(0, 3) + '***',
    });
    
    res.status(401).json({
      success: false,
      message: '🚫 Invalid API key. Access denied.',
      error: {
        code: 'INVALID_API_KEY',
        details: 'The provided API key is incorrect',
      },
    });
    return;
  }
  
  // API key is valid
  logger.info('✅ API key validated', {
    requestId,
    ip: clientIP,
    path: req.path,
  });
  
  next();
};

// Optional: API key auth for specific endpoints
export const requireApiKey = apiKeyAuth;
