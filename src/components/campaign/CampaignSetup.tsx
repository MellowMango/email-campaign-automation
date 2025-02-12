import { useState } from 'react';
import { Button } from '../shadcn/Button';
import { Card } from '../shadcn/Card';

interface CampaignSetupProps {
  onClose: () => void;
  onSave: (data: CampaignSetupData) => void;
  initialData?: Partial<CampaignSetupData>;
}

export interface CampaignSetupData {
  // Campaign Details
  name: string;
  description: string;
  targetAudience: string;
  goals: string;
  valueProposition: string;
  emailTone: 'formal' | 'casual' | 'professional' | 'friendly';
  
  // Campaign Schedule
  campaignType: 'manual' | 'ai-adaptive';
  duration: number; // in days
  emailsPerWeek: number;
  
  // AI Features (Premium)
  enableAdaptiveSequences: boolean;
  enableAutoResponder: boolean;
  enableLeadScoring: boolean;

  // CTA Links
  ctaLinks: {
    awareness: string;
    conversion: string;
    nurture: string;
  };
}

const defaultData: CampaignSetupData = {
  name: '',
  description: '',
  targetAudience: '',
  goals: '',
  valueProposition: '',
  emailTone: 'professional',
  campaignType: 'manual',
  duration: 30,
  emailsPerWeek: 2,
  enableAdaptiveSequences: false,
  enableAutoResponder: false,
  enableLeadScoring: false,
  ctaLinks: {
    awareness: '',
    conversion: '',
    nurture: ''
  }
};

export function CampaignSetup({ onClose, onSave, initialData }: CampaignSetupProps) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<CampaignSetupData>({ ...defaultData, ...initialData });

  const updateData = (updates: Partial<CampaignSetupData>) => {
    setData(prev => ({ ...prev, ...updates }));
  };

  const handleNext = () => {
    if (step < 4) setStep(step + 1);
    else onSave(data);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
    else onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Campaign Setup</h2>
            <div className="text-sm text-gray-400">Step {step} of 4</div>
          </div>
          <div className="w-full bg-gray-700 h-2 rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-all"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold mb-4">Campaign Details</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Campaign Name</label>
              <input
                type="text"
                value={data.name}
                onChange={(e) => updateData({ name: e.target.value })}
                className="input"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Description</label>
              <textarea
                value={data.description}
                onChange={(e) => updateData({ description: e.target.value })}
                className="input"
                rows={3}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Target Audience</label>
              <textarea
                value={data.targetAudience}
                onChange={(e) => updateData({ targetAudience: e.target.value })}
                className="input"
                rows={3}
                placeholder="Describe your ideal prospects in detail..."
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold mb-4">Campaign Strategy</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Campaign Goals</label>
              <textarea
                value={data.goals}
                onChange={(e) => updateData({ goals: e.target.value })}
                className="input"
                rows={3}
                placeholder="What are your main objectives for this campaign?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Value Proposition</label>
              <textarea
                value={data.valueProposition}
                onChange={(e) => updateData({ valueProposition: e.target.value })}
                className="input"
                rows={3}
                placeholder="What unique value are you offering to your prospects?"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Email Tone</label>
              <select
                value={data.emailTone}
                onChange={(e) => updateData({ emailTone: e.target.value as CampaignSetupData['emailTone'] })}
                className="input"
              >
                <option value="formal">Formal</option>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="casual">Casual</option>
              </select>
            </div>
            <div className="space-y-6">
              <h3 className="text-xl font-semibold mb-4">Call-to-Action Links</h3>
              <p className="text-gray-400 mb-4">
                Set up sequence-specific CTA links that will be automatically included in your emails based on their sequence type.
              </p>
              <div>
                <label className="block text-sm font-medium mb-2">Awareness Sequence CTA Link</label>
                <input
                  type="url"
                  value={data.ctaLinks.awareness}
                  onChange={(e) => updateData({
                    ctaLinks: { ...data.ctaLinks, awareness: e.target.value }
                  })}
                  placeholder="https://example.com/learn-more"
                  className="input"
                />
                <p className="text-sm text-gray-400 mt-1">Used in educational and awareness-focused emails</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Conversion Sequence CTA Link</label>
                <input
                  type="url"
                  value={data.ctaLinks.conversion}
                  onChange={(e) => updateData({
                    ctaLinks: { ...data.ctaLinks, conversion: e.target.value }
                  })}
                  placeholder="https://example.com/sign-up"
                  className="input"
                />
                <p className="text-sm text-gray-400 mt-1">Used in conversion-focused and decision-stage emails</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Nurture Sequence CTA Link</label>
                <input
                  type="url"
                  value={data.ctaLinks.nurture}
                  onChange={(e) => updateData({
                    ctaLinks: { ...data.ctaLinks, nurture: e.target.value }
                  })}
                  placeholder="https://example.com/resources"
                  className="input"
                />
                <p className="text-sm text-gray-400 mt-1">Used in relationship-building and nurture emails</p>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold mb-4">Campaign Schedule</h3>
            <div>
              <label className="block text-sm font-medium mb-2">Campaign Type</label>
              <select
                value={data.campaignType}
                onChange={(e) => updateData({ campaignType: e.target.value as 'manual' | 'ai-adaptive' })}
                className="input"
              >
                <option value="manual">Manual Sequence</option>
                <option value="ai-adaptive">AI-Driven Adaptive Sequence (Premium)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Campaign Duration (days)</label>
              <input
                type="number"
                value={data.duration}
                onChange={(e) => updateData({ duration: parseInt(e.target.value) })}
                className="input"
                min="1"
                max="90"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Emails per Week</label>
              <input
                type="number"
                value={data.emailsPerWeek}
                onChange={(e) => updateData({ emailsPerWeek: parseInt(e.target.value) })}
                className="input"
                min="1"
                max="7"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h3 className="text-xl font-semibold mb-4">AI Features (Premium)</h3>
            <div className="space-y-4">
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={data.enableAdaptiveSequences}
                  onChange={(e) => updateData({ enableAdaptiveSequences: e.target.checked })}
                  className="form-checkbox"
                />
                <div>
                  <span className="font-medium">AI-Driven Adaptive Sequences</span>
                  <p className="text-sm text-gray-400">
                    Automatically optimize email sequences based on recipient engagement
                  </p>
                </div>
              </label>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={data.enableAutoResponder}
                  onChange={(e) => updateData({ enableAutoResponder: e.target.checked })}
                  className="form-checkbox"
                />
                <div>
                  <span className="font-medium">AI Response Handler</span>
                  <p className="text-sm text-gray-400">
                    Generate smart replies based on prospect responses
                  </p>
                </div>
              </label>
              <label className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={data.enableLeadScoring}
                  onChange={(e) => updateData({ enableLeadScoring: e.target.checked })}
                  className="form-checkbox"
                />
                <div>
                  <span className="font-medium">Predictive Lead Scoring</span>
                  <p className="text-sm text-gray-400">
                    Automatically identify and prioritize hot prospects
                  </p>
                </div>
              </label>
            </div>
          </div>
        )}

        <div className="flex justify-between mt-8">
          <Button variant="secondary" onClick={handleBack}>
            {step === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={handleNext}>
            {step === 4 ? 'Create Campaign' : 'Next'}
          </Button>
        </div>
      </Card>
    </div>
  );
} 