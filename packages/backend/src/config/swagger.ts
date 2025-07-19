import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Sui Testnet Faucet API',
      version: '1.0.0',
      description: `
# 🌊 Sui Testnet Faucet API

A user-friendly Sui Testnet Faucet DApp backend that helps developers quickly get testnet tokens without the usual friction.

## 🚀 Features

- **Token Distribution**: Get SUI testnet tokens instantly
- **Rate Limiting**: Smart abuse prevention (per IP & wallet)
- **Admin Dashboard**: Complete monitoring and management
- **Database Integration**: PostgreSQL + Redis for persistence
- **Security**: API key authentication + bcrypt admin auth

## 🔐 Authentication

### API Key Authentication
Most endpoints require an API key in the Authorization header:
\`\`\`
Authorization: Bearer YOUR_API_KEY
\`\`\`

### Admin Authentication
Admin endpoints require admin login token:
1. Login via \`/api/v1/admin/login\`
2. Use returned token in Authorization header

## 📊 Rate Limits

- **Per Wallet**: 1 request per hour
- **Per IP**: 100 requests per hour
- Only successful requests count toward limits

## 🌐 Network

- **Network**: Sui Testnet
- **Amount**: 0.1 SUI per request (configurable)
- **Explorer**: https://suiscan.xyz/testnet/

## 📝 Response Format

All responses follow this format:
\`\`\`json
{
  "success": true|false,
  "message": "Human readable message",
  "data": { ... },
  "timestamp": "2025-07-18T06:00:00.000Z"
}
\`\`\`
      `,
      contact: {
        name: 'Sui Faucet Support',
        url: 'https://github.com/your-repo/sui-faucet',
        email: 'support@suifaucet.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server'
      },
      {
        url: 'http://13.211.123.118',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API_KEY',
          description: 'Enter your API key)'
        },
        AdminAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Admin authentication token from login endpoint'
        }
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Operation completed successfully'
            },
            data: {
              type: 'object'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-07-18T06:00:00.000Z'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Operation failed'
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  example: 'ERROR_CODE'
                },
                details: {
                  type: 'string',
                  example: 'Detailed error message'
                }
              }
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              example: '2025-07-18T06:00:00.000Z'
            }
          }
        },
        WalletAddress: {
          type: 'string',
          pattern: '^0x[a-fA-F0-9]{64}$',
          example: '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
          description: 'Valid Sui wallet address (64 hex characters with 0x prefix)'
        },
        TransactionHash: {
          type: 'string',
          example: '5AbRLKAT9cr66TNEvpGwbz4teVDSJc7qZcuDGuukDa69',
          description: 'Sui transaction hash'
        },
        Amount: {
          type: 'object',
          properties: {
            mist: {
              type: 'string',
              example: '100000000',
              description: 'Amount in mist (smallest SUI unit)'
            },
            sui: {
              type: 'string',
              example: '0.100000',
              description: 'Amount in SUI (human readable)'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Public',
        description: 'Public endpoints (no authentication required)'
      },
      {
        name: 'Faucet',
        description: 'Token distribution endpoints'
      },
      {
        name: 'Auth',
        description: 'Authentication endpoints'
      },
      {
        name: 'Admin',
        description: 'Admin management endpoints'
      },
      {
        name: 'Admin Faucet',
        description: 'Admin faucet management endpoints'
      }
    ]
  },
  apis: process.env.NODE_ENV === 'production'
    ? [
        './dist/routes/*.js',
        './dist/index.js'
      ]
    : [
        './src/routes/*.ts',
        './src/index.ts'
      ]
};

export const swaggerSpec = swaggerJsdoc(options);
