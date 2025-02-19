interface ErrorSuggestion {
  error: string;
  suggestion: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

// Map of known error codes to user-friendly messages and suggestions
const ERROR_SUGGESTIONS: Record<string, ErrorSuggestion> = {
  'PGRST116': {
    error: 'No data found',
    suggestion: 'The requested resource does not exist or has been deleted.'
  },
  'AUTH001': {
    error: 'Authentication failed',
    suggestion: 'Please check your credentials and try again.'
  },
  '23505': {
    error: 'Duplicate entry',
    suggestion: 'An item with this information already exists. Please modify and try again.'
  },
  '42P01': {
    error: 'Database table not found',
    suggestion: 'This is likely a temporary issue. Please try again in a few moments.'
  },
  '23503': {
    error: 'Foreign key violation',
    suggestion: 'The referenced item may have been deleted. Please refresh and try again.'
  }
};

export function getErrorMessage(error: unknown): ErrorSuggestion {
  if (error instanceof Error) {
    // Extract error code if present
    const codeMatch = error.message.match(/^([A-Z0-9]+):/);
    const errorCode = codeMatch?.[1];

    if (errorCode && errorCode in ERROR_SUGGESTIONS) {
      return ERROR_SUGGESTIONS[errorCode];
    }

    // Handle network errors
    if (error.name === 'NetworkError') {
      return {
        error: 'Network error',
        suggestion: 'Please check your internet connection and try again.'
      };
    }

    // Handle timeout errors
    if (error.name === 'TimeoutError') {
      return {
        error: 'Request timeout',
        suggestion: 'The server is taking too long to respond. Please try again.'
      };
    }

    // Default error message with the actual error
    return {
      error: error.message,
      suggestion: 'If this problem persists, please contact support.'
    };
  }

  // Handle string errors
  if (typeof error === 'string') {
    const codeMatch = error.match(/^([A-Z0-9]+):/);
    const errorCode = codeMatch?.[1];

    if (errorCode && errorCode in ERROR_SUGGESTIONS) {
      return ERROR_SUGGESTIONS[errorCode];
    }

    return {
      error,
      suggestion: 'If this problem persists, please contact support.'
    };
  }

  // Default fallback
  return {
    error: 'An unexpected error occurred',
    suggestion: 'Please try again. If the problem persists, contact support.'
  };
}

export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === 'NetworkError' || 
           error.message.toLowerCase().includes('network') ||
           error.message.toLowerCase().includes('fetch');
  }
  return false;
}

export function isAuthenticationError(error: unknown): boolean {
  if (error instanceof Error) {
    return error.message.toLowerCase().includes('auth') ||
           error.message.toLowerCase().includes('unauthorized') ||
           error.message.toLowerCase().includes('unauthenticated');
  }
  return false;
}

export function getRetryDelay(retryCount: number): number {
  // Exponential backoff with max delay of 30 seconds
  return Math.min(Math.pow(2, retryCount) * 1000, 30000);
} 