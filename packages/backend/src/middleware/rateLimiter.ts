import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redisClient } from '../services/redis.js';
import { config } from '../config/index.js';
import { RateLimitError } from './errorHandler.js';
import { logRateLimit } from '../utils/logger.js';

// Rate limiter instances
let ipRateLimiter: RateLimiterRedis;
let globalRateLimiter: RateLimiterRedis;

// Initialize rate limiters
const initializeRateLimiters = () => {
  // IP-based rate limiter
  ipRateLimiter = new RateLimiterRedis({
    storeClient: redisClient.rawClient,
    keyPrefix: `${config.redis.keyPrefix}ip_limit:`,
    points: config.rateLimits.maxRequestsPerIP,
    duration: Math.floor(config.rateLimits.windowMs / 1000),
    blockDuration: Math.floor(config.rateLimits.windowMs / 1000),
    execEvenly: true,
  });

  // Global rate limiter (for all requests)
  globalRateLimiter = new RateLimiterRedis({
    storeClient: redisClient.rawClient,
    keyPrefix: `${config.redis.keyPrefix}global_limit:`,
    points: config.rateLimits.maxRequestsPerWindow,
    duration: Math.floor(config.rateLimits.windowMs / 1000),
    blockDuration: Math.floor(config.rateLimits.windowMs / 1000),
    execEvenly: true,
  });
};

// Get client IP address
const getClientIP = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'] as string;
  const realIP = req.headers['x-real-ip'] as string;
  const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
  
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || 'unknown';
  }
  
  if (realIP) {
    return realIP;
  }
  
  return remoteAddress || 'unknown';
};

// Rate limiter middleware
export const rateLimiter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // Initialize rate limiters if not already done
    if (!ipRateLimiter || !globalRateLimiter) {
      initializeRateLimiters();
    }

    const clientIP = getClientIP(req);
    const requestId = req.requestId || 'unknown';

    // Skip rate limiting for health checks, auth, and admin endpoints
    if (req.path.includes('/health') || req.path.includes('/auth') || req.path.includes('/admin')) {
      return next();
    }

    // Check global rate limit first
    try {
      await globalRateLimiter.consume('global');
    } catch (rateLimiterRes: any) {
      if (rateLimiterRes instanceof Error) {
        throw rateLimiterRes;
      }

      const retryAfter = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;

      logRateLimit(requestId, clientIP, 'global');

      res.set('Retry-After', retryAfter.toString());
      res.set('X-RateLimit-Limit', config.rateLimits.maxRequestsPerWindow.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());

      throw new RateLimitError('Global rate limit exceeded. Please try again later.', retryAfter);
    }

    // Check IP-based rate limit
    try {
      const rateLimiterRes = await ipRateLimiter.consume(clientIP);

      // Add rate limit headers
      res.set('X-RateLimit-Limit', config.rateLimits.maxRequestsPerIP.toString());
      res.set('X-RateLimit-Remaining', rateLimiterRes.remainingPoints?.toString() || '0');
      res.set('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());

    } catch (rateLimiterRes: any) {
      if (rateLimiterRes instanceof Error) {
        throw rateLimiterRes;
      }

      const retryAfter = Math.round(rateLimiterRes.msBeforeNext / 1000) || 1;

      logRateLimit(requestId, clientIP, 'ip');

      res.set('Retry-After', retryAfter.toString());
      res.set('X-RateLimit-Limit', config.rateLimits.maxRequestsPerIP.toString());
      res.set('X-RateLimit-Remaining', '0');
      res.set('X-RateLimit-Reset', new Date(Date.now() + rateLimiterRes.msBeforeNext).toISOString());

      throw new RateLimitError(`Too many requests from IP ${clientIP}. Please try again later.`, retryAfter);
    }

    next();
  } catch (error) {
    next(error);
  }
};

// Wallet-specific rate limiter (used in faucet routes)
export const checkWalletRateLimit = async (walletAddress: string, requestId: string): Promise<void> => {
  try {
    // Check if wallet has made a request recently
    const lastRequest = await redisClient.getLastWalletRequest(walletAddress);
    const now = Date.now();
    const windowMs = config.rateLimits.windowMs;

    if (lastRequest && (now - lastRequest) < windowMs) {
      const retryAfter = Math.ceil((windowMs - (now - lastRequest)) / 1000);

      logRateLimit(requestId, 'unknown', 'wallet', walletAddress);

      throw new RateLimitError(
        `Wallet ${walletAddress} has already requested tokens recently. Please wait ${retryAfter} seconds.`,
        retryAfter
      );
    }

    // DON'T track the request here - only track after successful faucet request

  } catch (error) {
    if (error instanceof RateLimitError) {
      throw error;
    }

    // If Redis is down, we still allow the request but log the error
    console.error('Error checking wallet rate limit:', error);
  }
};

// Track successful wallet request (call this only after successful faucet)
export const trackSuccessfulWalletRequest = async (walletAddress: string): Promise<void> => {
  try {
    const now = Date.now();
    await redisClient.trackWalletRequest(walletAddress, now);
  } catch (error) {
    console.error('Error tracking successful wallet request:', error);
  }
};

// Admin function to reset rate limits
export const resetRateLimit = async (identifier: string, type: 'ip' | 'wallet' | 'global'): Promise<void> => {
  try {
    switch (type) {
      case 'ip':
        if (ipRateLimiter) {
          await ipRateLimiter.delete(identifier);
        }
        break;
      case 'wallet':
        await redisClient.del(`wallets:${identifier}`);
        break;
      case 'global':
        if (globalRateLimiter) {
          await globalRateLimiter.delete('global');
        }
        break;
    }
  } catch (error) {
    console.error(`Error resetting ${type} rate limit for ${identifier}:`, error);
    throw error;
  }
};

// Get rate limit status
export const getRateLimitStatus = async (identifier: string, type: 'ip' | 'wallet' | 'global') => {
  try {
    switch (type) {
      case 'ip':
        if (ipRateLimiter) {
          const res = await ipRateLimiter.get(identifier);
          return {
            limit: config.rateLimits.maxRequestsPerIP,
            remaining: res?.remainingPoints || config.rateLimits.maxRequestsPerIP,
            resetTime: res ? new Date(Date.now() + res.msBeforeNext) : null,
          };
        }
        break;
      case 'wallet':
        const lastRequest = await redisClient.getLastWalletRequest(identifier);
        const now = Date.now();
        const windowMs = config.rateLimits.windowMs;
        const canRequest = !lastRequest || (now - lastRequest) >= windowMs;
        
        return {
          limit: 1,
          remaining: canRequest ? 1 : 0,
          resetTime: lastRequest ? new Date(lastRequest + windowMs) : null,
        };
      case 'global':
        if (globalRateLimiter) {
          const res = await globalRateLimiter.get('global');
          return {
            limit: config.rateLimits.maxRequestsPerWindow,
            remaining: res?.remainingPoints || config.rateLimits.maxRequestsPerWindow,
            resetTime: res ? new Date(Date.now() + res.msBeforeNext) : null,
          };
        }
        break;
    }
    
    return null;
  } catch (error) {
    console.error(`Error getting ${type} rate limit status for ${identifier}:`, error);
    return null;
  }
};
