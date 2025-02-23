import { Card } from '../shadcn/Card';
import type { Campaign, Contact } from '../../types';

interface CampaignAnalyticsProps {
  campaign: Campaign;
  contacts: Contact[];
}

export function CampaignAnalytics({ campaign, contacts }: CampaignAnalyticsProps) {
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

  // Calculate engagement trend (last 7 days)
  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - i);
    return date.toISOString().split('T')[0];
  }).reverse();

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
        <div className="grid grid-cols-7 gap-2">
          {last7Days.map((date) => (
            <div key={date} className="text-center">
              <div className="text-sm text-gray-400">
                {new Date(date).toLocaleDateString(undefined, { weekday: 'short' })}
              </div>
              <div className="h-24 bg-gray-800 rounded-lg mt-2 relative">
                <div
                  className="absolute bottom-0 w-full bg-indigo-500 rounded-b-lg"
                  style={{
                    height: '60%' // This would be dynamic based on actual data
                  }}
                />
              </div>
              <div className="text-sm mt-1">
                {Math.floor(Math.random() * 100)}% {/* This would be actual data */}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
} 