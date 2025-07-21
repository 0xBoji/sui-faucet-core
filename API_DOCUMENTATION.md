# 🌊 Sui Faucet API Documentation

**Base URL:** `http://13.211.123.118`

## 📋 Table of Contents
- [Public Endpoints](#public-endpoints)
- [Faucet Endpoints](#faucet-endpoints)
- [Admin Endpoints](#admin-endpoints)
- [Authentication](#authentication)
- [Error Codes](#error-codes)

---

## 🌐 Public Endpoints

### 1. API Information
**GET** `/`

Get basic information about the API.

**Response:**
```json
{
  "success": true,
  "message": "🌊 Sui Testnet Faucet API",
  "data": {
    "name": "Sui Testnet Faucet",
    "version": "1.0.0",
    "description": "Get SUI testnet tokens instantly",
    "network": "testnet",
    "endpoints": {
      "faucet": "/api/v1/faucet/request",
      "health": "/api/v1/health",
      "auth": "/api/v1/auth/verify",
      "admin": "/api/v1/admin/login",
      "docs": "/docs",
      "swagger": "/api-docs"
    }
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

### 2. Health Check
**GET** `/api/v1/health`

Check the health status of the API and its dependencies.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-07-19T15:40:37.000Z",
  "uptime": "5h 23m 14s",
  "responseTime": "12ms",
  "services": {
    "database": "connected",
    "redis": "connected",
    "sui": "connected"
  }
}
```

---

## 🚰 Faucet Endpoints

### 1. Request Tokens
**POST** `/api/v1/faucet/request`

Request SUI testnet tokens for a wallet address.

**Headers:**
```
Content-Type: application/json
X-API-Key: suisuisui
```

**Request Body:**
```json
{
  "address": "0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "✅ Successfully sent 0.1 SUI to 0x1234...123456",
  "data": {
    "transactionHash": "EAyDBD64EeHT7hDrb2k31Pk7rQm8GfRnk5kWTAmP7ooq",
    "amount": "100000000",
    "amountInSui": 0.1,
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456",
    "network": "testnet",
    "explorerUrl": "https://suiscan.xyz/testnet/tx/EAyDBD64EeHT7hDrb2k31Pk7rQm8GfRnk5kWTAmP7ooq"
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

**Rate Limited Response (429):**
```json
{
  "success": false,
  "message": "Rate limit exceeded. Please try again in 3542 seconds.",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "details": "You can request tokens once per hour per wallet"
  },
  "retryAfter": 3542,
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

### 2. Faucet Status
**GET** `/api/v1/faucet/status`

Get current faucet status and configuration.

**Headers:**
```
X-API-Key: suisuisui
```

**Response:**
```json
{
  "success": true,
  "message": "Faucet status retrieved successfully",
  "data": {
    "balanceInSui": 6.451941964,
    "network": "testnet",
    "defaultAmountInSui": 0.1,
    "isOperational": true,
    "rateLimits": {
      "perWallet": "1 request per hour",
      "perIP": "10 requests per hour",
      "global": "1000 requests per hour"
    }
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

---

## 🔐 Admin Endpoints

### 1. Admin Login
**POST** `/api/v1/admin/login`

Authenticate admin user and get access token.

**Request Body:**
```json
{
  "username": "admin",
  "password": "your_admin_password"
}
```

**Success Response:**
```json
{
  "success": true,
  "message": "Admin login successful",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": "24h",
    "user": {
      "username": "admin",
      "role": "admin"
    }
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

### 2. Admin Dashboard
**GET** `/api/v1/admin/dashboard`

Get admin dashboard data with system overview.

**Headers:**
```
Authorization: Bearer YOUR_ADMIN_TOKEN
```

**Response:**
```json
{
  "success": true,
  "message": "Dashboard data retrieved successfully",
  "data": {
    "systemStats": {
      "totalRequests": 1247,
      "successfulRequests": 1156,
      "failedRequests": 91,
      "uniqueUsers": 423
    },
    "faucetInfo": {
      "balance": "6.451941964",
      "network": "testnet",
      "isOperational": true
    },
    "recentActivity": [
      {
        "timestamp": "2025-07-19T15:35:22.000Z",
        "action": "token_request",
        "wallet": "0x1234...5678",
        "amount": "0.1",
        "status": "success"
      }
    ]
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

### 3. Faucet Statistics
**GET** `/api/v1/admin/faucet/stats?days=7`

Get detailed faucet usage statistics.

**Headers:**
```
Authorization: Bearer YOUR_ADMIN_TOKEN
```

**Query Parameters:**
- `days` (optional): Number of days to retrieve stats for (default: 7)

**Response:**
```json
{
  "success": true,
  "message": "Faucet statistics retrieved successfully",
  "data": {
    "totalRequests": 1247,
    "successfulRequests": 1156,
    "failedRequests": 91,
    "uniqueUsers": 423,
    "totalAmountDistributed": "115.6",
    "dailyBreakdown": [
      {
        "date": "2025-07-19",
        "requests": 89,
        "successful": 82,
        "failed": 7,
        "amount": "8.2"
      }
    ],
    "topUsers": [
      {
        "wallet": "0x1234...5678",
        "requests": 5,
        "totalAmount": "0.5"
      }
    ]
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

### 4. Test Faucet Transaction
**POST** `/api/v1/admin/faucet/test`

Send a test transaction from the faucet (admin only).

**Headers:**
```
Authorization: Bearer YOUR_ADMIN_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "walletAddress": "0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456",
  "amount": "200000000"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Test transaction completed successfully",
  "data": {
    "transactionHash": "5AbRLKAT9cr66TNEvpGwbz4teVDSJc7qZcuDGuukDa69",
    "amount": "200000000",
    "amountInSui": 0.2,
    "walletAddress": "0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456",
    "explorerUrl": "https://suiscan.xyz/testnet/tx/5AbRLKAT9cr66TNEvpGwbz4teVDSJc7qZcuDGuukDa69"
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

---

## 🔐 Authentication

### API Key Authentication
Most endpoints require an API key in the `X-API-Key` header:
```
X-API-Key: suisuisui
```

### Admin Authentication
Admin endpoints require a Bearer token obtained from the login endpoint:
```
Authorization: Bearer YOUR_ADMIN_TOKEN
```

---

## 📊 Rate Limits

- **Per Wallet**: 1 request per hour
- **Per IP**: 10 requests per hour  
- **Global**: 1000 requests per hour

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1642694400
```

---

## ❌ Error Codes

### Common Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "message": "Invalid wallet address format",
  "error": {
    "code": "INVALID_ADDRESS",
    "details": "Wallet address must be 64 hex characters with 0x prefix"
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

**401 Unauthorized:**
```json
{
  "success": false,
  "message": "Authentication required",
  "error": {
    "code": "AUTH_REQUIRED",
    "details": "API key required for this endpoint"
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

**429 Rate Limited:**
```json
{
  "success": false,
  "message": "Rate limit exceeded. Please try again in 3542 seconds.",
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "details": "You can request tokens once per hour per wallet"
  },
  "retryAfter": 3542,
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

**500 Internal Server Error:**
```json
{
  "success": false,
  "message": "Internal server error",
  "error": {
    "code": "INTERNAL_ERROR",
    "details": "An unexpected error occurred"
  },
  "timestamp": "2025-07-19T15:40:37.000Z"
}
```

---

## 🧪 Testing Examples

### Using cURL

**Request tokens:**
```bash
curl -X POST http://13.211.123.118/api/v1/faucet/request \
  -H "Content-Type: application/json" \
  -H "X-API-Key: suisuisui" \
  -d '{"address": "0x1234567890abcdef1234567890abcdef12345678901234567890abcdef123456"}'
```

**Check health:**
```bash
curl http://13.211.123.118/api/v1/health
```

**Admin login:**
```bash
curl -X POST http://13.211.123.118/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your_password"}'
```

---

## � Admin Rate Limit Management

### Bulk Update Rate Limit Settings

**Endpoint**: `PUT /api/v1/admin/rate-limits/bulk`

**Description**: Cập nhật nhiều rate limit settings cùng một lúc. Endpoint này cho phép admin thay đổi multiple settings trong một request duy nhất.

**Authentication**:
- **Required**: Yes
- **Type**: Bearer Token (JWT)
- **Header**: `Authorization: Bearer {admin_token}`

**Request Headers**:
```
Content-Type: application/json
Authorization: Bearer {admin_token}
```

**Request Body**:
```json
{
  "settings": {
    "setting_name_1": value,
    "setting_name_2": value,
    "setting_name_3": value
  }
}
```

**Available Settings**:

| Setting Name | Type | Description | Default | Example Values |
|--------------|------|-------------|---------|----------------|
| `rate_limit_enabled` | boolean | Bật/tắt rate limiting toàn cục | `true` | `true`, `false` |
| `rate_limit_window_ms` | number | Thời gian window (milliseconds) | `3600000` | `1800000` (30 phút), `7200000` (2 giờ) |
| `faucet_max_per_wallet` | number | Max requests per wallet per window | `1` | `1`, `3`, `5` |
| `faucet_max_per_ip` | number | Max requests per IP per window | `10` | `5`, `20`, `50` |
| `faucet_cooldown_seconds` | number | Cooldown giữa các requests (seconds) | `3600` | `300` (5 phút), `1800` (30 phút) |
| `api_max_requests_per_window` | number | Max API requests per window | `1000` | `500`, `2000` |
| `api_burst_limit` | number | API burst limit | `20` | `10`, `50` |
| `wallet_daily_limit` | number | Max requests per wallet per day | `5` | `3`, `10` |
| `wallet_weekly_limit` | number | Max requests per wallet per week | `10` | `5`, `20` |
| `emergency_mode` | boolean | Chế độ khẩn cấp | `false` | `true`, `false` |
| `emergency_max_per_ip` | number | Emergency mode: max per IP | `1` | `1`, `2` |
| `emergency_cooldown` | number | Emergency mode: cooldown (seconds) | `7200` | `3600`, `14400` |

**Example Request**:
```bash
curl -X PUT https://api.suifaucet.xyz/api/v1/admin/rate-limits/bulk \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "faucet_max_per_wallet": 5,
      "faucet_max_per_ip": 20,
      "faucet_cooldown_seconds": 1800,
      "emergency_mode": false,
      "rate_limit_enabled": true
    }
  }'
```

**Success Response (200 OK)**:
```json
{
  "success": true,
  "message": "Updated 5 settings",
  "data": {
    "updated": [
      {
        "setting_name": "faucet_max_per_wallet",
        "new_value": 5
      },
      {
        "setting_name": "faucet_max_per_ip",
        "new_value": 20
      },
      {
        "setting_name": "faucet_cooldown_seconds",
        "new_value": 1800
      },
      {
        "setting_name": "emergency_mode",
        "new_value": false
      },
      {
        "setting_name": "rate_limit_enabled",
        "new_value": true
      }
    ],
    "errors": [],
    "updated_by": "admin"
  }
}
```

**Partial Success Response (200 OK)**:
```json
{
  "success": false,
  "message": "Updated 3 settings, 2 errors",
  "data": {
    "updated": [
      {
        "setting_name": "faucet_max_per_wallet",
        "new_value": 5
      },
      {
        "setting_name": "faucet_max_per_ip",
        "new_value": 20
      },
      {
        "setting_name": "faucet_cooldown_seconds",
        "new_value": 1800
      }
    ],
    "errors": [
      {
        "setting_name": "invalid_setting",
        "error": "Setting not found"
      },
      {
        "setting_name": "another_invalid",
        "error": "Setting not found"
      }
    ],
    "updated_by": "admin"
  }
}
```

**Error Responses**:

*401 Unauthorized*:
```json
{
  "success": false,
  "message": "🚫 Admin authentication required",
  "error": {
    "code": "MISSING_AUTH_TOKEN"
  }
}
```

*400 Bad Request*:
```json
{
  "success": false,
  "message": "Settings object is required"
}
```

*500 Internal Server Error*:
```json
{
  "success": false,
  "message": "Failed to bulk update rate limit settings",
  "error": "Database connection error"
}
```

**Example Request**:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.suifaucet.xyz/api/v1/admin/rate-limits
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "setting_name": "rate_limit_enabled",
      "setting_value": "true",
      "setting_type": "boolean",
      "description": "Enable/disable rate limiting globally",
      "category": "general",
      "is_active": true,
      "updated_at": "2025-07-21T10:30:00Z",
      "updated_by": "admin"
    },
    {
      "id": 2,
      "setting_name": "faucet_max_per_wallet",
      "setting_value": "1",
      "setting_type": "number",
      "description": "Maximum requests per wallet per window",
      "category": "faucet",
      "is_active": true,
      "updated_at": "2025-07-21T10:30:00Z",
      "updated_by": "system"
    }
  ],
  "total": 12
}
```
## �📚 Additional Resources

- **Swagger UI**: http://13.211.123.118/api-docs/
- **Sui Explorer**: https://suiscan.xyz/testnet/
- **Network**: Sui Testnet
- **Default Amount**: 0.1 SUI per request

---

**Last Updated**: July 21, 2025
**API Version**: 1.0.0
