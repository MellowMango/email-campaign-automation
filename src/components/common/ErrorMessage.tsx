import React from 'react';
import { XCircle } from 'lucide-react';
import { Card } from '../shadcn/Card';

interface ErrorMessageProps {
  error: string;
  suggestion?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function ErrorMessage({ error, suggestion, action, className = '' }: ErrorMessageProps) {
  // Extract error code if present (e.g., "PGRST116: No rows returned")
  const errorCode = error.match(/^([A-Z0-9]+):/)?.[1];
  const errorMessage = errorCode ? error.replace(`${errorCode}:`, '').trim() : error;

  return (
    <Card className={`p-4 bg-red-950/50 border-red-500/50 text-red-200 ${className}`}>
      <div className="flex gap-3">
        <XCircle className="h-5 w-5 text-red-400 flex-shrink-0" />
        <div className="flex-1 space-y-1">
          <div className="flex items-start justify-between">
            <p className="font-medium">
              {errorCode && (
                <span className="font-mono text-sm bg-red-900/50 px-1.5 py-0.5 rounded mr-2">
                  {errorCode}
                </span>
              )}
              {errorMessage}
            </p>
          </div>
          {suggestion && (
            <p className="text-sm text-red-300/80">{suggestion}</p>
          )}
          {action && (
            <button
              onClick={action.onClick}
              className="mt-2 text-sm text-red-300 hover:text-red-200 font-medium"
            >
              {action.label} →
            </button>
          )}
        </div>
      </div>
    </Card>
  );
} 