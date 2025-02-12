import { useState, useEffect } from 'react';
import { Button } from '../shadcn/Button';
import { Card } from '../shadcn/Card';
import { sendgrid } from '../../lib/sendgrid/client';
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
  const [verifying, setVerifying] = useState(false);
  const [verifyingSender, setVerifyingSender] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [domainSettings, setDomainSettings] = useState<DomainSettings | null>(null);

  useEffect(() => {
    if (user) {
      fetchDomainSettings();
    }
  }, [user]);

  useEffect(() => {
    if (domainSettings?.status === 'sender_pending' && !domainSettings.sender_verified) {
      pollSenderVerification();
    }
  }, [domainSettings?.status, domainSettings?.sender_verified]);

  const fetchDomainSettings = async () => {
    try {
      console.log('Fetching domain settings for user:', user?.id);
      const { data, error } = await supabase
        .from('domain_settings')
        .select('*')
        .eq('user_id', user?.id)
        .single();

      if (error) {
        console.error('Error fetching domain settings:', error);
        if (error.code !== 'PGRST116') { // Not found error
          throw error;
        }
      } else {
        console.log('Fetched domain settings:', data);
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

      // Update domain settings with sender email
      const { error: updateError } = await supabase
        .from('domain_settings')
        .update({
          sender_email: senderEmail,
          sender_verified: false,
          status: 'sender_pending'
        })
        .eq('user_id', user.id)
        .eq('domain', domainSettings.domain);

      if (updateError) throw updateError;

      // Send verification email through SendGrid
      const result = await sendgrid.createSenderVerification(senderEmail);
      
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

  const pollSenderVerification = async () => {
    if (!domainSettings?.sender_email || !user) return;
    
    setVerifyingSender(true);
    try {
      const isVerified = await sendgrid.checkSenderVerification(domainSettings.sender_email);
      
      if (isVerified) {
        // Update domain settings with verified status
        const { error: updateError } = await supabase
          .from('domain_settings')
          .update({
            sender_verified: true,
            status: 'verified'
          })
          .eq('user_id', user.id)
          .eq('domain', domainSettings.domain);

        if (updateError) throw updateError;
        
        setSuccess('Sender email verified successfully!');
        await fetchDomainSettings();
      } else {
        // Poll again after 30 seconds
        setTimeout(pollSenderVerification, 30000);
      }
    } catch (err) {
      console.error('Error checking sender verification:', err);
      setError('Failed to verify sender email status');
    } finally {
      setVerifyingSender(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // Add debug logging in render
  console.log('Current domain settings:', domainSettings);
  console.log('Should show sender setup:', domainSettings?.status === 'verified' && !domainSettings?.sender_verified);

  return (
    <div className="space-y-4">
      {!domainSettings && (
        <Card>
          <form onSubmit={handleDomainSetup} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Domain Name</label>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="e.g., yourdomain.com"
                className="input"
                required
              />
            </div>

            {error && (
              <div className="p-2 bg-red-900/50 border border-red-500 text-red-300 rounded text-sm">
                {error}
              </div>
            )}
            {success && (
              <div className="p-2 bg-green-900/50 border border-green-500 text-green-300 rounded text-sm">
                {success}
              </div>
            )}

            <Button type="submit" disabled={loading || verifying}>
              {loading ? 'Setting up...' : 'Set Up Domain'}
            </Button>
          </form>
        </Card>
      )}

      {domainSettings && domainSettings.status === 'verified' && (
        <Card className="divide-y divide-gray-700">
          {/* Domain Status */}
          <div className="flex items-center justify-between pb-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{domainSettings.domain}</h3>
                <span className="px-1.5 py-0.5 bg-green-900 text-green-300 rounded text-xs font-medium">
                  Verified
                </span>
              </div>
              {domainSettings.sender_email && (
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-gray-400">Sender:</span>
                  <span className="text-sm font-medium">{domainSettings.sender_email}</span>
                  <span className="px-1.5 py-0.5 bg-green-900 text-green-300 rounded text-xs">
                    Verified
                  </span>
                </div>
              )}
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => document.getElementById('addSenderForm')?.classList.toggle('hidden')}
            >
              Add Sender
            </Button>
          </div>

          {/* Add Sender Form - Hidden by default */}
          <form id="addSenderForm" onSubmit={handleSenderEmailSetup} className="hidden py-4">
            <div className="flex gap-2">
              <input
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder={`e.g., contact@${domainSettings.domain}`}
                className="input flex-1"
                required
              />
              <Button type="submit" disabled={loading || verifyingSender} size="sm">
                {loading ? 'Verifying...' : 'Verify'}
              </Button>
            </div>
            {(error || success) && (
              <div className={`mt-2 p-2 text-sm rounded ${
                error ? 'bg-red-900/50 border-red-500 text-red-300' : 'bg-green-900/50 border-green-500 text-green-300'
              }`}>
                {error || success}
              </div>
            )}
          </form>

          {/* DNS Records */}
          <div className="pt-4">
            <button
              onClick={() => document.getElementById('dnsRecords')?.classList.toggle('hidden')}
              className="flex items-center justify-between w-full text-left mb-2"
            >
              <span className="font-medium">DNS Records</span>
              <span className="text-sm text-gray-400">Click to view</span>
            </button>
            <div id="dnsRecords" className="hidden space-y-2">
              {domainSettings.dns_records.map((record, index) => (
                <div key={index} className="bg-background-secondary rounded p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{record.type} Record</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => copyToClipboard(record.host)}
                        className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                      >
                        Copy Host
                      </button>
                      <button
                        onClick={() => copyToClipboard(record.data)}
                        className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded"
                      >
                        Copy Value
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-2 text-sm">
                    <div>
                      <span className="text-gray-400">Host:</span>
                      <span className="ml-2 font-mono">{record.host}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Value:</span>
                      <span className="ml-2 font-mono break-all">{record.data}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {domainSettings?.status === 'sender_pending' && (
        <div className="flex items-center justify-between p-2 bg-yellow-900/50 text-yellow-300 rounded text-sm">
          <span>
            {verifyingSender ? 'Checking sender verification...' : 'Please check your email to verify the sender address'}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={pollSenderVerification}
            disabled={verifyingSender}
          >
            Check Status
          </Button>
        </div>
      )}
    </div>
  );
} 