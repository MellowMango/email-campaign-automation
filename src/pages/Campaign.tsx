import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase/client';
import type { Campaign, Email, Contact } from '../types';
import { Button } from '../components/shadcn/Button';
import { Card } from '../components/shadcn/Card';
import { generateEmailContent } from '../lib/openai';
import { EmailSequencePlanner } from '../components/campaign/EmailSequencePlanner';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { ContactSelectionModal } from '../components/campaign/ContactSelectionModal';

// Helper function to format dates consistently
const formatDateForInput = (dateStr: string) => {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatDateForDisplay = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export default function Campaign() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'emails' | 'analytics' | 'details'>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState<{
    id?: string;
    subject: string;
    content: string;
    scheduled_at: string;
  }>({
    subject: '',
    content: '',
    scheduled_at: ''
  });
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [showSequencePlanner, setShowSequencePlanner] = useState(false);
  const [showContactSelection, setShowContactSelection] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);
  const [campaignDetails, setCampaignDetails] = useState<Partial<Campaign>>({});
  const [startDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 1);
    return date;
  });
  
  const [endDate] = useState(() => {
    const date = new Date();
    date.setFullYear(date.getFullYear() + 1);
    return date;
  });

  // Auto-dismiss success message after 6.5 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 6500);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  type EmailTone = 'formal' | 'casual' | 'professional' | 'friendly';
  type CampaignType = 'manual' | 'ai-adaptive';
  
  interface CampaignFeatures {
    adaptive_sequences: boolean;
    auto_responder: boolean;
    lead_scoring: boolean;
  }

  const defaultFeatures: CampaignFeatures = {
    adaptive_sequences: false,
    auto_responder: false,
    lead_scoring: false
  };

  if (!id) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-red-500">Error: Campaign ID is required</div>
      </div>
    );
  }

  useEffect(() => {
    const fetchCampaignData = async () => {
      try {
        // Fetch campaign details
        const { data: campaignData, error: campaignError } = await supabase
          .from('campaigns')
          .select('*')
          .eq('id', id)
          .single();

        if (campaignError) throw campaignError;
        
        // Ensure cta_links exists with default values
        const defaultCtaLinks = {
          awareness: '',
          conversion: '',
          nurture: ''
        };
        
        setCampaign({
          ...campaignData,
          cta_links: campaignData.cta_links || defaultCtaLinks
        });

        // Fetch campaign emails
        const { data: emailsData, error: emailsError } = await supabase
          .from('emails')
          .select('*')
          .eq('campaign_id', id)
          .order('scheduled_at', { ascending: true });

        if (emailsError) throw emailsError;
        setEmails(emailsData);

        // Fetch campaign contacts
        const { data: contactsData, error: contactsError } = await supabase
          .from('contacts')
          .select('*')
          .eq('campaign_id', id)
          .order('created_at', { ascending: false });

        if (contactsError) throw contactsError;
        setContacts(contactsData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchCampaignData();

    // Subscribe to real-time updates
    const subscriptions = [
      supabase
        .channel('emails')
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'emails',
            filter: `campaign_id=eq.${id}`
          }, 
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setEmails(prev => [...prev, payload.new as Email]);
            } else if (payload.eventType === 'DELETE') {
              setEmails(prev => prev.filter(email => email.id !== payload.old.id));
            } else if (payload.eventType === 'UPDATE') {
              setEmails(prev => prev.map(email => 
                email.id === payload.new.id ? payload.new as Email : email
              ));
            }
          }
        )
        .subscribe(),

      supabase
        .channel('contacts')
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'contacts',
            filter: `campaign_id=eq.${id}`
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setContacts(prev => [payload.new as Contact, ...prev]);
            } else if (payload.eventType === 'DELETE') {
              setContacts(prev => prev.filter(contact => contact.id !== payload.old.id));
            } else if (payload.eventType === 'UPDATE') {
              setContacts(prev => prev.map(contact =>
                contact.id === payload.new.id ? payload.new as Contact : contact
              ));
            }
          }
        )
        .subscribe()
    ];

    return () => {
      subscriptions.forEach(subscription => subscription.unsubscribe());
    };
  }, [id]);

  const handleCreateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    
    try {
      const scheduledAt = newEmail.scheduled_at ? new Date(newEmail.scheduled_at).toISOString() : null;
      const emailData = {
        campaign_id: id,
        subject: newEmail.subject,
        content: newEmail.content,
        scheduled_at: scheduledAt,
        status: scheduledAt ? ('pending' as const) : ('draft' as const)
      };
      
      if (newEmail.id) {
        // Update existing email
        const { error } = await supabase
          .from('emails')
          .update({
            subject: emailData.subject,
            content: emailData.content,
            scheduled_at: emailData.scheduled_at,
            status: emailData.status
          })
          .eq('id', newEmail.id);

        if (error) throw error;
        
        // Update local state
        setEmails(prev => prev.map(email => 
          email.id === newEmail.id 
            ? { ...email, ...emailData }
            : email
        ));
        
        setSuccessMessage('Email updated successfully');
      } else {
        // Create new email
        const { data, error } = await supabase
          .from('emails')
          .insert([emailData])
          .select()
          .single();

        if (error) throw error;
        
        // Update local state
        if (data) {
          setEmails(prev => [data as Email, ...prev]);
        }

        // Reset form only for new emails
        setNewEmail({
          subject: '',
          content: '',
          scheduled_at: ''
        });
        
        setSuccessMessage('Email created successfully');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save email');
    }
  };

  const handleEmailSelect = async (email: Email) => {
    setNewEmail({
      id: email.id,
      subject: email.subject,
      content: email.content,
      scheduled_at: email.scheduled_at ? formatDateForInput(email.scheduled_at) : ''
    });
    
    // Generate new content for the selected email
    await handleGenerateContent(email);
  };

  const handleGenerateContent = async (existingEmail?: Email) => {
    if (!campaign) {
      setError('Campaign not found');
      return;
    }

    setIsGeneratingContent(true);
    try {
      const prompt = existingEmail ? 
        `Generate content for this planned email in the campaign sequence:
Campaign Name: ${campaign.name}
Description: ${campaign.description || 'N/A'}
Target Audience: ${campaign.target_audience || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
Value Proposition: ${campaign.value_proposition || 'N/A'}
Sequence Type: ${existingEmail.metadata?.sequence_type || 'N/A'}
Email Stage: ${existingEmail.metadata?.topic?.stage || 'N/A'}
Email Topic: ${existingEmail.metadata?.topic?.name || 'N/A'}
Topic Description: ${existingEmail.metadata?.topic?.description || 'N/A'}
CTA Link: ${campaign.cta_links[existingEmail.metadata?.sequence_type || 'awareness'] || 'N/A'}

Current Subject Line (DO NOT CHANGE): ${existingEmail.subject}

Current Content: ${existingEmail.content}

Please generate new content that:
1. Maintains the exact same subject line
2. Focuses specifically on the email topic and stage from the sequence plan
3. Creates engaging and persuasive content aligned with the sequence type
4. Follows the campaign goals and target audience
5. Maintains a ${campaign.email_tone || 'professional'} tone
6. Naturally incorporates the CTA link in a way that matches the sequence type and stage
   - For awareness: Focus on educational value before presenting the CTA
   - For conversion: Make the CTA prominent and compelling
   - For nurture: Present the CTA as a valuable resource` :
        `Generate a new email for the campaign:
Campaign Name: ${campaign.name}
Description: ${campaign.description || 'N/A'}
Target Audience: ${campaign.target_audience || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
Value Proposition: ${campaign.value_proposition || 'N/A'}
CTA Link: ${campaign.cta_links.awareness || 'N/A'}

Please generate a persuasive email that aligns with the campaign goals and target audience.
Include the CTA link in a way that naturally flows with the content.`;

      const { subject, content } = await generateEmailContent(
        prompt,
        campaign.target_audience || 'N/A',
        campaign.email_tone || 'professional',
        campaign.company_name
      );

      // Log the AI generation
      const { error: logError } = await supabase
        .from('ai_logs')
        .insert([
          {
            campaign_id: id,
            email_id: existingEmail?.id,
            prompt,
            response: `Subject: ${existingEmail ? existingEmail.subject : subject}\nContent: ${content}`,
            model: 'gpt-4-turbo-preview'
          }
        ]);

      if (logError) {
        console.error('Failed to log AI generation:', logError);
      }

      // Update the email with new content
      if (existingEmail?.id) {
        const { error: updateError } = await supabase
          .from('emails')
          .update({
            content,
            status: 'pending'
          })
          .eq('id', existingEmail.id);

        if (updateError) throw updateError;
      }

      setNewEmail(prev => ({
        ...prev,
        id: existingEmail?.id,
        subject: existingEmail ? existingEmail.subject : subject,
        content,
        scheduled_at: existingEmail?.scheduled_at ? formatDateForInput(existingEmail.scheduled_at) : prev.scheduled_at
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate content');
    } finally {
      setIsGeneratingContent(false);
    }
  };

  const handleUpdateCampaignStatus = async (status: Campaign['status']) => {
    try {
      const { error } = await supabase
        .from('campaigns')
        .update({ status })
        .eq('id', id);

      if (error) throw error;
      setCampaign(prev => prev ? { ...prev, status } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign status');
    }
  };

  const handleAddContacts = async (selectedContacts: Contact[]) => {
    try {
      // Update the campaign_id for all selected contacts
      const { error } = await supabase
        .from('contacts')
        .update({ campaign_id: id })
        .in('id', selectedContacts.map(c => c.id));

      if (error) throw error;

      // Refresh contacts
      const { data: refreshedContacts, error: refreshError } = await supabase
        .from('contacts')
        .select('*')
        .eq('campaign_id', id)
        .order('created_at', { ascending: false });

      if (refreshError) throw refreshError;
      setContacts(refreshedContacts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contacts to campaign');
    }
  };

  // Update the status badge rendering
  const getStatusBadgeClasses = (status: Email['status']) => {
    switch (status) {
      case 'sent':
        return 'bg-green-900 text-green-300';
      case 'failed':
        return 'bg-red-900 text-red-300';
      case 'ready':
        return 'bg-blue-900 text-blue-300';
      default:
        return 'bg-yellow-900 text-yellow-300';
    }
  };

  const handleUpdateCampaignDetails = async () => {
    if (!campaign || !campaignDetails) return;
    
    try {
      const { error } = await supabase
        .from('campaigns')
        .update({
          name: campaignDetails.name || campaign.name,
          description: campaignDetails.description,
          target_audience: campaignDetails.target_audience,
          goals: campaignDetails.goals,
          value_proposition: campaignDetails.value_proposition,
          email_tone: campaignDetails.email_tone as EmailTone,
          campaign_type: campaignDetails.campaign_type as CampaignType,
          duration: campaignDetails.duration,
          emails_per_week: campaignDetails.emails_per_week,
          features: {
            adaptive_sequences: campaignDetails.features?.adaptive_sequences ?? false,
            auto_responder: campaignDetails.features?.auto_responder ?? false,
            lead_scoring: campaignDetails.features?.lead_scoring ?? false
          },
          cta_links: campaignDetails.cta_links
        })
        .eq('id', campaign.id);

      if (error) throw error;
      
      setCampaign(prev => prev ? { ...prev, ...campaignDetails } : null);
      setEditingDetails(false);
      setSuccessMessage('Campaign details updated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update campaign details');
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-gray-300">Loading...</div>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center">
        <div className="text-red-500">Error: {error || 'Campaign not found'}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 border-b border-gray-700 pb-4">
          <div>
            <Button
              variant="secondary"
              onClick={() => navigate('/dashboard')}
              className="mb-4 md:mb-0"
            >
              ← Back to Dashboard
            </Button>
            <h1 className="text-3xl md:text-4xl font-bold">{campaign.name}</h1>
            <p className="text-gray-400">{campaign.description}</p>
          </div>
          <div className="mt-4 md:mt-0">
            <select
              value={campaign.status}
              onChange={(e) => handleUpdateCampaignStatus(e.target.value as Campaign['status'])}
              className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex space-x-4 mb-8 border-b border-gray-700">
          <button
            className={`px-4 py-2 ${activeTab === 'overview' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}
            onClick={() => setActiveTab('overview')}
          >
            Overview
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 'details' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}
            onClick={() => setActiveTab('details')}
          >
            Details
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 'contacts' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}
            onClick={() => setActiveTab('contacts')}
          >
            Contacts ({contacts.length})
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 'emails' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}
            onClick={() => setActiveTab('emails')}
          >
            Emails ({emails.length})
          </button>
          <button
            className={`px-4 py-2 ${activeTab === 'analytics' ? 'text-indigo-400 border-b-2 border-indigo-400' : 'text-gray-400'}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-2">Total Contacts</h3>
              <p className="text-3xl font-bold">{contacts.length}</p>
            </Card>
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-2">Emails Sent</h3>
              <p className="text-3xl font-bold">{campaign.analytics?.sent || 0}</p>
            </Card>
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-2">Open Rate</h3>
              <p className="text-3xl font-bold">
                {campaign.analytics?.sent
                  ? Math.round((campaign.analytics.opened / campaign.analytics.sent) * 100)
                  : 0}%
              </p>
            </Card>
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-2">Response Rate</h3>
              <p className="text-3xl font-bold">
                {campaign.analytics?.sent
                  ? Math.round((campaign.analytics.replied / campaign.analytics.sent) * 100)
                  : 0}%
              </p>
            </Card>
          </div>
        )}

        {activeTab === 'details' && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Campaign Details</h2>
              {!editingDetails ? (
                <Button onClick={() => setEditingDetails(true)}>Edit Details</Button>
              ) : (
                <div className="space-x-4">
                  <Button variant="secondary" onClick={() => setEditingDetails(false)}>Cancel</Button>
                  <Button onClick={handleUpdateCampaignDetails}>Save Changes</Button>
                </div>
              )}
            </div>

            {successMessage && (
              <div className="bg-green-500/20 text-green-500 p-4 rounded-lg">
                {successMessage}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Basic Information</h3>
                  {editingDetails ? (
                    <>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Campaign Name</label>
                          <input
                            type="text"
                            value={campaignDetails.name || campaign.name}
                            onChange={(e) => setCampaignDetails(prev => ({ ...prev, name: e.target.value }))}
                            className="input"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Description</label>
                          <textarea
                            value={campaignDetails.description || campaign.description || ''}
                            onChange={(e) => setCampaignDetails(prev => ({ ...prev, description: e.target.value }))}
                            className="input min-h-[100px]"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium mb-2">Campaign Name</label>
                          <p className="text-gray-300">{campaign.name}</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-2">Description</label>
                          <p className="text-gray-300">{campaign.description || 'No description provided'}</p>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Call-to-Action Links</h3>
                  {editingDetails ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Awareness CTA Link</label>
                        <input
                          type="url"
                          value={campaignDetails.cta_links?.awareness || campaign.cta_links.awareness}
                          onChange={(e) => setCampaignDetails(prev => ({
                            ...prev,
                            cta_links: {
                              ...(prev.cta_links || campaign.cta_links),
                              awareness: e.target.value
                            }
                          }))}
                          placeholder="https://example.com/learn-more"
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Conversion CTA Link</label>
                        <input
                          type="url"
                          value={campaignDetails.cta_links?.conversion || campaign.cta_links.conversion}
                          onChange={(e) => setCampaignDetails(prev => ({
                            ...prev,
                            cta_links: {
                              ...(prev.cta_links || campaign.cta_links),
                              conversion: e.target.value
                            }
                          }))}
                          placeholder="https://example.com/sign-up"
                          className="input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Nurture CTA Link</label>
                        <input
                          type="url"
                          value={campaignDetails.cta_links?.nurture || campaign.cta_links.nurture}
                          onChange={(e) => setCampaignDetails(prev => ({
                            ...prev,
                            cta_links: {
                              ...(prev.cta_links || campaign.cta_links),
                              nurture: e.target.value
                            }
                          }))}
                          placeholder="https://example.com/resources"
                          className="input"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">Awareness CTA Link</label>
                        <p className="text-gray-300">{campaign.cta_links.awareness || 'No link provided'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Conversion CTA Link</label>
                        <p className="text-gray-300">{campaign.cta_links.conversion || 'No link provided'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">Nurture CTA Link</label>
                        <p className="text-gray-300">{campaign.cta_links.nurture || 'No link provided'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Target Audience</h3>
                  {editingDetails ? (
                    <textarea
                      value={campaignDetails.target_audience || campaign.target_audience || ''}
                      onChange={(e) => setCampaignDetails(prev => ({ ...prev, target_audience: e.target.value }))}
                      className="input w-full"
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-300">{campaign.target_audience || 'Not specified'}</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Goals</h3>
                  {editingDetails ? (
                    <textarea
                      value={campaignDetails.goals || campaign.goals || ''}
                      onChange={(e) => setCampaignDetails(prev => ({ ...prev, goals: e.target.value }))}
                      className="input w-full"
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-300">{campaign.goals || 'Not specified'}</p>
                  )}
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Value Proposition</h3>
                  {editingDetails ? (
                    <textarea
                      value={campaignDetails.value_proposition || campaign.value_proposition || ''}
                      onChange={(e) => setCampaignDetails(prev => ({ ...prev, value_proposition: e.target.value }))}
                      className="input w-full"
                      rows={3}
                    />
                  ) : (
                    <p className="text-gray-300">{campaign.value_proposition || 'Not specified'}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Email Tone</label>
                    {editingDetails ? (
                      <select
                        value={campaignDetails.email_tone || campaign.email_tone || ''}
                        onChange={(e) => setCampaignDetails(prev => ({ 
                          ...prev, 
                          email_tone: e.target.value as EmailTone 
                        }))}
                        className="input w-full"
                      >
                        <option value="formal">Formal</option>
                        <option value="casual">Casual</option>
                        <option value="professional">Professional</option>
                        <option value="friendly">Friendly</option>
                      </select>
                    ) : (
                      <p className="text-gray-300">{campaign.email_tone || 'Not specified'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Campaign Type</label>
                    {editingDetails ? (
                      <select
                        value={campaignDetails.campaign_type || campaign.campaign_type || ''}
                        onChange={(e) => setCampaignDetails(prev => ({ 
                          ...prev, 
                          campaign_type: e.target.value as CampaignType 
                        }))}
                        className="input w-full"
                      >
                        <option value="manual">Manual</option>
                        <option value="ai-adaptive">AI Adaptive</option>
                      </select>
                    ) : (
                      <p className="text-gray-300">{campaign.campaign_type}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Duration (days)</label>
                    {editingDetails ? (
                      <input
                        type="number"
                        value={campaignDetails.duration || campaign.duration || ''}
                        onChange={(e) => setCampaignDetails(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                        className="input w-full"
                        min="1"
                      />
                    ) : (
                      <p className="text-gray-300">{campaign.duration} days</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Emails per Week</label>
                    {editingDetails ? (
                      <input
                        type="number"
                        value={campaignDetails.emails_per_week || campaign.emails_per_week || ''}
                        onChange={(e) => setCampaignDetails(prev => ({ ...prev, emails_per_week: parseInt(e.target.value) }))}
                        className="input w-full"
                        min="1"
                        max="7"
                      />
                    ) : (
                      <p className="text-gray-300">{campaign.emails_per_week} emails/week</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-2">Features</label>
                  {editingDetails ? (
                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={campaignDetails.features?.adaptive_sequences ?? false}
                          onChange={(e) => setCampaignDetails(prev => ({
                            ...prev,
                            features: {
                              ...(prev.features ?? defaultFeatures),
                              adaptive_sequences: e.target.checked
                            }
                          }))}
                          className="checkbox"
                        />
                        <span>Adaptive Sequences</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={campaignDetails.features?.auto_responder ?? false}
                          onChange={(e) => setCampaignDetails(prev => ({
                            ...prev,
                            features: {
                              ...(prev.features ?? defaultFeatures),
                              auto_responder: e.target.checked
                            }
                          }))}
                          className="checkbox"
                        />
                        <span>Auto Responder</span>
                      </label>
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={campaignDetails.features?.lead_scoring ?? false}
                          onChange={(e) => setCampaignDetails(prev => ({
                            ...prev,
                            features: {
                              ...(prev.features ?? defaultFeatures),
                              lead_scoring: e.target.checked
                            }
                          }))}
                          className="checkbox"
                        />
                        <span>Lead Scoring</span>
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {campaign.features?.adaptive_sequences && <p className="text-gray-300">✓ Adaptive Sequences</p>}
                      {campaign.features?.auto_responder && <p className="text-gray-300">✓ Auto Responder</p>}
                      {campaign.features?.lead_scoring && <p className="text-gray-300">✓ Lead Scoring</p>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="space-y-6 mb-8">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold">Contact List</h2>
              <Button onClick={() => setShowContactSelection(true)}>Add Contacts</Button>
            </div>
            <Card className="p-4">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left border-b border-gray-700">
                      <th className="py-2 px-2">Name</th>
                      <th className="py-2 px-2">Email</th>
                      <th className="py-2 px-2">Company</th>
                      <th className="py-2 px-2">Status</th>
                      <th className="py-2 px-2">Last Contacted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map((contact) => (
                      <tr key={contact.id} className="border-b border-gray-700 hover:bg-gray-800 transition-colors">
                        <td className="py-2 px-2">{contact.first_name} {contact.last_name}</td>
                        <td className="py-2 px-2">{contact.email}</td>
                        <td className="py-2 px-2">{contact.company || '-'}</td>
                        <td className="py-2 px-2">
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
                        <td className="py-2 px-2">
                          {contact.last_contacted
                            ? new Date(contact.last_contacted).toLocaleDateString()
                            : '-'}
                        </td>
                      </tr>
                    ))}
                    {contacts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-400">
                          No contacts added to this campaign yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'emails' && (
          <>
            {/* Calendar View */}
            <Card className="p-6 mb-6">
              <h3 className="text-xl font-semibold mb-6">Email Calendar</h3>
              <div className="h-[600px] bg-background rounded-lg">
                <style>
                  {`
                    /* Calendar Container */
                    .fc {
                      --fc-border-color: rgba(75, 85, 99, 0.15);
                      --fc-button-bg-color: #4f46e5;
                      --fc-button-border-color: #4f46e5;
                      --fc-button-hover-bg-color: #4338ca;
                      --fc-button-hover-border-color: #4338ca;
                      --fc-button-active-bg-color: #3730a3;
                      --fc-button-active-border-color: #3730a3;
                      --fc-today-bg-color: rgba(79, 70, 229, 0.2);
                      --fc-page-bg-color: transparent;
                      background: transparent;
                    }

                    /* Header Styling */
                    .fc .fc-toolbar {
                      padding: 0.75rem 1rem;
                      margin-bottom: 0.5rem !important;
                    }

                    .fc .fc-toolbar-title {
                      font-size: 1.25rem;
                      font-weight: 600;
                      color: #e5e7eb;
                    }

                    /* Button Styling */
                    .fc .fc-button {
                      padding: 0.375rem 0.75rem;
                      font-size: 0.875rem;
                      border-radius: 0.375rem;
                      font-weight: 500;
                      transition: all 0.15s ease;
                    }

                    .fc .fc-button:focus {
                      box-shadow: 0 0 0 2px rgba(79, 70, 229, 0.4);
                    }

                    .fc .fc-button-group {
                      gap: 0.25rem;
                    }

                    /* Cell Styling */
                    .fc .fc-daygrid-day {
                      min-height: 120px;
                      transition: background-color 0.15s ease;
                    }

                    .fc .fc-daygrid-day.fc-day-today {
                      background-color: var(--fc-today-bg-color);
                    }

                    .fc .fc-daygrid-day.fc-day-today .fc-daygrid-day-number {
                      background: rgba(79, 70, 229, 0.3);
                      color: #fff;
                      font-weight: 600;
                      border-radius: 0.375rem;
                    }

                    .fc .fc-daygrid-day-frame {
                      padding: 0.375rem;
                      min-height: 100%;
                    }

                    /* Event Styling */
                    .fc-event {
                      border: none;
                      border-radius: 0.25rem;
                      padding: 0.25rem 0.5rem;
                      margin: 0.125rem 0;
                      font-size: 0.75rem;
                      line-height: 1.4;
                      transition: transform 0.15s ease;
                      cursor: pointer;
                      white-space: normal !important;
                      overflow: hidden;
                      text-overflow: ellipsis;
                      display: -webkit-box;
                      -webkit-line-clamp: 2;
                      -webkit-box-orient: vertical;
                    }

                    .fc-daygrid-event-harness {
                      margin-top: 0.25rem !important;
                    }

                    .fc-event:hover {
                      transform: translateY(-1px);
                    }

                    /* More Events Link */
                    .fc-daygrid-more-link {
                      font-size: 0.75rem;
                      color: #e5e7eb;
                      background: rgba(79, 70, 229, 0.2);
                      padding: 0.25rem 0.5rem;
                      border-radius: 0.25rem;
                      margin-top: 0.375rem;
                      font-weight: 500;
                    }

                    .fc-daygrid-more-link:hover {
                      background: rgba(79, 70, 229, 0.3);
                      color: #fff;
                    }

                    /* Status-based Event Colors */
                    .event-draft {
                      background-color: rgba(156, 163, 175, 0.15) !important;
                      border-left: 2px solid #9ca3af !important;
                    }

                    .event-ready {
                      background-color: rgba(79, 70, 229, 0.15) !important;
                      border-left: 2px solid #4f46e5 !important;
                    }

                    .event-sent {
                      background-color: rgba(16, 185, 129, 0.15) !important;
                      border-left: 2px solid #10b981 !important;
                    }

                    .event-failed {
                      background-color: rgba(239, 68, 68, 0.15) !important;
                      border-left: 2px solid #ef4444 !important;
                    }
                  `}
                </style>
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  events={emails.map(email => ({
                    id: email.id,
                    title: email.subject,
                    start: email.scheduled_at || email.created_at,
                    end: email.scheduled_at || email.created_at,
                    extendedProps: {
                      status: email.status,
                      content: email.content
                    },
                    className: `event-${email.status}`
                  }))}
                  height="600px"
                  headerToolbar={{
                    left: 'prevYear,prev,next,nextYear',
                    center: 'title',
                    right: 'today'
                  }}
                  dayMaxEvents={3}
                  moreLinkContent={(args) => `+${args.num} more`}
                  fixedWeekCount={false}
                  showNonCurrentDates={true}
                  titleFormat={{ year: 'numeric', month: 'long' }}
                  buttonText={{
                    today: 'Today',
                    prevYear: '<<',
                    nextYear: '>>',
                    prev: '<',
                    next: '>'
                  }}
                  eventDidMount={(info) => {
                    const tooltip = document.createElement('div');
                    tooltip.className = 'fixed bg-gray-900/95 text-white p-3 rounded-lg shadow-xl text-sm max-w-xs backdrop-blur-sm border border-gray-700/50';
                    tooltip.innerHTML = `
                      <div class="font-medium text-base">${info.event.title}</div>
                      <div class="text-gray-300 mt-2 text-sm leading-relaxed">${info.event.extendedProps.content.substring(0, 100)}...</div>
                      <div class="mt-2 flex items-center gap-2">
                        <span class="capitalize px-2 py-1 rounded-full text-xs ${
                          info.event.extendedProps.status === 'sent' ? 'bg-green-900/50 text-green-300 border border-green-500/30' :
                          info.event.extendedProps.status === 'failed' ? 'bg-red-900/50 text-red-300 border border-red-500/30' :
                          info.event.extendedProps.status === 'ready' ? 'bg-indigo-900/50 text-indigo-300 border border-indigo-500/30' :
                          'bg-gray-800/50 text-gray-300 border border-gray-600/30'
                        }">${info.event.extendedProps.status}</span>
                        <span class="text-gray-400 text-xs">${new Date(info.event.start!).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                    `;

                    const element = info.el;
                    element.title = '';

                    element.addEventListener('mouseover', () => {
                      document.body.appendChild(tooltip);
                      const rect = element.getBoundingClientRect();
                      tooltip.style.position = 'fixed';
                      tooltip.style.top = `${rect.bottom + 8}px`;
                      tooltip.style.left = `${rect.left}px`;
                      tooltip.style.zIndex = '10000';
                    });

                    element.addEventListener('mouseout', () => {
                      if (document.body.contains(tooltip)) {
                        document.body.removeChild(tooltip);
                      }
                    });
                  }}
                />
              </div>
            </Card>

            {/* Split Screen Layout */}
            <div className="grid grid-cols-2 gap-6">
              {/* Left Side - Email Creation Form */}
              <Card className="p-4">
                <h3 className="text-lg font-semibold mb-4">
                  {newEmail.id ? 'Edit Email' : 'Create New Email'}
                </h3>
                {successMessage && (
                  <div className="mb-4 p-3 bg-green-900/50 border border-green-500 text-green-300 rounded">
                    {successMessage}
                  </div>
                )}
                {error && (
                  <div className="mb-4 p-3 bg-red-900/50 border border-red-500 text-red-300 rounded">
                    {error}
                  </div>
                )}
                <form onSubmit={handleCreateEmail} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={newEmail.subject}
                      onChange={(e) => setNewEmail(prev => ({ ...prev, subject: e.target.value }))}
                      className="input w-full"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Content
                    </label>
                    <textarea
                      value={newEmail.content}
                      onChange={(e) => setNewEmail(prev => ({ ...prev, content: e.target.value }))}
                      className="input w-full"
                      rows={10}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Schedule Send
                    </label>
                    <input
                      type="datetime-local"
                      value={newEmail.scheduled_at}
                      onChange={(e) => setNewEmail(prev => ({ ...prev, scheduled_at: e.target.value }))}
                      className="input w-full"
                    />
                  </div>
                  <div className="flex space-x-4">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleGenerateContent(newEmail.id ? emails.find(e => e.id === newEmail.id) : undefined)}
                      disabled={isGeneratingContent}
                    >
                      {isGeneratingContent ? 'Generating...' : 'Generate with AI'}
                    </Button>
                    <Button type="submit">
                      {newEmail.id ? 'Update Email' : 'Create Email'}
                    </Button>
                    {newEmail.id && (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setNewEmail({
                          subject: '',
                          content: '',
                          scheduled_at: ''
                        })}
                      >
                        Cancel Edit
                      </Button>
                    )}
                  </div>
                </form>
              </Card>

              {/* Right Side - Email List */}
              <div className="h-[calc(100vh-16rem)] flex flex-col">
                <h3 className="text-lg font-semibold mb-4">Scheduled Emails</h3>
                <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                  {emails.map((email) => (
                    <Card 
                      key={email.id} 
                      variant="hover"
                      onClick={() => handleEmailSelect(email)}
                      className="cursor-pointer transition-transform hover:scale-[1.02] p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold">{email.subject}</h4>
                          <p className="text-sm text-gray-400 mt-1 line-clamp-2">{email.content}</p>
                          {email.metadata?.sequence_type && (
                            <div className="flex gap-2 mt-2">
                              <span className="text-xs px-2 py-1 bg-indigo-400/20 text-indigo-400 rounded">
                                {email.metadata.sequence_type.charAt(0).toUpperCase() + email.metadata.sequence_type.slice(1)}
                              </span>
                              {email.metadata.topic?.stage && (
                                <span className="text-xs px-2 py-1 bg-secondary/20 text-secondary rounded">
                                  {email.metadata.topic.stage}
                                </span>
                              )}
                            </div>
                          )}
                          {email.scheduled_at && (
                            <p className="text-sm text-gray-500 mt-2">
                              Scheduled for: {formatDateForDisplay(email.scheduled_at)}
                            </p>
                          )}
                        </div>
                        <span
                          className={`ml-4 px-2 py-1 rounded text-sm ${getStatusBadgeClasses(email.status)}`}
                        >
                          {email.status === 'ready' ? 'Ready to Send' : 
                            email.status.charAt(0).toUpperCase() + email.status.slice(1)}
                        </span>
                      </div>
                    </Card>
                  ))}
                  {emails.length === 0 && (
                    <p className="text-gray-400 text-center py-4">
                      No emails created yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-8 mb-8">
            <Card className="p-4">
              <h2 className="text-xl font-bold mb-4">Campaign Performance</h2>
              <div className="h-64 bg-gray-800 rounded flex items-center justify-center">
                <p className="text-gray-400">Analytics visualization coming soon</p>
              </div>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="p-4">
                <h3 className="text-lg font-semibold mb-4">Engagement Metrics</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span>Open Rate</span>
                    <span className="font-semibold">
                      {campaign.analytics?.sent
                        ? Math.round((campaign.analytics.opened / campaign.analytics.sent) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Click Rate</span>
                    <span className="font-semibold">
                      {campaign.analytics?.sent
                        ? Math.round((campaign.analytics.clicked / campaign.analytics.sent) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Response Rate</span>
                    <span className="font-semibold">
                      {campaign.analytics?.sent
                        ? Math.round((campaign.analytics.replied / campaign.analytics.sent) * 100)
                        : 0}%
                    </span>
                  </div>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="text-lg font-semibold mb-4">Contact Status</h3>
                <div className="space-y-4">
                  {['new', 'contacted', 'responded', 'converted', 'unsubscribed'].map(status => {
                    const count = contacts.filter(c => c.status === status).length;
                    const percentage = contacts.length ? Math.round((count / contacts.length) * 100) : 0;
                    return (
                      <div key={status} className="flex justify-between items-center">
                        <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                        <span className="font-semibold">{count} ({percentage}%)</span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        )}

        {showContactSelection && (
          <ContactSelectionModal
            campaignId={id}
            onClose={() => setShowContactSelection(false)}
            onSave={handleAddContacts}
          />
        )}
      </div>
    </div>
  );
}