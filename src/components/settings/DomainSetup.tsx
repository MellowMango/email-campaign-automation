import { useState, useEffect } from 'react';
import { Button } from '../shadcn/Button';
import { Card } from '../shadcn/Card';
import { emailService } from '../../lib/email/service';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../contexts/AuthContext';

interface DomainSettings {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed' | 'sender_pending';
  dns_records: Array<{
    type: string;
    host: string;
    data: string;
  }>;
  sender_email?: string;
  sender_verified?: boolean;
}

export function DomainSetup() {
  const { user } = useAuth();
  const [domain, setDomain] = useState('');
  const [senderEmail, setSenderEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [domainSettings, setDomainSettings] = useState<DomainSettings | null>(null);

  useEffect(() => {
    if (user) {
      fetchDomainSettings();
    }
  }, [user]);

  const fetchDomainSettings = async () => {
    try {
      if (!user) return;

      const { data, error } = await supabase
        .from('domain_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      setDomainSettings(data);
    } catch (err) {
      console.error('Error fetching domain settings:', err);
    }
  };

  const handleDomainSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain) {
      setError('Please enter a domain');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!user) throw new Error('User not authenticated');

      // Initialize email service if not already initialized
      const provider = emailService.getProvider();

      // Verify domain
      const result = await provider.verifyDomain(domain, user.id);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to verify domain');
      }

      setSuccess('Domain verification initiated. Please add the following DNS records to your domain:');
      await fetchDomainSettings();
    } catch (err) {
      console.error('Domain setup error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to set up domain';
      setError(`Failed to set up domain: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSenderEmailSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainSettings?.domain) {
      setError('Please set up and verify your domain first');
      return;
    }

    const emailRegex = new RegExp(`^[a-zA-Z0-9._%+-]+@${domainSettings.domain}$`);
    if (!emailRegex.test(senderEmail)) {
      setError(`Email must be from your verified domain: ${domainSettings.domain}`);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!user) throw new Error('User not authenticated');

      // Initialize email service if not already initialized
      const provider = emailService.getProvider();

      // Verify sender email
      const result = await provider.verifySender(senderEmail, user.id);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to verify sender');
      }

      setSuccess('Verification email sent. Please check your inbox to verify the sender email.');
      await fetchDomainSettings();
    } catch (err) {
      console.error('Sender email setup error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to set up sender email';
      setError(`Failed to set up sender email: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="p-4">
          <h2 className="text-lg font-semibold mb-4">Domain Setup</h2>
          
          {!domainSettings && (
            <form onSubmit={handleDomainSetup} className="space-y-4">
              <div>
                <label htmlFor="domain" className="block text-sm font-medium text-gray-700">
                  Domain Name
                </label>
                <input
                  type="text"
                  id="domain"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="example.com"
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  disabled={loading}
                />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? 'Setting up...' : 'Set up Domain'}
              </Button>
            </form>
          )}

          {domainSettings && (
            <div className="space-y-4">
              <div>
                <h3 className="text-md font-medium">Current Domain</h3>
                <p className="text-sm text-gray-600">{domainSettings.domain}</p>
                <p className="text-sm text-gray-600">Status: {domainSettings.status}</p>
              </div>

              {domainSettings.dns_records && (
                <div>
                  <h3 className="text-md font-medium mb-2">DNS Records</h3>
                  <div className="space-y-2">
                    {domainSettings.dns_records.map((record, index) => (
                      <div key={index} className="text-sm">
                        <p>Type: {record.type}</p>
                        <p>Host: {record.host}</p>
                        <p>Value: {record.data}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {domainSettings.status === 'verified' && !domainSettings.sender_email && (
                <form onSubmit={handleSenderEmailSetup} className="space-y-4">
                  <div>
                    <label htmlFor="senderEmail" className="block text-sm font-medium text-gray-700">
                      Sender Email
                    </label>
                    <input
                      type="email"
                      id="senderEmail"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder={`sender@${domainSettings.domain}`}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                      disabled={loading}
                    />
                  </div>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Verifying...' : 'Verify Sender Email'}
                  </Button>
                </form>
              )}
            </div>
          )}

          {error && (
            <div className="mt-4 text-sm text-red-600">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-4 text-sm text-green-600">
              {success}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
} 