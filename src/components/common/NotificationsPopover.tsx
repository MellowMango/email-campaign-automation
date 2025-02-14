import { useState, useMemo } from 'react';
import { useNotifications } from '../../hooks/useNotifications';
import { NotificationsList } from './NotificationsList';
import { Button } from '../shadcn/Button';
import { Card } from '../shadcn/Card';

export function NotificationsPopover() {
  const [isOpen, setIsOpen] = useState(false);
  const { notifications } = useNotifications();
  
  // Memoize the unread count to prevent unnecessary re-renders
  const unreadCount = useMemo(() => 
    notifications.filter(n => n.status === 'unread').length,
    [notifications]
  );

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center transition-all duration-200 transform scale-100">
            {unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <Card className="absolute right-0 mt-2 w-96 z-50 bg-gray-900 border-gray-800">
            <div className="p-4">
              <NotificationsList />
            </div>
          </Card>
        </>
      )}
    </div>
  );
} 