import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import { redisClient } from '../services/redis.js';
import { config } from '../config/index.js';
import { RateLimitError } from './errorHandler.js';
import { logRateLimit } from '../utils/logger.js';
import { logger } from '../utils/logger.js';

// Whitelist for internal services (Discord bot, admin tools, etc.)
const INTERNAL_IPS = [
  '127.0.0.1',
  '::1',
  '::ffff:127.0.0.1',
  // Add your server's internal IP if needed
  // '172.31.15.43', // EC2 internal IP
];

// Check if request is from internal service
const isInternalRequest = (req: Request): boolean => {
  const ip = req.ip || req.connection.remoteAddress || '';
  const userAgent = req.get('User-Agent') || '';

  // Check if IP is whitelisted
  if (INTERNAL_IPS.includes(ip)) {
    return true;
  }

  // Check if request is from Discord bot
  if (userAgent.includes('axios') && req.get('X-API-Key') === config.auth.apiKey) {
    return true;
  }

  return false;
};

// Rate limiter instances (not used in current implementation)
let ipRateLimiter: RateLimiterRedis | null = null;
let globalRateLimiter: RateLimiterRedis | null = null;

// Note: Redis rate limiters are initialized but not used in current implementation
// Using simple in-memory rate limiting instead

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

// Simple in-memory rate limiter (fallback when Redis has issues)
const ipRequestCounts = new Map<string, { count: number; resetTime: number }>();
const globalRequestCount = { count: 0, resetTime: Date.now() + config.rateLimits.windowMs };

const simpleRateLimit = (clientIP: string): { allowed: boolean; retryAfter?: number } => {
  const now = Date.now();
  const windowMs = config.rateLimits.windowMs;

  // Reset global counter if window expired
  if (now > globalRequestCount.resetTime) {
    globalRequestCount.count = 0;
    globalRequestCount.resetTime = now + windowMs;
  }

  // Check global limit
  if (globalRequestCount.count >= config.rateLimits.maxRequestsPerWindow) {
    const retryAfter = Math.ceil((globalRequestCount.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Reset IP counter if window expired
  const ipData = ipRequestCounts.get(clientIP);
  if (!ipData || now > ipData.resetTime) {
    ipRequestCounts.set(clientIP, { count: 0, resetTime: now + windowMs });
  }

  const currentIpData = ipRequestCounts.get(clientIP)!;

  // Check IP limit
  if (currentIpData.count >= config.rateLimits.maxRequestsPerIP) {
    const retryAfter = Math.ceil((currentIpData.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }

  // Increment counters
  globalRequestCount.count++;
  currentIpData.count++;

  return { allowed: true };
};

// Rate limiter middleware
export const rateLimiter = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const clientIP = getClientIP(req);
    const requestId = req.requestId || 'unknown';

    // Skip rate limiting if disabled
    if (!config.rateLimits.enabled) {
      console.log(`🔥 DEBUG: Rate limiting disabled globally`);
      return next();
    }

    // Skip rate limiting for internal requests (Discord bot, etc.)
    if (isInternalRequest(req)) {
      console.log(`🔥 DEBUG: Skipping rate limit for internal request from ${clientIP}`);
      return next();
    }

    // Skip rate limiting for health checks, auth, admin endpoints, docs, and root
    if (req.path.includes('/health') ||
        req.path.includes('/auth') ||
        req.path.includes('/admin') ||
        req.path.includes('/docs') ||
        req.path.includes('/api-docs') ||
        req.path === '/' ||
        req.path === '/test') {
      return next();
    }

    console.log(`🔥 DEBUG: Rate limiting check for ${clientIP} on ${req.path}`);

    // Use simple in-memory rate limiting (Redis has issues)
    console.log(`🔥 DEBUG: Using simple rate limiting`);
    const rateLimitResult = simpleRateLimit(clientIP);

    if (!rateLimitResult.allowed) {
      const retryAfter = rateLimitResult.retryAfter || 60;

      logRateLimit(requestId, clientIP, 'ip');

      res.set('Retry-After', retryAfter.toString());
      res.set('X-RateLimit-Limit', config.rateLimits.maxRequestsPerIP.toString());
      res.set('X-RateLimit-Remaining', '0');

      throw new RateLimitError(`Rate limit exceeded. Please try again in ${retryAfter} seconds.`, retryAfter);
    }

    console.log(`🔥 DEBUG: Rate limiting passed for ${clientIP}`);
    next();
  } catch (error) {
    next(error);
  }
};

// Wallet-specific rate limiter (used in faucet routes)
// Simple wallet rate limiting (in-memory)
const walletRequestCounts = new Map<string, { count: number; resetTime: number }>();

export const checkWalletRateLimit = async (walletAddress: string, requestId: string): Promise<void> => {
  try {
    console.log(`🔥 DEBUG: checkWalletRateLimit started for ${walletAddress}`);

    const now = Date.now();
    const windowMs = config.rateLimits.windowMs;
    const maxPerWallet = config.rateLimits.maxRequestsPerWallet;

    console.log(`🔥 DEBUG: now=${now}, windowMs=${windowMs}, maxPerWallet=${maxPerWallet}`);

    // Reset wallet counter if window expired
    const walletData = walletRequestCounts.get(walletAddress);
    if (!walletData || now > walletData.resetTime) {
      walletRequestCounts.set(walletAddress, { count: 0, resetTime: now + windowMs });
    }

    const currentWalletData = walletRequestCounts.get(walletAddress)!;
    console.log(`🔥 DEBUG: currentWalletData:`, currentWalletData);

    // Check wallet limit
    if (currentWalletData.count >= maxPerWallet) {
      const retryAfter = Math.ceil((currentWalletData.resetTime - now) / 1000);

      logRateLimit(requestId, 'unknown', 'wallet', walletAddress);

      throw new RateLimitError(
        `Wallet ${walletAddress} has exceeded rate limit. Please wait ${retryAfter} seconds before requesting again.`,
        retryAfter
      );
    }

    // Increment wallet counter
    currentWalletData.count++;
    console.log(`🔥 DEBUG: Wallet counter incremented to:`, currentWalletData.count);

    logger.info(`Wallet rate limit check passed`, {
      requestId,
      walletAddress,
      count: currentWalletData.count,
      maxPerWallet,
    });

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
