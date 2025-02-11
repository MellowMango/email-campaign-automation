import { useEffect, useState } from 'react';
import { supabase } from './client';
import type { Profile } from './client';
import { useAuth } from '../../contexts/AuthContext';

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setProfile(data);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('Failed to fetch profile'));
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();

    // Subscribe to profile changes
    const subscription = supabase
      .channel('profiles')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'profiles',
          filter: `id=eq.${user.id}`
        }, 
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setProfile(payload.new as Profile);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) throw new Error('User must be authenticated');

    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single();

    if (error) throw error;
    return data as Profile;
  };

  return {
    profile,
    loading,
    error,
    updateProfile,
  };
} 