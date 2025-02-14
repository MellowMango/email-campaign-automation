import { APIErrorResponse } from '../types/api';

export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, APIError.prototype);
  }

  static async fromResponse(response: Response): Promise<APIError> {
    try {
      const errorData = await response.json() as APIErrorResponse;
      // Sanitize error messages for production
      const message = import.meta.env.PROD 
        ? this.sanitizeErrorMessage(errorData.message)
        : errorData.message || 'An error occurred';
      
      return new APIError(
        message,
        response.status,
        errorData.code || 'UNKNOWN_ERROR',
        errorData.details
      );
    } catch {
      // If we can't parse the error response, create a generic error
      return new APIError(
        'An unexpected error occurred',
        response.status,
        'UNKNOWN_ERROR'
      );
    }
  }

  private static sanitizeErrorMessage(message: string): string {
    // Remove any potentially sensitive information
    return message.replace(/([a-zA-Z0-9._+-]+@[a-zA-Z0-9._+-]+\.[a-zA-Z0-9._+-]+)/gi, '[EMAIL]')
      .replace(/\b\d{4}\b/g, '[PIN]')
      .replace(/\b\d{16}\b/g, '[CARD]');
  }

  static networkError(error: Error): APIError {
    return new APIError(
      'Network error occurred',
      0,
      'NETWORK_ERROR',
      error.message
    );
  }

  static timeoutError(): APIError {
    return new APIError(
      'Request timed out',
      408,
      'TIMEOUT_ERROR'
    );
  }

  static validationError(details: unknown): APIError {
    return new APIError(
      'Validation error',
      400,
      'VALIDATION_ERROR',
      details
    );
  }

  static authenticationError(): APIError {
    return new APIError(
      'Authentication required',
      401,
      'AUTHENTICATION_ERROR'
    );
  }

  static authorizationError(): APIError {
    return new APIError(
      'Not authorized to perform this action',
      403,
      'AUTHORIZATION_ERROR'
    );
  }

  static notFoundError(): APIError {
    return new APIError(
      'Resource not found',
      404,
      'NOT_FOUND_ERROR'
    );
  }

  static rateLimitError(retryAfter?: number): APIError {
    return new APIError(
      'Rate limit exceeded',
      429,
      'RATE_LIMIT_ERROR',
      { retryAfter }
    );
  }

  static serverError(): APIError {
    return new APIError(
      'Internal server error',
      500,
      'SERVER_ERROR'
    );
  }

  static serviceUnavailableError(): APIError {
    return new APIError(
      'Service temporarily unavailable',
      503,
      'SERVICE_UNAVAILABLE'
    );
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      details: this.details,
    };
  }

  // Helper method to check if error is of specific type
  is(code: string): boolean {
    return this.code === code;
  }
} 