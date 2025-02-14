interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface QueuedRequest {
  execute: () => Promise<unknown>;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitEntry> = new Map();
  private queue: QueuedRequest[] = [];
  private processing = false;
  private readonly defaultConfig: RateLimitConfig = {
    maxRequests: 50,
    windowMs: 1000, // 1 second
  };

  private constructor() {}

  static getInstance(): RateLimiter {
    if (!this.instance) {
      this.instance = new RateLimiter();
    }
    return this.instance;
  }

  async execute<T>(
    endpoint: string,
    operation: () => Promise<T>,
    config: Partial<RateLimitConfig> = {}
  ): Promise<T> {
    const { maxRequests, windowMs } = { ...this.defaultConfig, ...config };

    if (this.shouldQueue(endpoint, maxRequests, windowMs)) {
      return this.queueRequest(endpoint, operation);
    }

    this.incrementCounter(endpoint, windowMs);
    return operation();
  }

  private shouldQueue(endpoint: string, maxRequests: number, windowMs: number): boolean {
    const limit = this.limits.get(endpoint);
    if (!limit) {
      return false;
    }

    if (Date.now() > limit.resetAt) {
      this.limits.delete(endpoint);
      return false;
    }

    return limit.count >= maxRequests;
  }

  private incrementCounter(endpoint: string, windowMs: number): void {
    const now = Date.now();
    const limit = this.limits.get(endpoint);

    if (!limit || now > limit.resetAt) {
      this.limits.set(endpoint, {
        count: 1,
        resetAt: now + windowMs,
      });
      return;
    }

    limit.count++;
  }

  private async queueRequest<T>(
    endpoint: string,
    operation: () => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        execute: operation,
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift();
      if (!request) continue;

      try {
        const result = await request.execute();
        request.resolve(result);
      } catch (error) {
        request.reject(error);
      }

      // Add delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.processing = false;
  }

  getRateLimitInfo(endpoint: string): { remaining: number; resetAt: number } | null {
    const limit = this.limits.get(endpoint);
    if (!limit) {
      return null;
    }

    if (Date.now() > limit.resetAt) {
      this.limits.delete(endpoint);
      return null;
    }

    return {
      remaining: this.defaultConfig.maxRequests - limit.count,
      resetAt: limit.resetAt,
    };
  }

  clearQueue(): void {
    this.queue = [];
  }
}

export const rateLimiter = RateLimiter.getInstance(); 