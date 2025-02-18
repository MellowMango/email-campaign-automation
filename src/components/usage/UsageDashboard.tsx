import { useSubscription } from '../../hooks/useSubscription';
import { useUsage } from '../../hooks/useUsage';
import { Card } from '../shadcn/Card';
import { Progress } from '../shadcn/Progress';

export function UsageDashboard() {
  const { subscription, loading: subLoading } = useSubscription();
  const { usage, loading: usageLoading } = useUsage();

  if (subLoading || usageLoading || !usage) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-700 rounded w-1/4" />
          <div className="space-y-3">
            <div className="h-8 bg-gray-700 rounded" />
            <div className="h-8 bg-gray-700 rounded" />
            <div className="h-8 bg-gray-700 rounded" />
          </div>
        </div>
      </Card>
    );
  }

  if (!subscription) {
    return (
      <Card className="p-6">
        <p className="text-gray-400">
          No active subscription found. Please subscribe to a plan to view usage metrics.
        </p>
      </Card>
    );
  }

  if (subscription.is_admin) {
    return (
      <Card className="p-6">
        <h3 className="text-xl font-semibold mb-4">Admin Account</h3>
        <p className="text-gray-400 mb-4">
          This is an admin account with unlimited usage. No usage limits or billing apply.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          <div className="p-4 bg-gray-800 rounded-lg">
            <h4 className="font-medium mb-2">Emails Sent</h4>
            <p className="text-2xl font-bold">{usage.emails.used.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-gray-800 rounded-lg">
            <h4 className="font-medium mb-2">Contacts</h4>
            <p className="text-2xl font-bold">{usage.contacts.used.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-gray-800 rounded-lg">
            <h4 className="font-medium mb-2">Active Campaigns</h4>
            <p className="text-2xl font-bold">{usage.campaigns.used.toLocaleString()}</p>
          </div>
        </div>
      </Card>
    );
  }

  const formatUsage = (used: number, included: number) => {
    const percentage = Math.min((used / included) * 100, 100);
    return {
      used: used.toLocaleString(),
      included: included.toLocaleString(),
      percentage
    };
  };

  const emailUsage = formatUsage(usage.emails.used, usage.emails.included);
  const contactUsage = formatUsage(usage.contacts.used, usage.contacts.included);
  const campaignUsage = formatUsage(usage.campaigns.used, usage.campaigns.included);

  return (
    <Card className="p-6">
      <h3 className="text-xl font-semibold mb-4">Current Usage</h3>
      <div className="space-y-6">
        <div>
          <div className="flex justify-between mb-2">
            <span className="font-medium">Emails Sent</span>
            <span className="text-gray-400">
              {emailUsage.used} / {emailUsage.included}
            </span>
          </div>
          <Progress value={emailUsage.percentage} />
          {usage.emails.additionalCost > 0 && (
            <p className="text-yellow-400 text-sm mt-1">
              Additional cost this period: ${usage.emails.additionalCost.toFixed(2)}
            </p>
          )}
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <span className="font-medium">Contacts</span>
            <span className="text-gray-400">
              {contactUsage.used} / {contactUsage.included}
            </span>
          </div>
          <Progress value={contactUsage.percentage} />
          {usage.contacts.additionalCost > 0 && (
            <p className="text-yellow-400 text-sm mt-1">
              Additional cost this period: ${usage.contacts.additionalCost.toFixed(2)}
            </p>
          )}
        </div>

        <div>
          <div className="flex justify-between mb-2">
            <span className="font-medium">Active Campaigns</span>
            <span className="text-gray-400">
              {campaignUsage.used} / {campaignUsage.included}
            </span>
          </div>
          <Progress value={campaignUsage.percentage} />
          {usage.campaigns.additionalCost > 0 && (
            <p className="text-yellow-400 text-sm mt-1">
              Additional cost this period: ${usage.campaigns.additionalCost.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
} 