export type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface RequestMetadata {
  startTime?: number;
  endpoint?: string;
  method?: string;
  [key: string]: unknown;
}

export interface RateLimitOptions {
  maxRequests?: number;
  windowMs?: number;
}

export interface CacheOptions {
  ttl?: number;
  key?: string;
}

export interface APIRequestConfig {
  endpoint: string;
  method?: HTTPMethod;
  body?: unknown;
  headers?: Record<string, string>;
  retries?: number;
  timeout?: number;
  metadata?: RequestMetadata;
  cache?: boolean | CacheOptions;
  rateLimit?: RateLimitOptions;
}

export interface APIResponse {
  ok: boolean;
  status: number;
  headers: Headers;
  data: unknown;
  metadata?: RequestMetadata;
}

export type RequestInterceptor = (config: APIRequestConfig) => Promise<APIRequestConfig>;
export type ResponseInterceptor = (response: APIResponse) => Promise<APIResponse>;

export interface APIErrorResponse {
  message: string;
  code: string;
  details?: unknown;
}

// Common response types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface SuccessResponse<T> {
  data: T;
  message?: string;
}

// Common request types
export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface SearchParams {
  query?: string;
  filters?: Record<string, unknown>;
} 