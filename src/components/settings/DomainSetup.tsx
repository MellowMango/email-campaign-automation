import { useState, useEffect } from 'react';
import { Button } from '../shadcn/Button';
import { Card } from '../shadcn/Card';
import { sendgrid } from '../../lib/sendgrid/client';
import { supabase } from '../../lib/supabase/client';
import { useAuth } from '../../contexts/AuthContext';

interface DomainSettings {
  id: string;
  domain: string;
  status: 'pending' | 'verified' | 'failed';
  dns_records: Array<{
    type: string;
    host: string;
    data: string;
  }>;
}

export function DomainSetup() {
  const { user } = useAuth();
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
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
      const { data, error } = await supabase
        .from('domain_settings')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Not found error
          throw error;
        }
      } else {
        setDomainSettings(data);
      }
    } catch (err) {
      console.error('Error fetching domain settings:', err);
      setError('Failed to load domain settings');
    }
  };

  const handleDomainSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedDomain = domain.trim().toLowerCase();
    
    if (!trimmedDomain) {
      setError('Please enter a domain name');
      return;
    }

    // Basic domain format validation
    const domainRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
    if (!domainRegex.test(trimmedDomain)) {
      setError('Please enter a valid domain name (e.g., yourdomain.com)');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      if (!user) throw new Error('User not authenticated');
      
      console.log('Setting up domain:', trimmedDomain);
      const result = await sendgrid.createDomainAuthentication(trimmedDomain, user.id);
      console.log('Domain authentication result:', result);

      if (!result.dnsRecords || result.dnsRecords.length === 0) {
        throw new Error('No DNS records received. Please try again.');
      }

      setDomainSettings({
        id: result.id,
        domain: result.domain,
        status: 'pending',
        dns_records: result.dnsRecords
      });

      setSuccess('Domain authentication created successfully. Please add the DNS records below to verify your domain.');
      
      // Start polling for verification
      setVerifying(true);
      const isVerified = await sendgrid.pollDomainVerification(result.id, user.id);
      setVerifying(false);
      
      if (isVerified) {
        setSuccess('Domain verified successfully!');
        await fetchDomainSettings();
      } else {
        setError('Domain verification timed out. Please check your DNS records and try again.');
      }
    } catch (err) {
      console.error('Domain setup error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to set up domain';
      
      if (errorMessage.includes('already exists')) {
        setError('This domain has already been authenticated. Please use a different domain or contact support.');
      } else if (errorMessage.includes('Invalid domain') || errorMessage.includes('invalid domain')) {
        setError('Please enter a valid domain name that you own.');
      } else if (errorMessage.includes('authentication failed')) {
        setError('SendGrid authentication failed. Please check your API key configuration.');
      } else if (errorMessage.includes('No DNS records')) {
        setError('Failed to get DNS records from SendGrid. Please try again.');
      } else {
        setError(`Failed to set up domain: ${errorMessage}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Domain Authentication</h2>
        {domainSettings?.status === 'verified' && (
          <span className="px-2 py-1 bg-green-900 text-green-300 rounded text-sm">
            Verified
          </span>
        )}
      </div>

      {!domainSettings && (
        <Card>
          <form onSubmit={handleDomainSetup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Domain Name
              </label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g., yourdomain.com"
                className="input"
                required
              />
              <p className="mt-2 text-sm text-gray-400">
                Enter the domain you want to send emails from
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-900/50 border border-red-500 text-red-300 rounded">
                {error}
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-900/50 border border-green-500 text-green-300 rounded">
                {success}
              </div>
            )}

            <Button type="submit" disabled={loading || verifying}>
              {loading ? 'Setting up...' : 'Set Up Domain'}
            </Button>
          </form>
        </Card>
      )}

      {domainSettings && (
        <Card>
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">DNS Records</h3>
              <p className="text-gray-400 mb-4">
                Add these records to your domain's DNS settings to verify ownership and enable email sending.
              </p>
            </div>

            <div className="space-y-4">
              {domainSettings.dns_records.map((record, index) => (
                <div key={index} className="p-4 bg-background-secondary rounded-lg">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Type</label>
                      <code className="text-primary">{record.type}</code>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Host</label>
                      <code className="text-primary">{record.host}</code>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Value</label>
                      <code className="text-primary break-all">{record.data}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {domainSettings.status === 'pending' && (
              <div className="flex items-center justify-between">
                <span className="text-yellow-400">
                  {verifying ? 'Verifying DNS records...' : 'Waiting for DNS verification'}
                </span>
                <Button
                  onClick={() => sendgrid.pollDomainVerification(domainSettings.id, user?.id || '')}
                  disabled={verifying}
                >
                  Check Verification
                </Button>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
} 