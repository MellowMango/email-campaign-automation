interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export class APICache {
  private static instance: APICache;
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private readonly defaultTTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {
    // Clean up expired entries periodically
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  static getInstance(): APICache {
    if (!this.instance) {
      this.instance = new APICache();
    }
    return this.instance;
  }

  set<T>(key: string, data: T, ttl = this.defaultTTL): void {
    const now = Date.now();
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl,
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;
    
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  // Generate cache key from request config
  static generateKey(endpoint: string, method: string, params?: Record<string, unknown>): string {
    return `${method}:${endpoint}${params ? ':' + JSON.stringify(params) : ''}`;
  }
}

export const apiCache = APICache.getInstance(); 