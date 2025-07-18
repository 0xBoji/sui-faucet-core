import { createClient, RedisClientType } from 'redis';
import { config } from '../config/index.js';
import { logger, logError } from '../utils/logger.js';

class RedisService {
  private client: RedisClientType;
  private isConnected = false;

  constructor() {
    this.client = createClient({
      url: config.redis.url,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis reconnection failed after 10 attempts');
            return new Error('Redis reconnection failed');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });

    // Event handlers
    this.client.on('connect', () => {
      logger.info('Redis client connected');
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('end', () => {
      logger.info('Redis client disconnected');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Redis connection established');
    } catch (error) {
      logError(error as Error, { context: 'Redis connection' });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.isConnected) {
        await this.client.disconnect();
        logger.info('Redis connection closed');
      }
    } catch (error) {
      logError(error as Error, { context: 'Redis disconnection' });
      throw error;
    }
  }

  // Rate limiting methods
  async incrementRateLimit(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    try {
      const fullKey = `${config.redis.keyPrefix}rate_limit:${key}`;
      const multi = this.client.multi();
      
      multi.incr(fullKey);
      multi.expire(fullKey, Math.ceil(windowMs / 1000));
      multi.ttl(fullKey);
      
      const results = await multi.exec();
      
      if (!results || results.length < 3) {
        throw new Error('Redis multi command failed');
      }

      const count = results[0] as number;
      const ttl = results[2] as number;

      return { count, ttl };
    } catch (error) {
      logError(error as Error, { context: 'Rate limit increment', key });
      throw error;
    }
  }

  async getRateLimit(key: string): Promise<{ count: number; ttl: number }> {
    try {
      const fullKey = `${config.redis.keyPrefix}rate_limit:${key}`;
      const multi = this.client.multi();
      
      multi.get(fullKey);
      multi.ttl(fullKey);
      
      const results = await multi.exec();
      
      if (!results || results.length < 2) {
        return { count: 0, ttl: 0 };
      }

      const count = parseInt(results[0] as string || '0');
      const ttl = results[1] as number;

      return { count, ttl };
    } catch (error) {
      logError(error as Error, { context: 'Rate limit get', key });
      return { count: 0, ttl: 0 };
    }
  }

  async resetRateLimit(key: string): Promise<void> {
    try {
      const fullKey = `${config.redis.keyPrefix}rate_limit:${key}`;
      await this.client.del(fullKey);
    } catch (error) {
      logError(error as Error, { context: 'Rate limit reset', key });
      throw error;
    }
  }

  // Analytics and metrics
  async incrementMetric(metric: string, value = 1): Promise<void> {
    try {
      const key = `${config.redis.keyPrefix}metrics:${metric}`;
      await this.client.incrBy(key, value);
      await this.client.expire(key, 86400); // 24 hours
    } catch (error) {
      logError(error as Error, { context: 'Metric increment', metric });
    }
  }

  async getMetric(metric: string): Promise<number> {
    try {
      const key = `${config.redis.keyPrefix}metrics:${metric}`;
      const value = await this.client.get(key);
      return parseInt(value || '0');
    } catch (error) {
      logError(error as Error, { context: 'Metric get', metric });
      return 0;
    }
  }

  async setMetric(metric: string, value: number, ttl?: number): Promise<void> {
    try {
      const key = `${config.redis.keyPrefix}metrics:${metric}`;
      await this.client.set(key, value.toString());
      if (ttl) {
        await this.client.expire(key, ttl);
      }
    } catch (error) {
      logError(error as Error, { context: 'Metric set', metric });
    }
  }

  // Request tracking
  async trackRequest(requestId: string, data: Record<string, any>): Promise<void> {
    try {
      const key = `${config.redis.keyPrefix}requests:${requestId}`;
      await this.client.setEx(key, 3600, JSON.stringify(data)); // 1 hour
    } catch (error) {
      logError(error as Error, { context: 'Request tracking', requestId });
    }
  }

  async getRequest(requestId: string): Promise<Record<string, any> | null> {
    try {
      const key = `${config.redis.keyPrefix}requests:${requestId}`;
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logError(error as Error, { context: 'Request get', requestId });
      return null;
    }
  }

  // Wallet tracking
  async trackWalletRequest(walletAddress: string, timestamp: number): Promise<void> {
    try {
      const key = `${config.redis.keyPrefix}wallets:${walletAddress}`;
      await this.client.setEx(key, config.rateLimits.windowMs / 1000, timestamp.toString());
    } catch (error) {
      logError(error as Error, { context: 'Wallet tracking', walletAddress });
    }
  }

  async getLastWalletRequest(walletAddress: string): Promise<number | null> {
    try {
      console.log(`🔥 DEBUG: getLastWalletRequest for ${walletAddress}`);
      const key = `${config.redis.keyPrefix}wallets:${walletAddress}`;
      console.log(`🔥 DEBUG: Redis key: ${key}`);

      const timestamp = await this.client.get(key);
      console.log(`🔥 DEBUG: Redis get result:`, timestamp);

      const result = timestamp ? parseInt(timestamp) : null;
      console.log(`🔥 DEBUG: Parsed result:`, result);

      return result;
    } catch (error) {
      console.error(`🔥 DEBUG: Redis error:`, error);
      logError(error as Error, { context: 'Wallet get', walletAddress });
      return null;
    }
  }

  // Health check
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy'; latency: number }> {
    const start = Date.now();
    try {
      await this.client.ping();
      const latency = Date.now() - start;
      return { status: 'healthy', latency };
    } catch (error) {
      const latency = Date.now() - start;
      logError(error as Error, { context: 'Redis health check' });
      return { status: 'unhealthy', latency };
    }
  }

  // Clear all cache (admin function)
  async clearAll(): Promise<void> {
    try {
      const pattern = `${config.redis.keyPrefix}*`;
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      logError(error as Error, { context: 'Clear cache' });
      throw error;
    }
  }

  // Generic cache methods
  async set(key: string, value: string, ttl?: number): Promise<void> {
    try {
      const fullKey = `${config.redis.keyPrefix}${key}`;
      if (ttl) {
        await this.client.setEx(fullKey, ttl, value);
      } else {
        await this.client.set(fullKey, value);
      }
    } catch (error) {
      logError(error as Error, { context: 'Cache set', key });
      throw error;
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      const fullKey = `${config.redis.keyPrefix}${key}`;
      return await this.client.get(fullKey);
    } catch (error) {
      logError(error as Error, { context: 'Cache get', key });
      return null;
    }
  }

  async del(key: string): Promise<void> {
    try {
      const fullKey = `${config.redis.keyPrefix}${key}`;
      await this.client.del(fullKey);
    } catch (error) {
      logError(error as Error, { context: 'Cache delete', key });
      throw error;
    }
  }

  get isHealthy(): boolean {
    return this.isConnected;
  }

  get rawClient(): RedisClientType {
    return this.client;
  }
}

export const redisClient = new RedisService();
