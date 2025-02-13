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
  sequence_type: 'awareness' | 'conversion' | 'nurture';
  
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
  sequence_type: 'awareness',
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

  const renderStepIndicator = (currentStep: number, totalSteps: number) => {
    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl font-bold">Campaign Setup</h2>
          <div className="text-sm text-gray-400">Step {currentStep} of {totalSteps}</div>
        </div>
        <div className="w-full bg-gray-800 h-2 rounded-full">
          <div
            className="bg-indigo-500 h-full rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start justify-center overflow-y-auto py-8">
      <Card className="w-full max-w-2xl my-auto bg-gray-900 border-gray-800">
        <div className="sticky top-0 bg-gray-900 z-10 pb-6 border-b border-gray-800">
          {renderStepIndicator(step, 4)}
        </div>

        <div className="max-h-[calc(80vh-140px)] overflow-y-auto px-1 py-6">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-white">Basic Details</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Campaign Name</label>
                    <input
                      type="text"
                      value={data.name}
                      onChange={(e) => updateData({ name: e.target.value })}
                      className="input bg-gray-800 border-gray-700 text-white"
                      placeholder="Enter campaign name..."
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Description</label>
                    <textarea
                      value={data.description}
                      onChange={(e) => updateData({ description: e.target.value })}
                      className="input bg-gray-800 border-gray-700 text-white"
                      rows={3}
                      placeholder="Brief description of your campaign..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Sequence Type</label>
                    <select
                      value={data.sequence_type}
                      onChange={(e) => updateData({ sequence_type: e.target.value as 'awareness' | 'conversion' | 'nurture' })}
                      className="input bg-gray-800 border-gray-700 text-white"
                    >
                      <option value="awareness">Awareness & Education</option>
                      <option value="conversion">Direct Conversion</option>
                      <option value="nurture">Relationship Nurturing</option>
                    </select>
                    <p className="text-sm text-gray-400 mt-2">
                      {data.sequence_type === 'awareness' 
                        ? 'Focus on educating prospects about your solution and building brand awareness'
                        : data.sequence_type === 'conversion'
                        ? 'Direct approach focused on converting prospects into customers'
                        : 'Build long-term relationships and trust with your prospects'}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4 text-white">Campaign Type</h3>
                <div>
                  <label className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer group">
                    <div className="space-y-1">
                      <div className="font-medium text-gray-200">AI-Driven Campaign</div>
                      <p className="text-sm text-gray-400">
                        Let AI optimize your campaign based on recipient engagement
                      </p>
                      {data.campaignType === 'ai-adaptive' && (
                        <div className="mt-2 text-xs bg-indigo-900/50 text-indigo-300 px-2 py-1 rounded border border-indigo-500/30 inline-block">
                          Premium Feature
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="checkbox"
                        checked={data.campaignType === 'ai-adaptive'}
                        onChange={(e) => updateData({ 
                          campaignType: e.target.checked ? 'ai-adaptive' : 'manual' 
                        })}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-white">Target Audience</h3>
                <div>
                  <textarea
                    value={data.targetAudience}
                    onChange={(e) => updateData({ targetAudience: e.target.value })}
                    className="input bg-gray-800 border-gray-700 text-white"
                    rows={3}
                    placeholder="Describe your ideal prospects in detail..."
                  />
                  <p className="text-sm text-gray-400 mt-2">
                    Define who this campaign is targeting to help personalize the content
                  </p>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4 text-white">Campaign Goals</h3>
                <div>
                  <textarea
                    value={data.goals}
                    onChange={(e) => updateData({ goals: e.target.value })}
                    className="input bg-gray-800 border-gray-700 text-white"
                    rows={3}
                    placeholder="What are your main objectives for this campaign?"
                  />
                  <p className="text-sm text-gray-400 mt-2">
                    Clear goals help measure success and guide content creation
                  </p>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-white">Campaign Content</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Value Proposition</label>
                    <textarea
                      value={data.valueProposition}
                      onChange={(e) => updateData({ valueProposition: e.target.value })}
                      className="input bg-gray-800 border-gray-700 text-white"
                      rows={3}
                      placeholder="What unique value are you offering to your prospects?"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Email Tone</label>
                    <select
                      value={data.emailTone}
                      onChange={(e) => updateData({ emailTone: e.target.value as CampaignSetupData['emailTone'] })}
                      className="input bg-gray-800 border-gray-700 text-white"
                    >
                      <option value="formal">Formal</option>
                      <option value="professional">Professional</option>
                      <option value="friendly">Friendly</option>
                      <option value="casual">Casual</option>
                    </select>
                    <p className="text-sm text-gray-400 mt-2">
                      This tone will be used for AI-generated content and suggestions
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4 text-white">Campaign Schedule</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Duration (days)</label>
                    <input
                      type="number"
                      value={data.duration}
                      onChange={(e) => updateData({ duration: parseInt(e.target.value) })}
                      className="input bg-gray-800 border-gray-700 text-white"
                      min="1"
                      max="90"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Emails per Week</label>
                    <input
                      type="number"
                      value={data.emailsPerWeek}
                      onChange={(e) => updateData({ emailsPerWeek: parseInt(e.target.value) })}
                      className="input bg-gray-800 border-gray-700 text-white"
                      min="1"
                      max="7"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-semibold mb-4 text-white">Call-to-Action Links</h3>
                <p className="text-gray-400 mb-4">
                  Set up sequence-specific CTA links that will be automatically included in your emails.
                </p>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Awareness CTA</label>
                    <input
                      type="url"
                      value={data.ctaLinks.awareness}
                      onChange={(e) => updateData({
                        ctaLinks: { ...data.ctaLinks, awareness: e.target.value }
                      })}
                      placeholder="https://example.com/learn-more"
                      className="input bg-gray-800 border-gray-700 text-white"
                    />
                    <p className="text-sm text-gray-400 mt-1">For educational content</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Conversion CTA</label>
                    <input
                      type="url"
                      value={data.ctaLinks.conversion}
                      onChange={(e) => updateData({
                        ctaLinks: { ...data.ctaLinks, conversion: e.target.value }
                      })}
                      placeholder="https://example.com/sign-up"
                      className="input bg-gray-800 border-gray-700 text-white"
                    />
                    <p className="text-sm text-gray-400 mt-1">For decision-stage content</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-gray-200">Nurture CTA</label>
                    <input
                      type="url"
                      value={data.ctaLinks.nurture}
                      onChange={(e) => updateData({
                        ctaLinks: { ...data.ctaLinks, nurture: e.target.value }
                      })}
                      placeholder="https://example.com/resources"
                      className="input bg-gray-800 border-gray-700 text-white"
                    />
                    <p className="text-sm text-gray-400 mt-1">For relationship-building content</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-xl font-semibold mb-4 text-white">AI Features</h3>
                <div className="space-y-4 bg-gray-800/50 rounded-lg p-4">
                  <label className="flex items-start space-x-3 p-2 rounded hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={data.enableAdaptiveSequences}
                      onChange={(e) => updateData({ enableAdaptiveSequences: e.target.checked })}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-medium text-gray-200">Adaptive Sequences</span>
                      <p className="text-sm text-gray-400">
                        Automatically adjust content based on engagement
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start space-x-3 p-2 rounded hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={data.enableAutoResponder}
                      onChange={(e) => updateData({ enableAutoResponder: e.target.checked })}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-medium text-gray-200">Auto-Responder</span>
                      <p className="text-sm text-gray-400">
                        AI-powered responses to common replies
                      </p>
                    </div>
                  </label>
                  <label className="flex items-start space-x-3 p-2 rounded hover:bg-gray-800">
                    <input
                      type="checkbox"
                      checked={data.enableLeadScoring}
                      onChange={(e) => updateData({ enableLeadScoring: e.target.checked })}
                      className="mt-1"
                    />
                    <div>
                      <span className="font-medium text-gray-200">Lead Scoring</span>
                      <p className="text-sm text-gray-400">
                        Identify and prioritize hot prospects
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-gray-900 pt-4 mt-4 border-t border-gray-800">
          <div className="flex justify-between">
            <Button 
              variant="secondary" 
              onClick={handleBack}
              className="bg-gray-800 hover:bg-gray-700 text-gray-200"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </Button>
            <Button 
              onClick={handleNext} 
              disabled={step === 1 && !data.name}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700"
            >
              {step === 4 ? 'Create Campaign' : 'Next'}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
} 