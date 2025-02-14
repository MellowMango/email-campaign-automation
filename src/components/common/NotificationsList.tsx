import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../hooks/useNotifications';
import { Card } from '../shadcn/Card';
import { Button } from '../shadcn/Button';
import type { Notification } from '../../types';

export function NotificationsList() {
  const navigate = useNavigate();
  const { notifications, loading, error, markAsRead, deleteNotification, deleteAllNotifications } = useNotifications();
  const [markingAsRead, setMarkingAsRead] = useState<Set<string>>(new Set());
  const [clearingAll, setClearingAll] = useState(false);

  const handleClearAll = async () => {
    setClearingAll(true);
    try {
      await deleteAllNotifications();
    } finally {
      setClearingAll(false);
    }
  };

  const handleMarkAsRead = async (notification: Notification) => {
    setMarkingAsRead(prev => new Set([...prev, notification.id]));
    try {
      await markAsRead(notification.id);
    } finally {
      setMarkingAsRead(prev => {
        const next = new Set(prev);
        next.delete(notification.id);
        return next;
      });
    }
  };

  const handleAction = (notification: Notification) => {
    if (notification.metadata?.action) {
      navigate(notification.metadata.action.url);
      if (notification.status === 'unread') {
        handleMarkAsRead(notification);
      }
    }
  };

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

  const getTypeStyles = (type: Notification['type']) => {
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

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Notifications</h3>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAll}
              disabled={clearingAll}
              className="text-xs"
            >
              {clearingAll ? 'Clearing...' : 'Clear All'}
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {notifications.map((notification) => (
          <Card
            key={notification.id}
            className={`p-3 ${getTypeStyles(notification.type)} ${
              notification.status === 'unread' ? 'border-l-4 border-l-primary' : 'opacity-75'
            }`}
          >
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1">
                <h4 className="font-medium text-sm">{notification.title}</h4>
                <p className="text-sm text-gray-400 mt-1">{notification.message}</p>
                {notification.metadata?.action && (
                  <Button
                    variant="link"
                    size="sm"
                    className="mt-2 text-primary hover:text-primary/80 p-0"
                    onClick={() => handleAction(notification)}
                  >
                    {notification.metadata.action.label} →
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                {notification.status === 'unread' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleMarkAsRead(notification)}
                    disabled={markingAsRead.has(notification.id)}
                    className="text-xs"
                  >
                    {markingAsRead.has(notification.id) ? 'Marking...' : 'Mark as Read'}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteNotification(notification.id)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Delete
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
} 