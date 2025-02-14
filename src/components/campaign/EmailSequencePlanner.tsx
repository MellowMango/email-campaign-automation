import { memo } from 'react';
import type { Campaign } from '../../types';
import { Button } from '../shadcn/Button';
import { TopicList } from './sequence/TopicList';
import { Calendar } from './sequence/Calendar';
import { GenerationForm } from './sequence/GenerationForm';
import { useSequenceGeneration } from '../../hooks/useSequenceGeneration';
import { useCalendarEvents } from '../../hooks/useCalendarEvents';

interface EmailSequencePlannerProps {
  campaign: Campaign;
  onClose: () => void;
}

export const EmailSequencePlanner = memo(function EmailSequencePlanner({
  campaign,
  onClose
}: EmailSequencePlannerProps) {
  const {
    topics,
    isGenerating,
    error,
    generateTopics,
    saveSequence
  } = useSequenceGeneration(campaign);

  const {
    events,
    handleEventClick,
    handleDateSelect
  } = useCalendarEvents(topics);

  // Calculate campaign date range
  const startDate = new Date();
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + campaign.duration);

  const handleSave = async () => {
    try {
      await saveSequence();
      onClose();
    } catch (error) {
      // Error is handled by the hook
      console.error('Failed to save sequence:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-gray-900 border border-gray-800 rounded-lg">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold">Email Sequence Planner</h2>
            <div className="space-x-2">
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={isGenerating}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={isGenerating || !topics.length}
              >
                Save Sequence
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              <GenerationForm
                campaign={campaign}
                onGenerate={generateTopics}
                isGenerating={isGenerating}
                error={error}
              />
              <TopicList
                topics={topics}
                isLoading={isGenerating}
              />
            </div>

            {/* Right Column */}
            <div>
              <Calendar
                events={events}
                onEventClick={handleEventClick}
                onDateSelect={handleDateSelect}
                startDate={startDate}
                endDate={endDate}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}); 