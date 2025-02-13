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
  const [isGeneratingSequence, setIsGeneratingSequence] = useState(false);
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

  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);

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
      const updates = {
        user_id: campaign.user_id,
        name: campaignDetails.name || campaign.name,
        description: campaignDetails.description || campaign.description,
        target_audience: campaignDetails.target_audience || campaign.target_audience,
        goals: campaignDetails.goals || campaign.goals,
        value_proposition: campaignDetails.value_proposition || campaign.value_proposition,
        email_tone: (campaignDetails.email_tone || campaign.email_tone) as EmailTone,
        campaign_type: (campaignDetails.campaign_type || campaign.campaign_type) as CampaignType,
        duration: campaignDetails.duration ?? campaign.duration,
        emails_per_week: campaignDetails.emails_per_week ?? campaign.emails_per_week,
        sequence_type: campaignDetails.sequence_type || campaign.sequence_type,
        features: {
          adaptive_sequences: campaignDetails.features?.adaptive_sequences ?? campaign.features?.adaptive_sequences ?? false,
          auto_responder: campaignDetails.features?.auto_responder ?? campaign.features?.auto_responder ?? false,
          lead_scoring: campaignDetails.features?.lead_scoring ?? campaign.features?.lead_scoring ?? false
        },
        cta_links: campaignDetails.cta_links || campaign.cta_links,
        status: campaign.status,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('campaigns')
        .update(updates)
        .eq('id', campaign.id);

      if (error) throw error;
      
      // Immediately update the local campaign state with all the changes
      setCampaign(prev => prev ? { ...prev, ...updates } : null);
      setEditingDetails(false);
      setSuccessMessage('Campaign details updated successfully');
      
      // Reset campaign details after successful update
      setCampaignDetails({});
    } catch (err) {
      console.error('Update error:', err);
      setError(err instanceof Error ? err.message : 'Failed to update campaign details');
    }
  };

  const handleGenerateSequence = async () => {
    if (!campaign) {
      setError('Campaign not found');
      return;
    }

    setIsGeneratingSequence(true);
    try {
      const startDate = new Date(newEmail.scheduled_at);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + campaign.duration);

      interface SequenceEmail {
        id: string;
        title: string;
        start: string;
        end: string;
        extendedProps: {
          status: 'ready' | 'pending' | 'sent';
          content: string;
          subject: string;
        };
        className: string;
      }

      // Calculate total number of emails and interval between them
      const totalEmails = Math.floor(campaign.duration / 7 * campaign.emails_per_week);
      const daysInterval = Math.floor(campaign.duration / totalEmails);

      // Get sequence stages based on campaign type
      const stages = {
        awareness: ['Problem Awareness', 'Solution Education', 'Brand Introduction', 'Value Proposition', 'Social Proof'],
        conversion: ['Value Proposition', 'Feature Showcase', 'Case Studies', 'Offer Introduction', 'Call to Action'],
        nurture: ['Industry Insights', 'Best Practices', 'Tips & Tricks', 'Success Stories', 'Thought Leadership']
      }[campaign.sequence_type];

      // Generate sequence
      const sequence: SequenceEmail[] = [];
      const emailsToCreate = [];

      for (let i = 0; i < totalEmails; i++) {
        const emailDate = new Date(startDate);
        emailDate.setDate(emailDate.getDate() + i * daysInterval);
        
        // Calculate which stage this email should be in
        const stageIndex = Math.floor((i / totalEmails) * stages.length);
        const stage = stages[stageIndex];

        // Generate content for this email
        const prompt = `Generate content for email ${i + 1} of ${totalEmails} in the ${campaign.sequence_type} sequence:
Campaign Name: ${campaign.name}
Description: ${campaign.description || 'N/A'}
Target Audience: ${campaign.target_audience || 'N/A'}
Goals: ${campaign.goals || 'N/A'}
Value Proposition: ${campaign.value_proposition || 'N/A'}
Current Stage: ${stage}
CTA Link: ${campaign.cta_links[campaign.sequence_type]}

Requirements:
1. Create a subject line and content that aligns with the current stage (${stage})
2. Focus on the target audience's needs
3. Build progressively towards the campaign goals
4. Maintain ${campaign.email_tone || 'professional'} tone
5. Include the CTA naturally based on the sequence type and stage`;

        const { subject, content } = await generateEmailContent(
          prompt,
          campaign.target_audience || 'N/A',
          campaign.email_tone || 'professional',
          campaign.company_name
        );

        sequence.push({
          id: `seq-${emailDate.toISOString().split('T')[0]}`,
          title: subject,
          start: emailDate.toISOString(),
          end: emailDate.toISOString(),
          extendedProps: {
            status: 'pending',
            content,
            subject
          },
          className: 'event-pending'
        });

        emailsToCreate.push({
          campaign_id: campaign.id,
          subject,
          content,
          scheduled_at: emailDate.toISOString(),
          status: 'pending',
          metadata: {
            sequence_type: campaign.sequence_type,
            topic: {
              name: subject,
              description: content.substring(0, 100) + '...',
              stage
            }
          }
        });
      }

      // Insert all emails into the database
      const { error: insertError } = await supabase
        .from('emails')
        .insert(emailsToCreate.map(email => ({
          ...email,
          status: 'draft',
          metadata: {
            sequence_type: campaign.sequence_type,
            topic: {
              name: email.metadata.topic.name,
              description: email.metadata.topic.description,
              stage: email.metadata.topic.stage
            }
          }
        })));

      if (insertError) throw insertError;

      // Refresh emails list
      const { data: updatedEmails, error: fetchError } = await supabase
        .from('emails')
        .select('*')
        .eq('campaign_id', campaign.id)
        .order('scheduled_at', { ascending: true });

      if (fetchError) throw fetchError;
      setEmails(updatedEmails);

      setSuccessMessage('Email sequence generated successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate sequence');
    } finally {
      setIsGeneratingSequence(false);
    }
  };

  const handleDeleteEmail = async (emailId: string) => {
    try {
      const { error } = await supabase
        .from('emails')
        .delete()
        .eq('id', emailId);

      if (error) throw error;
      setEmails(prev => prev.filter(email => email.id !== emailId));
      setSuccessMessage('Email deleted successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete email');
    }
  };

  const handleDeleteAllEmails = async () => {
    try {
      const { error } = await supabase
        .from('emails')
        .delete()
        .eq('campaign_id', id);

      if (error) throw error;
      setEmails([]);
      setShowDeleteConfirmation(false);
      setSuccessMessage('All emails deleted successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete emails');
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
                    <label className="block text-sm font-medium mb-2">Sequence Type</label>
                    {editingDetails ? (
                      <select
                        value={campaignDetails.sequence_type || campaign.sequence_type || 'awareness'}
                        onChange={(e) => setCampaignDetails(prev => ({ 
                          ...prev, 
                          sequence_type: e.target.value as 'awareness' | 'conversion' | 'nurture'
                        }))}
                        className="input w-full"
                      >
                        <option value="awareness">Awareness & Education</option>
                        <option value="conversion">Direct Conversion</option>
                        <option value="nurture">Relationship Nurturing</option>
                      </select>
                    ) : (
                      <p className="text-gray-300">
                        {campaign.sequence_type === 'awareness' ? 'Awareness & Education' :
                         campaign.sequence_type === 'conversion' ? 'Direct Conversion' :
                         campaign.sequence_type === 'nurture' ? 'Relationship Nurturing' :
                         'Not set'}
                      </p>
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
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-bold">Email Sequence</h2>
                <p className="text-sm text-gray-400 mt-1">
                  {campaign.duration} days campaign with {campaign.emails_per_week} emails per week
                </p>
              </div>
              <div className="flex items-center gap-4">
                {emails.length > 0 && (
                  <Button 
                    variant="secondary"
                    onClick={() => setShowDeleteConfirmation(true)}
                    className="bg-red-900 hover:bg-red-800 text-red-100"
                  >
                    Delete All Emails
                  </Button>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2">Start Date</label>
                  <input
                    type="datetime-local"
                    className="input bg-gray-800 border-gray-700 text-white"
                    min={new Date().toISOString().split('.')[0]}
                    onChange={(e) => {
                      const selectedDate = new Date(e.target.value);
                      setNewEmail(prev => ({
                        ...prev,
                        scheduled_at: selectedDate.toISOString()
                      }));
                    }}
                  />
                </div>
                <Button 
                  onClick={handleGenerateSequence}
                  disabled={!campaign.sequence_type || isGeneratingSequence || !newEmail.scheduled_at}
                >
                  {isGeneratingSequence ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Generating...
                    </span>
                  ) : 'Generate Sequence'}
                </Button>
              </div>
            </div>
            {!campaign.sequence_type && (
              <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-500/50 rounded-lg text-yellow-200">
                Please select a sequence type in the campaign details before generating a sequence.
              </div>
            )}
            {!newEmail.scheduled_at && campaign.sequence_type && (
              <div className="mb-6 p-4 bg-yellow-900/50 border border-yellow-500/50 rounded-lg text-yellow-200">
                Please select a start date for your campaign sequence.
              </div>
            )}
            {/* Calendar View */}
            <Card className="p-6 mb-6">
              <FullCalendar
                plugins={[dayGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                events={emails
                  .filter(email => email.scheduled_at)
                  .map(email => ({
                    id: email.id,
                    title: email.subject,
                    start: new Date(email.scheduled_at!).toISOString(),
                    end: new Date(email.scheduled_at!).toISOString(),
                    className: `event-${email.status}`,
                    extendedProps: {
                      status: email.status,
                      content: email.content,
                      metadata: email.metadata
                    }
                  }))}
                eventClick={(info) => {
                  const email = emails.find(e => e.id === info.event.id);
                  if (email) {
                    handleEmailSelect(email);
                  }
                }}
                height="auto"
                headerToolbar={{
                  left: 'prev,next today',
                  center: 'title',
                  right: ''
                }}
                eventContent={(eventInfo) => {
                  return (
                    <div className="p-1">
                      <div className="font-medium text-sm truncate">{eventInfo.event.title}</div>
                      <div className="text-xs opacity-75">
                        {eventInfo.event.extendedProps.metadata?.topic?.stage || 'Email'}
                      </div>
                    </div>
                  );
                }}
              />
            </Card>

            {/* Add some CSS for event styling */}
            <style>{`
              .event-pending {
                background-color: #4f46e5 !important;
                border-color: #4338ca !important;
              }
              .event-sent {
                background-color: #059669 !important;
                border-color: #047857 !important;
              }
              .event-failed {
                background-color: #dc2626 !important;
                border-color: #b91c1c !important;
              }
              .fc-event {
                cursor: pointer;
                padding: 4px;
              }
              .fc-event:hover {
                opacity: 0.9;
              }
            `}</style>

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
                      value={newEmail.scheduled_at ? formatDateForInput(newEmail.scheduled_at) : ''}
                      onChange={(e) => {
                        const selectedDate = new Date(e.target.value);
                        setNewEmail(prev => ({
                          ...prev,
                          scheduled_at: selectedDate.toISOString()
                        }));
                      }}
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
                      className="cursor-pointer transition-transform hover:scale-[1.02] p-4"
                    >
                      <div className="flex justify-between items-start">
                        <div 
                          className="flex-1"
                          onClick={() => handleEmailSelect(email)}
                        >
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
                        <div className="flex items-start space-x-2">
                          <span
                            className={`px-2 py-1 rounded text-sm ${getStatusBadgeClasses(email.status)}`}
                          >
                            {email.status === 'ready' ? 'Ready to Send' : 
                              email.status.charAt(0).toUpperCase() + email.status.slice(1)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteEmail(email.id);
                            }}
                            className="p-1 hover:bg-red-900/50 rounded transition-colors"
                            title="Delete email"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
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

            {/* Delete Confirmation Modal */}
            {showDeleteConfirmation && (
              <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <Card className="w-full max-w-md bg-gray-900 border-gray-800">
                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-4">Delete All Emails</h3>
                    <p className="text-gray-400 mb-6">
                      Are you sure you want to delete all emails in this campaign? This action cannot be undone.
                    </p>
                    <div className="flex justify-end space-x-4">
                      <Button
                        variant="secondary"
                        onClick={() => setShowDeleteConfirmation(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDeleteAllEmails}
                        className="bg-red-600 hover:bg-red-500"
                      >
                        Delete All
                      </Button>
                    </div>
                  </div>
                </Card>
              </div>
            )}
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