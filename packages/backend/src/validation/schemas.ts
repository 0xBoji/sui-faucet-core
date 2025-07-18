import Joi from 'joi';
import { config } from '../config/index.js';

// Sui address validation regex
const SUI_ADDRESS_REGEX = /^(0x)?[0-9a-fA-F]{64}$/;

// Custom Joi validator for Sui addresses
const suiAddressValidator = (value: string, helpers: Joi.CustomHelpers) => {
  if (!SUI_ADDRESS_REGEX.test(value)) {
    return helpers.error('any.invalid');
  }
  return value;
};

// Faucet request schema
export const faucetRequestSchema = Joi.object({
  // Support both 'address' and 'walletAddress' for backward compatibility
  address: Joi.string()
    .optional()
    .custom(suiAddressValidator, 'Sui address validation')
    .messages({
      'string.empty': 'Address cannot be empty',
      'any.invalid': 'Invalid Sui wallet address format. Address must be 64 hex characters with optional 0x prefix',
    }),

  walletAddress: Joi.string()
    .optional()
    .custom(suiAddressValidator, 'Sui address validation')
    .messages({
      'string.empty': 'Wallet address cannot be empty',
      'any.invalid': 'Invalid Sui wallet address format. Address must be 64 hex characters with optional 0x prefix',
    }),
  
  amount: Joi.string()
    .optional()
    .pattern(/^\d+$/)
    .custom((value, helpers) => {
      try {
        const amount = BigInt(value);
        const maxAmount = BigInt(config.sui.maxAmount);
        const minAmount = BigInt('1000000'); // 0.001 SUI minimum
        
        if (amount < minAmount) {
          return helpers.error('number.min');
        }
        
        if (amount > maxAmount) {
          return helpers.error('number.max');
        }
        
        return value;
      } catch (error) {
        return helpers.error('any.invalid');
      }
    })
    .messages({
      'string.pattern.base': 'Amount must be a valid number in MIST (smallest SUI unit)',
      'number.min': 'Amount must be at least 0.001 SUI (1000000 MIST)',
      'number.max': `Amount cannot exceed ${Number(config.sui.maxAmount) / 1_000_000_000} SUI`,
      'any.invalid': 'Invalid amount format',
    }),
}).or('address', 'walletAddress').messages({
  'object.missing': 'Either "address" or "walletAddress" field is required',
});

// Query parameters schema for pagination and filtering
export const queryParamsSchema = Joi.object({
  page: Joi.number()
    .integer()
    .min(1)
    .default(1)
    .messages({
      'number.base': 'Page must be a number',
      'number.integer': 'Page must be an integer',
      'number.min': 'Page must be at least 1',
    }),
    
  limit: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(20)
    .messages({
      'number.base': 'Limit must be a number',
      'number.integer': 'Limit must be an integer',
      'number.min': 'Limit must be at least 1',
      'number.max': 'Limit cannot exceed 100',
    }),
    
  sortBy: Joi.string()
    .valid('timestamp', 'amount', 'status')
    .default('timestamp')
    .messages({
      'any.only': 'Sort by must be one of: timestamp, amount, status',
    }),
    
  sortOrder: Joi.string()
    .valid('asc', 'desc')
    .default('desc')
    .messages({
      'any.only': 'Sort order must be either asc or desc',
    }),
    
  status: Joi.string()
    .valid('success', 'failed', 'pending')
    .optional()
    .messages({
      'any.only': 'Status must be one of: success, failed, pending',
    }),
    
  walletAddress: Joi.string()
    .optional()
    .custom(suiAddressValidator, 'Sui address validation')
    .messages({
      'any.invalid': 'Invalid Sui wallet address format',
    }),
});

// Admin authentication schema
export const adminAuthSchema = Joi.object({
  username: Joi.string()
    .required()
    .min(3)
    .max(50)
    .messages({
      'any.required': 'Username is required',
      'string.empty': 'Username cannot be empty',
      'string.min': 'Username must be at least 3 characters',
      'string.max': 'Username cannot exceed 50 characters',
    }),
    
  password: Joi.string()
    .required()
    .min(8)
    .messages({
      'any.required': 'Password is required',
      'string.empty': 'Password cannot be empty',
      'string.min': 'Password must be at least 8 characters',
    }),
});

// Rate limit reset schema
export const rateLimitResetSchema = Joi.object({
  identifier: Joi.string()
    .required()
    .messages({
      'any.required': 'Identifier is required',
      'string.empty': 'Identifier cannot be empty',
    }),
    
  type: Joi.string()
    .valid('ip', 'wallet', 'global')
    .required()
    .messages({
      'any.required': 'Type is required',
      'any.only': 'Type must be one of: ip, wallet, global',
    }),
});

// Metrics query schema
export const metricsQuerySchema = Joi.object({
  timeframe: Joi.string()
    .valid('1h', '24h', '7d', '30d')
    .default('24h')
    .messages({
      'any.only': 'Timeframe must be one of: 1h, 24h, 7d, 30d',
    }),
    
  metric: Joi.string()
    .valid('requests', 'success_rate', 'response_time', 'errors', 'rate_limits')
    .optional()
    .messages({
      'any.only': 'Metric must be one of: requests, success_rate, response_time, errors, rate_limits',
    }),
});

// Health check query schema
export const healthQuerySchema = Joi.object({
  detailed: Joi.boolean()
    .default(false)
    .messages({
      'boolean.base': 'Detailed must be a boolean value',
    }),
});

// Validation middleware factory
export const validate = (schema: Joi.ObjectSchema, property: 'body' | 'query' | 'params' = 'body') => {
  return (req: any, res: any, next: any) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details,
          requestId: req.requestId,
        },
      });
    }

    // Replace the original property with the validated and transformed value
    req[property] = value;
    next();
  };
};

// Utility function to validate Sui address
export const isValidSuiAddress = (address: string): boolean => {
  return SUI_ADDRESS_REGEX.test(address);
};

// Utility function to normalize Sui address
export const normalizeSuiAddress = (address: string): string => {
  if (!address) return '';
  
  // Remove 0x prefix if present, then add it back
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
  return `0x${cleanAddress.toLowerCase()}`;
};

// Utility function to validate and parse amount
export const validateAmount = (amount: string): { isValid: boolean; value?: bigint; error?: string } => {
  try {
    if (!amount || !/^\d+$/.test(amount)) {
      return { isValid: false, error: 'Amount must be a valid number' };
    }

    const value = BigInt(amount);
    const maxAmount = BigInt(config.sui.maxAmount);
    const minAmount = BigInt('1000000'); // 0.001 SUI

    if (value < minAmount) {
      return { isValid: false, error: 'Amount too small (minimum 0.001 SUI)' };
    }

    if (value > maxAmount) {
      return { isValid: false, error: `Amount too large (maximum ${Number(maxAmount) / 1_000_000_000} SUI)` };
    }

    return { isValid: true, value };
  } catch (error) {
    return { isValid: false, error: 'Invalid amount format' };
  }
};
