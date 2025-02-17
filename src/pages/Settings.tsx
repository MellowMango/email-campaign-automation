import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase/client';
import type { Profile } from '../lib/supabase/client';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';
import { DomainSetup } from '../components/settings/DomainSetup';
import { UsageDashboard } from '../components/usage/UsageDashboard';

export default function Settings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error('Auth error:', userError);
        throw userError;
      }
      
      if (!user) {
        console.error('No user found in session');
        throw new Error('No user found');
      }

      console.log('Fetching profile for user:', user.id);
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('Profile fetch error:', profileError);
        // If profile doesn't exist, create it
        if (profileError.code === 'PGRST116') {
          console.log('Profile not found, creating new profile');
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{
              id: user.id,
              email: user.email,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select()
            .single();
            
          if (createError) {
            console.error('Profile creation error:', createError);
            // If creation fails, try one more time with the trigger
            const { data: triggerProfile, error: triggerError } = await supabase
              .rpc('handle_new_user')
              .select()
              .single();
              
            if (triggerError) {
              console.error('Profile trigger error:', triggerError);
              throw triggerError;
            }
            
            setProfile(triggerProfile);
            return;
          }
          
          setProfile(newProfile);
          return;
        }
        throw profileError;
      }

      console.log('Profile fetched successfully:', profile);
      setProfile(profile);
    } catch (err) {
      console.error('Error in fetchProfile:', err);
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: profile.full_name,
          company_name: profile.company_name,
          role: profile.role,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id);

      if (error) throw error;
      setSuccessMessage('Profile updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-gray-300">Loading...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Settings</h1>

      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-semibold mb-4">Usage & Billing</h2>
          <UsageDashboard />
        </section>

        <Card>
          <h2 className="text-xl font-bold mb-6">Profile Settings</h2>
          <form onSubmit={handleUpdateProfile} className="space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2">
                Email
              </label>
              <input
                type="email"
                value={profile?.email || ''}
                disabled
                className="input opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={profile?.full_name || ''}
                onChange={(e) => setProfile(prev => prev ? { ...prev, full_name: e.target.value } : null)}
                className="input"
                placeholder="Enter your full name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={profile?.company_name || ''}
                onChange={(e) => setProfile(prev => prev ? { ...prev, company_name: e.target.value } : null)}
                className="input"
                placeholder="Enter your company name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Role
              </label>
              <input
                type="text"
                value={profile?.role || ''}
                onChange={(e) => setProfile(prev => prev ? { ...prev, role: e.target.value } : null)}
                className="input"
                placeholder="Enter your role"
              />
            </div>

            {error && (
              <div className="text-red-500 text-sm">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="text-green-500 text-sm">
                {successMessage}
              </div>
            )}

            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>

        {/* Domain Authentication Section */}
        <DomainSetup />
      </div>
    </div>
  );
} 