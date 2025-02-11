import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useCampaigns } from '../hooks/useCampaigns';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';
import { CampaignSetup, CampaignSetupData } from '../components/campaign/CampaignSetup';
import { supabase } from '../lib/supabase/client';
import type { Contact } from '../lib/supabase/client';

export default function Dashboard() {
  const { user } = useAuth();
  const { campaigns, loading: campaignsLoading, error: campaignsError, createCampaign } = useCampaigns();
  const [isCreating, setIsCreating] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalContacts, setTotalContacts] = useState(0);
  const [contactsLoading, setContactsLoading] = useState(true);

  // Fetch contacts when component mounts
  useEffect(() => {
    const fetchContacts = async () => {
      try {
        // Get total count
        const { count: totalCount, error: countError } = await supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user?.id);

        if (countError) throw countError;
        setTotalContacts(totalCount || 0);

        // Get recent contacts
        const { data, error } = await supabase
          .from('contacts')
          .select('*')
          .eq('user_id', user?.id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;
        setContacts(data || []);
      } catch (err) {
        console.error('Error fetching contacts:', err);
      } finally {
        setContactsLoading(false);
      }
    };

    if (user) {
      fetchContacts();
    }
  }, [user]);

  const handleCreateCampaign = async (data: CampaignSetupData) => {
    try {
      await createCampaign(
        data.name,
        data.description,
        {
          target_audience: data.targetAudience,
          goals: data.goals,
          value_proposition: data.valueProposition,
          email_tone: data.emailTone,
          campaign_type: data.campaignType,
          duration: data.duration,
          emails_per_week: data.emailsPerWeek,
          features: {
            adaptive_sequences: data.enableAdaptiveSequences,
            auto_responder: data.enableAutoResponder,
            lead_scoring: data.enableLeadScoring,
          }
        }
      );
      setIsCreating(false);
    } catch (err) {
      console.error('Failed to create campaign:', err);
    }
  };

  if (campaignsLoading || contactsLoading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-gray-300">Loading...</div>
      </div>
    );
  }

  if (campaignsError) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-red-500">Error: {campaignsError.message}</div>
      </div>
    );
  }

  // Update the statistics calculations
  const convertedContacts = contacts.filter(c => c.status === 'converted').length;
  const respondedContacts = contacts.filter(c => c.status === 'responded').length;
  const responseRate = totalContacts ? Math.round((respondedContacts / totalContacts) * 100) : 0;
  const conversionRate = totalContacts ? Math.round((convertedContacts / totalContacts) * 100) : 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400">Welcome back, {user?.email}</p>
        </div>
        <div className="space-x-4">
          <Link to="/contacts">
            <Button variant="secondary">Manage Contacts</Button>
          </Link>
          <Button onClick={() => setIsCreating(true)}>Create Campaign</Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card>
          <h3 className="text-lg font-semibold mb-2">Active Campaigns</h3>
          <p className="text-3xl font-bold">
            {campaigns.filter(c => c.status === 'active').length}
          </p>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold mb-2">Total Contacts</h3>
          <p className="text-3xl font-bold">{totalContacts}</p>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold mb-2">Response Rate</h3>
          <p className="text-3xl font-bold">{responseRate}%</p>
        </Card>
        <Card>
          <h3 className="text-lg font-semibold mb-2">Conversion Rate</h3>
          <p className="text-3xl font-bold">{conversionRate}%</p>
        </Card>
      </div>

      {isCreating && (
        <CampaignSetup
          onClose={() => setIsCreating(false)}
          onSave={handleCreateCampaign}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Campaigns Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Recent Campaigns</h2>
            <Link to="/campaigns" className="text-primary hover:text-primary-hover">
              View All →
            </Link>
          </div>
          <div className="grid gap-4">
            {campaigns.slice(0, 3).map((campaign) => (
              <Link
                key={campaign.id}
                to={`/campaign/${campaign.id}`}
              >
                <Card variant="hover" className="h-full">
                  <h3 className="text-xl font-semibold mb-2">{campaign.name}</h3>
                  <p className="text-gray-400 mb-4">
                    {campaign.description || 'No description'}
                  </p>
                  <div className="flex justify-between items-center">
                    <span
                      className={`px-2 py-1 rounded text-sm ${
                        campaign.status === 'active'
                          ? 'bg-green-900 text-green-300'
                          : campaign.status === 'draft'
                          ? 'bg-gray-700 text-gray-300'
                          : 'bg-yellow-900 text-yellow-300'
                      }`}
                    >
                      {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
                    </span>
                    <span className="text-sm text-gray-400">
                      {new Date(campaign.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Contacts Section */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Recent Contacts</h2>
            <Link to="/contacts" className="text-primary hover:text-primary-hover">
              View All →
            </Link>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-gray-700">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-gray-700">
                      <td className="py-2">{contact.first_name} {contact.last_name}</td>
                      <td className="py-2">{contact.email}</td>
                      <td className="py-2">
                        <span className={`px-2 py-1 rounded text-sm ${
                          contact.status === 'converted'
                            ? 'bg-green-900 text-green-300'
                            : contact.status === 'responded'
                            ? 'bg-blue-900 text-blue-300'
                            : 'bg-gray-700 text-gray-300'
                        }`}>
                          {contact.status.charAt(0).toUpperCase() + contact.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-2">
                        <div className="flex items-center">
                          <div className="w-16 bg-gray-700 rounded-full h-2 mr-2">
                            <div
                              className="bg-primary rounded-full h-2"
                              style={{ width: `${Math.min(100, contact.engagement_score)}%` }}
                            />
                          </div>
                          <span className="text-sm">{contact.engagement_score}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
} 