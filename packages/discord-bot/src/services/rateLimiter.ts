import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export class RateLimiterService {
  private userLimits = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxRequests: number;

  constructor() {
    this.windowMs = config.rateLimit.windowMinutes * 60 * 1000; // Convert to milliseconds
    this.maxRequests = config.rateLimit.maxRequests;
    
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
    if (!config.rateLimit.enabled) {
      return { allowed: true };
    }

    const now = Date.now();
    const entry = this.userLimits.get(userId);

    // If no entry exists or window has expired, create new entry
    if (!entry || now >= entry.resetTime) {
      this.userLimits.set(userId, {
        count: 1,
        resetTime: now + this.windowMs,
      });
      
      logger.debug('Rate limit - new window', {
        userId,
        count: 1,
        resetTime: new Date(now + this.windowMs).toISOString(),
      });
      
      return { allowed: true };
    }

    // Check if user has exceeded the limit
    if (entry.count >= this.maxRequests) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      
      logger.warn('Rate limit exceeded', {
        userId,
        count: entry.count,
        maxRequests: this.maxRequests,
        retryAfter,
      });
      
      return { allowed: false, retryAfter };
    }

    // Increment count
    entry.count++;
    this.userLimits.set(userId, entry);
    
    logger.debug('Rate limit - request counted', {
      userId,
      count: entry.count,
      maxRequests: this.maxRequests,
    });

    return { allowed: true };
  }

  getRemainingRequests(userId: string): number {
    if (!config.rateLimit.enabled) {
      return this.maxRequests;
    }

    const entry = this.userLimits.get(userId);
    if (!entry || Date.now() >= entry.resetTime) {
      return this.maxRequests;
    }

    return Math.max(0, this.maxRequests - entry.count);
  }

  getResetTime(userId: string): Date | null {
    if (!config.rateLimit.enabled) {
      return null;
    }

    const entry = this.userLimits.get(userId);
    if (!entry || Date.now() >= entry.resetTime) {
      return null;
    }

    return new Date(entry.resetTime);
  }

  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [userId, entry] of this.userLimits.entries()) {
      if (now >= entry.resetTime) {
        this.userLimits.delete(userId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Rate limiter cleanup', {
        cleanedEntries: cleanedCount,
        remainingEntries: this.userLimits.size,
      });
    }
  }

  // Admin methods
  clearUserLimit(userId: string): boolean {
    return this.userLimits.delete(userId);
  }

  clearAllLimits(): void {
    this.userLimits.clear();
    logger.info('All rate limits cleared');
  }

  getStats(): {
    totalUsers: number;
    windowMinutes: number;
    maxRequests: number;
    enabled: boolean;
  } {
    return {
      totalUsers: this.userLimits.size,
      windowMinutes: config.rateLimit.windowMinutes,
      maxRequests: this.maxRequests,
      enabled: config.rateLimit.enabled,
    };
  }
}

export const rateLimiter = new RateLimiterService();
