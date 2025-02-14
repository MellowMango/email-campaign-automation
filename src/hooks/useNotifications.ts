import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase/client';
import { useAuth } from '../contexts/AuthContext';

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  status: 'unread' | 'read';
  action_url?: string;
  created_at: string;
  updated_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  // Fetch notifications
  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;
        setNotifications(data || []);
      } catch (err) {
        console.error('Error fetching notifications:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch notifications');
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();

    // Subscribe to real-time notifications
    const subscription = supabase
      .channel('notifications')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setNotifications(prev => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setNotifications(prev => 
              prev.map(notif => 
                notif.id === payload.new.id ? payload.new as Notification : notif
              )
            );
          }
        })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  // Mark notification as read
  const markAsRead = async (id: string) => {
    // Optimistically update the UI
    setNotifications(prev => 
      prev.map(notif => 
        notif.id === id ? { ...notif, status: 'read' } : notif
      )
    );

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          status: 'read',
          updated_at: new Date().toISOString()
        })
        .eq('id', id);

      if (error) {
        // Revert optimistic update on error
        setNotifications(prev => 
          prev.map(notif => 
            notif.id === id ? { ...notif, status: 'unread' } : notif
          )
        );
        console.error('Error marking notification as read:', error);
        throw error;
      }
    } catch (err) {
      // Revert optimistic update on error
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === id ? { ...notif, status: 'unread' } : notif
        )
      );
      console.error('Error marking notification as read:', err);
      throw err;
    }
  };

  // Create a new notification
  const createNotification = async (
    title: string,
    message: string,
    type: Notification['type'] = 'info',
    action_url?: string
  ) => {
    if (!user) throw new Error('User not authenticated');

    try {
      const { error } = await supabase
        .from('notifications')
        .insert({
          user_id: user.id,
          title,
          message,
          type,
          status: 'unread',
          action_url,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

      if (error) {
        console.error('Error creating notification:', error);
        throw error;
      }
    } catch (err) {
      console.error('Error creating notification:', err);
      throw err;
    }
  };

  return {
    notifications,
    loading,
    error,
    markAsRead,
    createNotification,
  };
} 