import { useUsage } from '../../hooks/useUsage';
import { Card } from '../shadcn/Card';
import { Progress } from '../shadcn/Progress';

interface UsageCardProps {
  title: string;
  used: number;
  included: number;
  projected: number;
  additionalCost: number;
  icon: React.ReactNode;
}

function UsageCard({ title, used, included, projected, additionalCost, icon }: UsageCardProps) {
  const usagePercentage = Math.min(Math.round((used / included) * 100), 100);
  const projectedPercentage = Math.min(Math.round((projected / included) * 100), 100);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center">
          <span className="mr-2">{icon}</span>
          {title}
        </h3>
        <div className="text-sm text-gray-400">
          {used.toLocaleString()} / {included.toLocaleString()}
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Current Usage</span>
            <span>{usagePercentage}%</span>
          </div>
          <Progress value={usagePercentage} className="h-2" />
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Projected Usage</span>
            <span>{projectedPercentage}%</span>
          </div>
          <Progress 
            value={projectedPercentage} 
            className="h-2"
            variant={projectedPercentage > 100 ? "destructive" : "default"}
          />
        </div>

        {additionalCost > 0 && (
          <div className="mt-4 p-3 bg-yellow-500/10 rounded-lg">
            <div className="text-sm text-yellow-400">
              Projected additional cost: ${additionalCost.toFixed(2)}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export function UsageDashboard() {
  const { usage, loading, error } = useUsage();

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="p-6">
              <div className="h-24 bg-gray-700/50 rounded-lg" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-900/50 text-red-200 rounded-lg">
        {error}
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <UsageCard
          title="Emails"
          used={usage.emails.used}
          included={usage.emails.included}
          projected={usage.emails.projected}
          additionalCost={usage.emails.additionalCost}
          icon={
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />

        <UsageCard
          title="Contacts"
          used={usage.contacts.used}
          included={usage.contacts.included}
          projected={usage.contacts.projected}
          additionalCost={usage.contacts.additionalCost}
          icon={
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
        />

        <UsageCard
          title="Campaigns"
          used={usage.campaigns.used}
          included={usage.campaigns.included}
          projected={usage.campaigns.projected}
          additionalCost={usage.campaigns.additionalCost}
          icon={
            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
      </div>

      <div className="p-4 bg-gray-800 rounded-lg">
        <h4 className="text-sm font-medium text-gray-400 mb-2">Understanding Your Usage</h4>
        <ul className="text-sm text-gray-500 space-y-2">
          <li>• Current Usage shows your actual usage in the current billing period</li>
          <li>• Projected Usage estimates your usage by the end of the billing period based on current patterns</li>
          <li>• Additional costs are only charged for usage exceeding your plan's included limits</li>
        </ul>
      </div>
    </div>
  );
} 