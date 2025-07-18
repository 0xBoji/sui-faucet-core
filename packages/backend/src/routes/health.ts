import { Router, Request, Response } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { validate, healthQuerySchema } from '../validation/schemas.js';
import { suiService } from '../services/sui.js';
import { redisClient } from '../services/redis.js';
import { config } from '../config/index.js';
import { logHealthCheck, logger } from '../utils/logger.js';

const router = Router();

// Health status interface
interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  services: {
    sui: {
      status: 'healthy' | 'unhealthy';
      details?: any;
    };
    redis: {
      status: 'healthy' | 'unhealthy';
      details?: any;
    };
  };
  wallet?: {
    address: string;
    balance: string;
    balanceSui: number;
    isLowBalance: boolean;
  };
  performance?: {
    responseTime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
}

// Track process start time for uptime calculation
const processStartTime = Date.now();

// GET /api/v1/health - Basic health check
router.get('/', 
  validate(healthQuerySchema, 'query'),
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const { detailed } = req.query as { detailed?: boolean };

    try {
      // Check Sui service health
      const suiHealth = await suiService.healthCheck();
      logHealthCheck('sui', suiHealth.status, suiHealth.details);

      // Check Redis health
      const redisHealth = await redisClient.healthCheck();
      logHealthCheck('redis', redisHealth.status, { latency: redisHealth.latency });

      // Determine overall status
      let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      
      if (suiHealth.status === 'unhealthy' || redisHealth.status === 'unhealthy') {
        overallStatus = 'unhealthy';
      } else if (suiHealth.details?.['isLowBalance']) {
        overallStatus = 'degraded';
      }

      // Build health response
      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: Date.now() - processStartTime,
        version: '1.0.0',
        environment: config.server.environment,
        services: {
          sui: {
            status: suiHealth.status,
            ...(detailed && { details: suiHealth.details }),
          },
          redis: {
            status: redisHealth.status,
            ...(detailed && { details: { latency: redisHealth.latency } }),
          },
        },
      };

      // Add wallet information if detailed
      if (detailed && suiHealth.status === 'healthy' && suiHealth.details) {
        healthStatus.wallet = {
          address: suiHealth.details['walletAddress'],
          balance: suiHealth.details['walletBalance'],
          balanceSui: suiHealth.details['walletBalanceSui'],
          isLowBalance: suiHealth.details['isLowBalance'],
        };
      }

      // Add performance metrics if detailed
      if (detailed) {
        const responseTime = Date.now() - startTime;
        healthStatus.performance = {
          responseTime,
          memoryUsage: process.memoryUsage(),
        };

        // Add CPU usage if available
        if (process.cpuUsage) {
          healthStatus.performance.cpuUsage = process.cpuUsage();
        }
      }

      // Set appropriate HTTP status code
      const httpStatus = overallStatus === 'healthy' ? 200 : 
                        overallStatus === 'degraded' ? 200 : 503;

      res.status(httpStatus).json({
        success: overallStatus !== 'unhealthy',
        data: healthStatus,
      });

    } catch (error: any) {
      logger.error('Health check failed', {
        error: error.message,
        requestId: req.requestId,
      });

      const errorResponse: HealthStatus = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - processStartTime,
        version: '1.0.0',
        environment: config.server.environment,
        services: {
          sui: { status: 'unhealthy' },
          redis: { status: 'unhealthy' },
        },
      };

      res.status(503).json({
        success: false,
        data: errorResponse,
        error: {
          message: 'Health check failed',
          details: detailed ? error.message : undefined,
        },
      });
    }
  })
);

// GET /api/v1/health/live - Liveness probe (simple check)
router.get('/live',
  asyncHandler(async (_req: Request, res: Response) => {
    // Simple liveness check - just return 200 if the process is running
    res.status(200).json({
      status: 'alive',
      timestamp: new Date().toISOString(),
      uptime: Date.now() - processStartTime,
    });
  })
);

// GET /api/v1/health/ready - Readiness probe (check if ready to serve traffic)
router.get('/ready', 
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // Check if critical services are ready
      const suiReady = suiService.isReady;
      const redisReady = redisClient.isHealthy;

      const isReady = suiReady && redisReady;

      if (isReady) {
        res.status(200).json({
          status: 'ready',
          timestamp: new Date().toISOString(),
          services: {
            sui: suiReady,
            redis: redisReady,
          },
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          timestamp: new Date().toISOString(),
          services: {
            sui: suiReady,
            redis: redisReady,
          },
        });
      }

    } catch (error: any) {
      logger.error('Readiness check failed', {
        error: error.message,
        requestId: req.requestId,
      });

      res.status(503).json({
        status: 'not_ready',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  })
);

// GET /api/v1/health/startup - Startup probe (check if application has started)
router.get('/startup', 
  asyncHandler(async (req: Request, res: Response) => {
    try {
      // Check if application has completed startup
      const suiInitialized = suiService.isReady;
      const redisConnected = redisClient.isHealthy;

      const hasStarted = suiInitialized && redisConnected;

      if (hasStarted) {
        res.status(200).json({
          status: 'started',
          timestamp: new Date().toISOString(),
          startupTime: Date.now() - processStartTime,
        });
      } else {
        res.status(503).json({
          status: 'starting',
          timestamp: new Date().toISOString(),
          startupTime: Date.now() - processStartTime,
          services: {
            sui: suiInitialized,
            redis: redisConnected,
          },
        });
      }

    } catch (error: any) {
      logger.error('Startup check failed', {
        error: error.message,
        requestId: req.requestId,
      });

      res.status(503).json({
        status: 'startup_failed',
        timestamp: new Date().toISOString(),
        error: error.message,
      });
    }
  })
);

export { router as healthRoutes };
