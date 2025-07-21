# 🔧 Admin Rate Limit Management API

## Overview
API endpoints để admin quản lý rate limit settings trong database. Tất cả endpoints yêu cầu admin authentication.

---

## Authentication
Tất cả endpoints yêu cầu Bearer token:
```
Authorization: Bearer {admin_token}
```

Để lấy token, sử dụng endpoint login:
```bash
curl -X POST https://api.suifaucet.xyz/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"your_password"}'
```

---

## 1. Bulk Update Rate Limit Settings

### Endpoint
```
PUT /api/v1/admin/rate-limits/bulk
```

### Description
Cập nhật nhiều rate limit settings cùng một lúc. Endpoint này cho phép admin thay đổi multiple settings trong một request duy nhất.

### Request Headers
```
Content-Type: application/json
Authorization: Bearer {admin_token}
```

### Request Body
```json
{
  "settings": {
    "setting_name_1": value,
    "setting_name_2": value,
    "setting_name_3": value
  }
}
```

### Available Settings

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

### Example Request
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

### Success Response (200 OK)
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

### Partial Success Response (200 OK)
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

### Error Responses

**401 Unauthorized**:
```json
{
  "success": false,
  "message": "🚫 Admin authentication required",
  "error": {
    "code": "MISSING_AUTH_TOKEN"
  }
}
```

**400 Bad Request**:
```json
{
  "success": false,
  "message": "Settings object is required"
}
```

**500 Internal Server Error**:
```json
{
  "success": false,
  "message": "Failed to bulk update rate limit settings",
  "error": "Database connection error"
}
```

### Common Use Cases

**Testing Mode (Relaxed Limits)**:
```json
{
  "settings": {
    "faucet_max_per_wallet": 10,
    "faucet_max_per_ip": 50,
    "faucet_cooldown_seconds": 300,
    "rate_limit_enabled": true
  }
}
```

**Emergency Mode (Strict Limits)**:
```json
{
  "settings": {
    "emergency_mode": true,
    "emergency_max_per_ip": 1,
    "emergency_cooldown": 7200,
    "faucet_max_per_wallet": 1
  }
}
```

**Production Mode (Normal Limits)**:
```json
{
  "settings": {
    "faucet_max_per_wallet": 1,
    "faucet_max_per_ip": 10,
    "faucet_cooldown_seconds": 3600,
    "emergency_mode": false,
    "rate_limit_enabled": true
  }
}
```

**Disable Rate Limiting**:
```json
{
  "settings": {
    "rate_limit_enabled": false
  }
}
```

---

## 2. Get All Rate Limit Settings

### Endpoint
```
GET /api/v1/admin/rate-limits
```

### Authentication
Bearer Token required

### Example Request
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.suifaucet.xyz/api/v1/admin/rate-limits
```

### Response
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

---

## 3. Update Single Rate Limit Setting

### Endpoint
```
PUT /api/v1/admin/rate-limits/{settingName}
```

### Authentication
Bearer Token required

### Example Request
```bash
curl -X PUT https://api.suifaucet.xyz/api/v1/admin/rate-limits/faucet_max_per_wallet \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"value": 3}'
```

### Response
```json
{
  "success": true,
  "message": "Rate limit setting updated successfully",
  "data": {
    "setting_name": "faucet_max_per_wallet",
    "new_value": 3,
    "updated_by": "admin"
  }
}
```

---

## 4. Get Current Rate Limit Configuration

### Endpoint
```
GET /api/v1/admin/rate-limits/current-config
```

### Authentication
Bearer Token required

### Example Request
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.suifaucet.xyz/api/v1/admin/rate-limits/current-config
```

### Response
```json
{
  "success": true,
  "data": {
    "rate_limit_enabled": true,
    "rate_limit_window_ms": 3600000,
    "faucet_max_per_wallet": 1,
    "faucet_max_per_ip": 10,
    "faucet_cooldown_seconds": 3600,
    "api_max_requests_per_window": 1000,
    "api_burst_limit": 20,
    "wallet_daily_limit": 5,
    "wallet_weekly_limit": 10,
    "emergency_mode": false,
    "emergency_max_per_ip": 1,
    "emergency_cooldown": 7200
  },
  "timestamp": "2025-07-21T10:30:00Z"
}
```

---

## Notes

- **Real-time Effect**: Tất cả settings được cập nhật sẽ có hiệu lực ngay lập tức
- **Activity Logging**: Admin activity sẽ được log vào database
- **Error Handling**: Settings không tồn tại sẽ được báo lỗi nhưng không làm fail toàn bộ request
- **Type Conversion**: Values sẽ được convert theo đúng type (string, number, boolean)
- **Cache Management**: Cache sẽ được clear sau khi update thành công

---

**Last Updated**: July 21, 2025  
**API Version**: 1.0.0
