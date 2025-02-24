import { Card } from '../shadcn/Card';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase/client';
import type { Campaign, Contact } from '../../types';

interface CampaignAnalyticsProps {
  campaign: Campaign;
  contacts: Contact[];
}

interface DailyEngagement {
  date: string;
  opens: number;
  clicks: number;
  replies: number;
  total_sent: number;
}

export function CampaignAnalytics({ campaign, contacts }: CampaignAnalyticsProps) {
  const [dailyEngagement, setDailyEngagement] = useState<DailyEngagement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDailyEngagement();
  }, [campaign.id]);

  const fetchDailyEngagement = async () => {
    try {
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - i);
        return date.toISOString().split('T')[0];
      }).reverse();

      // Fetch email events for the campaign
      const { data: events, error } = await supabase
        .from('email_events')
        .select('event_type, occurred_at')
        .eq('campaign_id', campaign.id)
        .gte('occurred_at', last7Days[0]);

      if (error) throw error;

      // Process events into daily stats
      const dailyStats = last7Days.map(date => {
        const dayEvents = events?.filter(event => 
          event.occurred_at.split('T')[0] === date
        ) || [];

        return {
          date,
          opens: dayEvents.filter(e => e.event_type === 'open').length,
          clicks: dayEvents.filter(e => e.event_type === 'click').length,
          replies: dayEvents.filter(e => e.event_type === 'reply').length,
          total_sent: dayEvents.filter(e => e.event_type === 'processed').length
        };
      });

      setDailyEngagement(dailyStats);
    } catch (error) {
      console.error('Error fetching daily engagement:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics
  const totalEmails = campaign.analytics?.sent || 0;
  const openRate = totalEmails ? Math.round((campaign.analytics?.opened || 0) / totalEmails * 100) : 0;
  const clickRate = totalEmails ? Math.round((campaign.analytics?.clicked || 0) / totalEmails * 100) : 0;
  const responseRate = totalEmails ? Math.round((campaign.analytics?.replied || 0) / totalEmails * 100) : 0;
  
  // Calculate contact metrics
  const contactsByStatus = {
    new: contacts.filter(c => c.status === 'new').length,
    contacted: contacts.filter(c => c.status === 'contacted').length,
    responded: contacts.filter(c => c.status === 'responded').length,
    converted: contacts.filter(c => c.status === 'converted').length,
    unsubscribed: contacts.filter(c => c.status === 'unsubscribed').length
  };

  return (
    <div className="space-y-8">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Total Emails</h3>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold">{totalEmails}</span>
            <span className="ml-2 text-gray-400">sent</span>
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Open Rate</h3>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold">{openRate}%</span>
            <span className="ml-2 text-gray-400">
              ({campaign.analytics?.opened || 0} opens)
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
            <div
              className="bg-green-500 h-2 rounded-full"
              style={{ width: `${openRate}%` }}
            />
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Click Rate</h3>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold">{clickRate}%</span>
            <span className="ml-2 text-gray-400">
              ({campaign.analytics?.clicked || 0} clicks)
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
            <div
              className="bg-blue-500 h-2 rounded-full"
              style={{ width: `${clickRate}%` }}
            />
          </div>
        </Card>
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-2">Response Rate</h3>
          <div className="flex items-baseline">
            <span className="text-3xl font-bold">{responseRate}%</span>
            <span className="ml-2 text-gray-400">
              ({campaign.analytics?.replied || 0} responses)
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
            <div
              className="bg-purple-500 h-2 rounded-full"
              style={{ width: `${responseRate}%` }}
            />
          </div>
        </Card>
      </div>

      {/* Contact Status */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Contact Status Distribution</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {Object.entries(contactsByStatus).map(([status, count]) => (
            <div key={status} className="text-center">
              <div className="text-2xl font-bold mb-1">{count}</div>
              <div className="text-sm text-gray-400 capitalize">{status}</div>
              <div className="w-full bg-gray-700 rounded-full h-2 mt-2">
                <div
                  className={`h-2 rounded-full ${
                    status === 'converted'
                      ? 'bg-green-500'
                      : status === 'responded'
                      ? 'bg-blue-500'
                      : status === 'contacted'
                      ? 'bg-yellow-500'
                      : status === 'unsubscribed'
                      ? 'bg-red-500'
                      : 'bg-gray-500'
                  }`}
                  style={{
                    width: `${(count / contacts.length) * 100}%`
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Campaign Timeline */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Campaign Timeline</h3>
        <div className="space-y-4">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
              <span className="text-white">1</span>
            </div>
            <div className="ml-4">
              <h4 className="font-semibold">Campaign Created</h4>
              <p className="text-sm text-gray-400">
                {new Date(campaign.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
              <span className="text-white">2</span>
            </div>
            <div className="ml-4">
              <h4 className="font-semibold">First Email Sent</h4>
              <p className="text-sm text-gray-400">
                {totalEmails > 0
                  ? 'Campaign active'
                  : 'Waiting to start'}
              </p>
            </div>
          </div>
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center">
              <span className="text-white">3</span>
            </div>
            <div className="ml-4">
              <h4 className="font-semibold">Current Status</h4>
              <p className="text-sm text-gray-400 capitalize">
                {campaign.status}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Daily Engagement */}
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Daily Engagement</h3>
        {loading ? (
          <div className="text-center py-4">Loading engagement data...</div>
        ) : (
          <div className="grid grid-cols-7 gap-2">
            {dailyEngagement.map((day) => {
              const engagementRate = day.total_sent 
                ? Math.round(((day.opens + day.clicks + day.replies) / (day.total_sent * 3)) * 100)
                : 0;

              return (
                <div key={day.date} className="text-center">
                  <div className="text-sm text-gray-400">
                    {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
                  </div>
                  <div className="h-24 bg-gray-800 rounded-lg mt-2 relative">
                    <div
                      className="absolute bottom-0 w-full bg-indigo-500 rounded-b-lg transition-all duration-300"
                      style={{
                        height: `${engagementRate}%`
                      }}
                    />
                  </div>
                  <div className="text-sm mt-1">
                    <div>{engagementRate}%</div>
                    <div className="text-xs text-gray-400">
                      Opens: {day.opens} | Clicks: {day.clicks} | Replies: {day.replies}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
} 