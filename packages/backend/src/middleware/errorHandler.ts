import { Request, Response, NextFunction } from 'express';
import { logError } from '../utils/logger.js';
import { config } from '../config/index.js';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: Record<string, any>;
}

export class ValidationError extends Error {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  
  constructor(message: string, public details?: Record<string, any>) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class RateLimitError extends Error {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';
  
  constructor(message: string, public retryAfter?: number) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class SuiError extends Error {
  statusCode = 500;
  code = 'SUI_ERROR';
  
  constructor(message: string, public details?: Record<string, any>) {
    super(message);
    this.name = 'SuiError';
  }
}

export class InsufficientBalanceError extends Error {
  statusCode = 503;
  code = 'INSUFFICIENT_BALANCE';
  
  constructor(message: string = 'Faucet has insufficient balance') {
    super(message);
    this.name = 'InsufficientBalanceError';
  }
}

export class ServiceUnavailableError extends Error {
  statusCode = 503;
  code = 'SERVICE_UNAVAILABLE';
  
  constructor(message: string = 'Service temporarily unavailable') {
    super(message);
    this.name = 'ServiceUnavailableError';
  }
}

// Error response interface
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    requestId?: string;
    retryAfter?: number;
  };
}

// Development error response (includes stack trace)
interface DevErrorResponse extends ErrorResponse {
  error: ErrorResponse['error'] & {
    stack?: string;
  };
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  const requestId = req.headers['x-request-id'] as string || 'unknown';
  
  // Log the error
  logError(err, {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });

  // Determine status code
  let statusCode = err.statusCode || 500;
  
  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
  } else if (err.name === 'ForbiddenError') {
    statusCode = 403;
  } else if (err.name === 'NotFoundError') {
    statusCode = 404;
  } else if (err.name === 'RateLimitError') {
    statusCode = 429;
  } else if (err.name === 'InsufficientBalanceError' || err.name === 'ServiceUnavailableError') {
    statusCode = 503;
  }

  // Determine error code
  const errorCode = err.code || getErrorCodeFromStatus(statusCode);

  // Create base error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message: getErrorMessage(err, statusCode),
      requestId,
    },
  };

  // Add details if available
  if (err.details) {
    errorResponse.error.details = err.details;
  }

  // Add retry-after for rate limit errors
  if (err instanceof RateLimitError && err.retryAfter) {
    errorResponse.error.retryAfter = err.retryAfter;
    res.set('Retry-After', err.retryAfter.toString());
  }

  // Add stack trace in development
  if (config.server.environment === 'development' && err.stack) {
    (errorResponse as DevErrorResponse).error.stack = err.stack;
  }

  // Set appropriate headers
  res.status(statusCode);
  res.set('Content-Type', 'application/json');

  // Send error response
  res.json(errorResponse);
};

// Get error code from HTTP status
function getErrorCodeFromStatus(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 422:
      return 'UNPROCESSABLE_ENTITY';
    case 429:
      return 'RATE_LIMIT_EXCEEDED';
    case 500:
      return 'INTERNAL_SERVER_ERROR';
    case 502:
      return 'BAD_GATEWAY';
    case 503:
      return 'SERVICE_UNAVAILABLE';
    case 504:
      return 'GATEWAY_TIMEOUT';
    default:
      return 'UNKNOWN_ERROR';
  }
}

// Get user-friendly error message
function getErrorMessage(err: ApiError, statusCode: number): string {
  // Use custom message if available and appropriate
  if (err.message && !isInternalError(statusCode)) {
    return err.message;
  }

  // Return generic messages for internal errors in production
  if (config.server.environment === 'production' && isInternalError(statusCode)) {
    switch (statusCode) {
      case 500:
        return 'An internal server error occurred';
      case 502:
        return 'Bad gateway';
      case 503:
        return 'Service temporarily unavailable';
      case 504:
        return 'Gateway timeout';
      default:
        return 'An error occurred while processing your request';
    }
  }

  // Return original message in development or for client errors
  return err.message || getDefaultMessage(statusCode);
}

// Check if error is internal (5xx)
function isInternalError(statusCode: number): boolean {
  return statusCode >= 500;
}

// Get default message for status code
function getDefaultMessage(statusCode: number): string {
  switch (statusCode) {
    case 400:
      return 'Bad request';
    case 401:
      return 'Unauthorized';
    case 403:
      return 'Forbidden';
    case 404:
      return 'Not found';
    case 409:
      return 'Conflict';
    case 422:
      return 'Unprocessable entity';
    case 429:
      return 'Too many requests';
    case 500:
      return 'Internal server error';
    case 502:
      return 'Bad gateway';
    case 503:
      return 'Service unavailable';
    case 504:
      return 'Gateway timeout';
    default:
      return 'An error occurred';
  }
}

// Async error wrapper for route handlers
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  const error = new Error(`Route not found: ${req.method} ${req.path}`) as ApiError;
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
};
