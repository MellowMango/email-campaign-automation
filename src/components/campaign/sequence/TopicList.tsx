import { memo } from 'react';
import type { EmailTopic } from '../../../types/sequence';
import { Card } from '../../shadcn/Card';

interface TopicListProps {
  topics: EmailTopic[];
  isLoading?: boolean;
}

export const TopicList = memo(function TopicList({ topics, isLoading }: TopicListProps) {
  if (isLoading) {
    return (
      <Card className="p-4">
        <div className="animate-pulse space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-700 rounded" />
          ))}
        </div>
      </Card>
    );
  }

  if (!topics.length) {
    return (
      <Card className="p-4">
        <p className="text-gray-400">No topics generated yet. Click generate to create your email sequence.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      {topics.map((topic, index) => (
        <div
          key={`${topic.date}-${index}`}
          className="p-4 bg-gray-800 rounded-lg border border-gray-700"
        >
          <div className="flex justify-between items-start mb-2">
            <h3 className="font-medium text-lg">{topic.topic}</h3>
            <span className="text-sm text-gray-400">{topic.date}</span>
          </div>
          <p className="text-gray-300">{topic.description}</p>
          {topic.status && (
            <span className={`mt-2 inline-block px-2 py-1 text-xs rounded ${
              topic.status === 'draft' ? 'bg-yellow-500/20 text-yellow-300' :
              topic.status === 'scheduled' ? 'bg-blue-500/20 text-blue-300' :
              'bg-green-500/20 text-green-300'
            }`}>
              {topic.status.charAt(0).toUpperCase() + topic.status.slice(1)}
            </span>
          )}
        </div>
      ))}
    </Card>
  );
}); 