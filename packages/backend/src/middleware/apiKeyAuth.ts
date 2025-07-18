import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

// API Key authentication middleware
export const apiKeyAuth = (req: Request, res: Response, next: NextFunction): void => {
  const requestId = req.requestId;
  const clientIP = req.ip || 'unknown';
  
  // Get Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    logger.warn('🚫 Missing Authorization header', {
      requestId,
      ip: clientIP,
      path: req.path,
    });
    
    res.status(401).json({
      success: false,
      message: '🚫 Missing Authorization header. Please provide API key.',
      error: {
        code: 'MISSING_API_KEY',
        details: 'Authorization header is required. Use: Authorization: Bearer suisuisui',
      },
    });
    return;
  }
  
  // Check if it's Bearer token format
  if (!authHeader.startsWith('Bearer ')) {
    logger.warn('🚫 Invalid Authorization format', {
      requestId,
      ip: clientIP,
      path: req.path,
      authHeader: authHeader.substring(0, 20) + '...',
    });
    
    res.status(401).json({
      success: false,
      message: '🚫 Invalid Authorization format. Use Bearer token.',
      error: {
        code: 'INVALID_AUTH_FORMAT',
        details: 'Authorization header must be in format: Bearer <api-key>',
      },
    });
    return;
  }
  
  // Extract API key
  const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
  
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
