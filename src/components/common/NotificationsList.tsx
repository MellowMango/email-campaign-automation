import { useState } from 'react';
import { useNotifications } from '../../hooks/useNotifications';
import { Card } from '../shadcn/Card';
import { Button } from '../shadcn/Button';

export function NotificationsList() {
  const { notifications, loading, error, markAsRead } = useNotifications();
  const [markingAsRead, setMarkingAsRead] = useState<Set<string>>(new Set());

  if (loading) {
    return (
      <div className="p-4 text-center text-gray-400">
        Loading notifications...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-center text-red-500">
        Error: {error}
      </div>
    );
  }

  if (notifications.length === 0) {
    return (
      <div className="p-4 text-center text-gray-400">
        No notifications yet
      </div>
    );
  }

  const getTypeStyles = (type: 'info' | 'success' | 'error' | 'warning') => {
    switch (type) {
      case 'success':
        return 'bg-green-900/20 border-green-500/50 text-green-400';
      case 'error':
        return 'bg-red-900/20 border-red-500/50 text-red-400';
      case 'warning':
        return 'bg-yellow-900/20 border-yellow-500/50 text-yellow-400';
      default:
        return 'bg-blue-900/20 border-blue-500/50 text-blue-400';
    }
  };

  const handleMarkAsRead = async (id: string) => {
    setMarkingAsRead(prev => new Set([...prev, id]));
    try {
      await markAsRead(id);
    } finally {
      setMarkingAsRead(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {notifications.map((notification) => (
        <Card
          key={notification.id}
          className={`p-3 border ${getTypeStyles(notification.type)} ${
            notification.status === 'unread' ? 'opacity-100' : 'opacity-60'
          } transition-opacity duration-200`}
        >
          <div className="flex justify-between items-start gap-4">
            <div className="flex-1">
              <h4 className="font-semibold">{notification.title}</h4>
              <p className="text-sm mt-1 text-gray-300">{notification.message}</p>
              {notification.action_url && (
                <a
                  href={notification.action_url}
                  className="text-sm text-blue-400 hover:text-blue-300 mt-2 inline-block"
                >
                  View Details →
                </a>
              )}
            </div>
            {notification.status === 'unread' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleMarkAsRead(notification.id)}
                disabled={markingAsRead.has(notification.id)}
                className={`text-xs transition-opacity duration-200 ${
                  markingAsRead.has(notification.id) ? 'opacity-50' : ''
                }`}
              >
                {markingAsRead.has(notification.id) ? 'Marking...' : 'Mark as Read'}
              </Button>
            )}
          </div>
          <div className="mt-2 text-xs text-gray-500">
            {new Date(notification.created_at).toLocaleString()}
          </div>
        </Card>
      ))}
    </div>
  );
} 