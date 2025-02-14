# API Client Documentation

## Overview
The MailVanta API client is a centralized solution for making HTTP requests to our backend services. It provides features like caching, rate limiting, circuit breaking, and CSRF protection out of the box.

## Basic Usage

```typescript
import { apiClient } from '@lib/api/client';

// GET request
const data = await apiClient.get('/campaigns');

// POST request
const newCampaign = await apiClient.post('/campaigns', {
  name: 'My Campaign',
  description: 'Test campaign'
});

// PUT request
const updated = await apiClient.put('/campaigns/123', {
  name: 'Updated Campaign'
});

// DELETE request
await apiClient.delete('/campaigns/123');
```

## Configuration Options

### Request Configuration
```typescript
interface APIRequestConfig {
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  retries?: number;
  timeout?: number;
  cache?: boolean | CacheOptions;
  rateLimit?: RateLimitOptions;
}
```

### Caching
```typescript
// Enable caching for GET requests
const data = await apiClient.get('/campaigns', {
  cache: true
});

// Custom cache TTL
const data = await apiClient.get('/campaigns', {
  cache: {
    ttl: 60000 // 1 minute
  }
});
```

### Rate Limiting
```typescript
// Custom rate limiting
const data = await apiClient.get('/campaigns', {
  rateLimit: {
    maxRequests: 10,
    windowMs: 1000 // 1 second
  }
});
```

## Error Handling

The client throws `APIError` instances for all error cases:

```typescript
try {
  const data = await apiClient.get('/campaigns');
} catch (error) {
  if (error instanceof APIError) {
    console.error(
      `API Error: ${error.message}`,
      `Status: ${error.statusCode}`,
      `Code: ${error.code}`
    );
  }
}
```

### Common Error Types
- `APIError.authenticationError()` - 401 Unauthorized
- `APIError.authorizationError()` - 403 Forbidden
- `APIError.notFoundError()` - 404 Not Found
- `APIError.validationError()` - 400 Bad Request
- `APIError.rateLimitError()` - 429 Too Many Requests
- `APIError.serverError()` - 500 Internal Server Error

## Advanced Features

### Circuit Breaker
The client automatically implements circuit breaking to prevent cascading failures:
- Opens after 5 consecutive failures
- Half-open state after 60 seconds
- Automatically closes on successful request in half-open state

### CSRF Protection
CSRF tokens are automatically handled:
- Fetched on client initialization
- Included in all non-GET requests
- Automatically refreshed when expired

### Request Interceptors
```typescript
apiClient.addRequestInterceptor(async (config) => {
  // Modify request config
  return config;
});
```

### Response Interceptors
```typescript
apiClient.addResponseInterceptor(async (response) => {
  // Process response
  return response;
});
```

## Environment Variables

Required environment variables:
```env
VITE_API_URL=https://api.mailvanta.com
VITE_API_TIMEOUT=10000
VITE_RATE_LIMIT_REQUESTS=50
VITE_RATE_LIMIT_WINDOW_MS=1000
VITE_CIRCUIT_BREAKER_FAILURES=5
VITE_CIRCUIT_BREAKER_RESET_TIMEOUT=60000
VITE_CACHE_DEFAULT_TTL=300000
```

## Best Practices

1. **Always handle errors appropriately:**
```typescript
try {
  const data = await apiClient.get('/campaigns');
} catch (error) {
  if (error instanceof APIError) {
    // Handle specific error types
    switch (error.code) {
      case 'AUTHENTICATION_ERROR':
        // Handle auth error
        break;
      case 'RATE_LIMIT_ERROR':
        // Handle rate limiting
        break;
      default:
        // Handle other errors
    }
  }
}
```

2. **Use caching wisely:**
- Enable for frequently accessed, rarely changed data
- Set appropriate TTL values
- Clear cache when data is modified

3. **Configure rate limits based on endpoint characteristics:**
```typescript
// High-frequency endpoint
const data = await apiClient.get('/status', {
  rateLimit: { maxRequests: 100, windowMs: 1000 }
});

// Low-frequency endpoint
const data = await apiClient.get('/reports', {
  rateLimit: { maxRequests: 10, windowMs: 60000 }
});
```

4. **Set appropriate timeouts:**
```typescript
// Quick operations
const status = await apiClient.get('/status', {
  timeout: 5000
});

// Long-running operations
const report = await apiClient.get('/reports/generate', {
  timeout: 30000
});
``` 