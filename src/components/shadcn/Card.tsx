import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'hover';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg bg-background-secondary p-6',
          {
            'transition-colors hover:bg-gray-800': variant === 'hover',
          },
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
); 