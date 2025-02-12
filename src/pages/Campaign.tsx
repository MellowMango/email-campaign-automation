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
  const [activeTab, setActiveTab] = useState<'overview' | 'contacts' | 'emails' | 'analytics'>('overview');
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
        setCampaign(campaignData);

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
        // Don't reset form for updates
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

Current Subject Line (DO NOT CHANGE): ${existingEmail.subject}

Current Content: ${existingEmail.content}

Please generate new content that:
1. Maintains the exact same subject line
2. Focuses specifically on the email topic and stage from the sequence plan
3. Creates engaging and persuasive content aligned with the sequence type
4. Follows the campaign goals and target audience
5. Maintains a ${campaign.email_tone || 'professional'} tone` :
        `Generate a new email for the campaign:
Campaign Name: ${campaign.name}
Description: ${campaign.description || 'N/A'}
Target Audience: ${campaign.target_audience || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
Value Proposition: ${campaign.value_proposition || 'N/A'}

Please generate a persuasive email that aligns with the campaign goals and target audience.`;

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
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <Button
            variant="secondary"
            onClick={() => navigate('/dashboard')}
            className="mb-4"
          >
            ← Back to Dashboard
          </Button>
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
          <p className="text-gray-400">{campaign.description}</p>
        </div>
        <div className="space-x-4">
          <select
            value={campaign.status}
            onChange={(e) => handleUpdateCampaignStatus(e.target.value as Campaign['status'])}
            className="bg-background-secondary border border-gray-700 rounded px-3 py-2"
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
          className={`px-4 py-2 ${activeTab === 'overview' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'contacts' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('contacts')}
        >
          Contacts ({contacts.length})
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'emails' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('emails')}
        >
          Emails ({emails.length})
        </button>
        <button
          className={`px-4 py-2 ${activeTab === 'analytics' ? 'text-primary border-b-2 border-primary' : 'text-gray-400'}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <h3 className="text-lg font-semibold mb-2">Total Contacts</h3>
            <p className="text-3xl font-bold">{contacts.length}</p>
          </Card>
          <Card>
            <h3 className="text-lg font-semibold mb-2">Emails Sent</h3>
            <p className="text-3xl font-bold">{campaign.analytics?.sent || 0}</p>
          </Card>
          <Card>
            <h3 className="text-lg font-semibold mb-2">Open Rate</h3>
            <p className="text-3xl font-bold">
              {campaign.analytics?.sent
                ? Math.round((campaign.analytics.opened / campaign.analytics.sent) * 100)
                : 0}%
            </p>
          </Card>
          <Card>
            <h3 className="text-lg font-semibold mb-2">Response Rate</h3>
            <p className="text-3xl font-bold">
              {campaign.analytics?.sent
                ? Math.round((campaign.analytics.replied / campaign.analytics.sent) * 100)
                : 0}%
            </p>
          </Card>
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Contact List</h2>
            <Button onClick={() => setShowContactSelection(true)}>Add Contacts</Button>
          </div>
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left border-b border-gray-700">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">Company</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Last Contacted</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="border-b border-gray-700">
                      <td className="py-2">{contact.first_name} {contact.last_name}</td>
                      <td className="py-2">{contact.email}</td>
                      <td className="py-2">{contact.company || '-'}</td>
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
        <div className="space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold">Email Sequence</h2>
            <div className="space-x-4">
              <Button
                variant="secondary"
                onClick={() => setShowSequencePlanner(true)}
              >
                Plan Sequence
              </Button>
              <Button onClick={() => setShowSequencePlanner(false)}>
                Create Email
              </Button>
            </div>
          </div>

          {showSequencePlanner ? (
            campaign && <EmailSequencePlanner
              campaign={campaign}
              onClose={() => setShowSequencePlanner(false)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-8">
              {/* Calendar View */}
              <Card>
                <h3 className="text-lg font-semibold mb-4">Email Calendar</h3>
                <div className="h-[500px] bg-background-secondary rounded-lg p-4">
                  <FullCalendar
                    plugins={[dayGridPlugin, interactionPlugin]}
                    initialView="dayGridMonth"
                    events={emails.map(email => ({
                      title: email.subject,
                      date: email.scheduled_at || email.created_at,
                      backgroundColor: email.status === 'sent' ? '#059669' : 
                                    email.status === 'failed' ? '#DC2626' : '#3B82F6',
                      borderColor: 'transparent',
                      className: 'px-2 py-1 text-sm'
                    }))}
                    height="100%"
                    headerToolbar={{
                      left: 'prev,next today',
                      center: 'title',
                      right: ''
                    }}
                  />
                </div>
              </Card>

              {/* Email Creation Form */}
              <Card>
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
                      className="input"
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
                      className="input"
                      rows={5}
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
                      className="input"
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

              {/* Email List */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Scheduled Emails</h3>
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {emails.map((email) => (
                    <Card 
                      key={email.id} 
                      variant="hover"
                      onClick={() => handleEmailSelect(email)}
                      className="cursor-pointer transition-transform hover:scale-[1.02]"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h4 className="font-semibold">{email.subject}</h4>
                          <p className="text-sm text-gray-400 mt-1 line-clamp-2">{email.content}</p>
                          {email.metadata?.sequence_type && (
                            <div className="flex gap-2 mt-2">
                              <span className="text-xs px-2 py-1 bg-primary/20 text-primary rounded">
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
          )}
        </div>
      )}

      {activeTab === 'analytics' && (
        <div className="space-y-8">
          <Card>
            <h2 className="text-xl font-bold mb-4">Campaign Performance</h2>
            <div className="h-64 bg-gray-800 rounded flex items-center justify-center">
              <p className="text-gray-400">Analytics visualization coming soon</p>
            </div>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <Card>
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

            <Card>
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
  );
}