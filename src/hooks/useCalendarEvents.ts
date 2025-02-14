import { useMemo, useCallback } from 'react';
import type { EmailTopic } from '../types/sequence';
import type { EventInput, EventClickArg, DateSelectArg } from '@fullcalendar/core';

export function useCalendarEvents(topics: EmailTopic[]) {
  const events = useMemo<EventInput[]>(() => 
    topics.map(topic => ({
      title: topic.topic,
      date: topic.date,
      extendedProps: {
        description: topic.description,
        status: topic.status
      }
    })),
    [topics]
  );

  const handleEventClick = useCallback((info: EventClickArg) => {
    console.log('Event clicked:', info.event);
    // Handle event click - could emit an event or update state
  }, []);

  const handleDateSelect = useCallback((selectInfo: DateSelectArg) => {
    console.log('Date selected:', selectInfo.start);
    // Handle date selection - could emit an event or update state
  }, []);

  return {
    events,
    handleEventClick,
    handleDateSelect
  };
} 