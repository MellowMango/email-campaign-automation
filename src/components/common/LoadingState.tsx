import { cn } from '../../utils/cn';

interface LoadingStateProps {
  variant?: 'skeleton' | 'spinner' | 'text';
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  className?: string;
  rows?: number;
  fullPage?: boolean;
}

export function LoadingState({
  variant = 'skeleton',
  size = 'md',
  text = 'Loading...',
  className,
  rows = 3,
  fullPage = false,
}: LoadingStateProps) {
  const Container = ({ children }: { children: React.ReactNode }) => {
    if (fullPage) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center">{children}</div>
        </div>
      );
    }
    return <div className={cn('w-full', className)}>{children}</div>;
  };

  if (variant === 'spinner') {
    return (
      <Container>
        <div className="flex items-center justify-center gap-3">
          <svg
            className={cn(
              'animate-spin text-primary',
              {
                'w-4 h-4': size === 'sm',
                'w-6 h-6': size === 'md',
                'w-8 h-8': size === 'lg',
              }
            )}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          {text && <span className="text-gray-400">{text}</span>}
        </div>
      </Container>
    );
  }

  if (variant === 'text') {
    return (
      <Container>
        <div className="text-center text-gray-400">{text}</div>
      </Container>
    );
  }

  // Skeleton variant (default)
  return (
    <Container>
      <div className="animate-pulse space-y-4">
        {[...Array(rows)].map((_, i) => (
          <div
            key={i}
            className={cn('bg-gray-700 rounded', {
              'h-4': size === 'sm',
              'h-6': size === 'md',
              'h-8': size === 'lg',
            })}
          />
        ))}
      </div>
    </Container>
  );
} 