import { memo, useState } from 'react';
import type { Campaign } from '../../../types';
import { Button } from '../../shadcn/Button';
import { Card } from '../../shadcn/Card';
import { useCampaignSequence } from '../../../hooks/useCampaignSequence';

interface SequenceGeneratorProps {
  campaign: Campaign;
}

export const SequenceGenerator = memo(function SequenceGenerator({
  campaign
}: SequenceGeneratorProps) {
  const {
    isGenerating,
    progress,
    error,
    generateSequence,
    cancelGeneration
  } = useCampaignSequence(campaign);

  const [startDate, setStartDate] = useState<string>('');

  const handleStartGeneration = () => {
    if (!startDate) return;
    const selectedDate = new Date(startDate);
    generateSequence(selectedDate);
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-2xl font-bold">Email Sequence Controls</h2>
            <p className="text-sm text-gray-400">Generate your email sequence with AI.</p>
          </div>
          {isGenerating && (
            <Button variant="secondary" onClick={cancelGeneration}>
              Cancel Generation
            </Button>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-300 text-sm">
            {error.message}
          </div>
        )}

        {isGenerating && progress && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Generating emails...</span>
              <span>{progress.completed} of {progress.total} ({progress.percentage}%)</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="bg-primary rounded-full h-2 transition-all duration-500"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <p className="text-sm text-gray-400">
              You can leave this page. The generation will continue in the background.
            </p>
          </div>
        )}

        <div className="flex flex-col md:flex-row items-start gap-4">
          <div className="w-full md:w-auto space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Start Date</label>
              <input 
                type="datetime-local" 
                className="input bg-gray-800 border-gray-700 text-white w-full md:w-auto"
                min={new Date().toISOString().split('.')[0]}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <Button
              onClick={handleStartGeneration}
              disabled={isGenerating || !campaign.sequence_type || !startDate}
              className="w-full md:w-auto"
            >
              {isGenerating ? 'Generating...' : 'Generate Sequence'}
            </Button>
          </div>

          <div className="flex-1">
            <Card className="p-3 bg-gray-800">
              <h3 className="font-medium mb-2">Sequence Details</h3>
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-gray-400">Duration:</dt>
                <dd>{campaign.duration} days</dd>
                <dt className="text-gray-400">Emails per Week:</dt>
                <dd>{campaign.emails_per_week}</dd>
                <dt className="text-gray-400">Total Emails:</dt>
                <dd>{Math.floor(campaign.duration / 7 * campaign.emails_per_week)}</dd>
                <dt className="text-gray-400">Sequence Type:</dt>
                <dd className="capitalize">{campaign.sequence_type}</dd>
              </dl>
            </Card>
          </div>
        </div>
      </div>
    </Card>
  );
}); 