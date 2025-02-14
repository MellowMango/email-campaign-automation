import { memo } from 'react';
import { Button } from '../../shadcn/Button';
import { Card } from '../../shadcn/Card';
import type { Campaign } from '../../../types';
import type { SequenceType, SequenceStage } from '../../../types/sequence';
import { SEQUENCE_TYPES } from '../../../types/sequence';

interface GenerationFormProps {
  campaign: Campaign;
  onGenerate: () => Promise<void>;
  isGenerating: boolean;
  error: Error | null;
}

export const GenerationForm = memo(function GenerationForm({
  campaign,
  onGenerate,
  isGenerating,
  error
}: GenerationFormProps) {
  const sequenceType = campaign.sequence_type as SequenceType;
  const sequenceInfo = SEQUENCE_TYPES[sequenceType];

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-medium mb-2">{sequenceInfo.name}</h3>
          <p className="text-gray-400">{sequenceInfo.description}</p>
        </div>

        <div>
          <h4 className="font-medium mb-2">Sequence Stages</h4>
          <div className="flex flex-wrap gap-2">
            {sequenceInfo.stages.map((stage, index) => (
              <span
                key={stage}
                className="px-2 py-1 bg-gray-800 rounded text-sm"
              >
                {index + 1}. {stage}
              </span>
            ))}
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-2">Campaign Details</h4>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-400">Duration:</dt>
            <dd>{campaign.duration} days</dd>
            <dt className="text-gray-400">Emails per Week:</dt>
            <dd>{campaign.emails_per_week}</dd>
            <dt className="text-gray-400">Target Audience:</dt>
            <dd>{campaign.target_audience || 'Not specified'}</dd>
            <dt className="text-gray-400">Email Tone:</dt>
            <dd>{campaign.email_tone || 'Professional'}</dd>
          </dl>
        </div>

        {error && (
          <div className="p-3 bg-red-500/20 border border-red-500/50 rounded text-red-300 text-sm">
            {error.message}
          </div>
        )}

        <Button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full"
        >
          {isGenerating ? 'Generating...' : 'Generate Email Sequence'}
        </Button>
      </div>
    </Card>
  );
}); 