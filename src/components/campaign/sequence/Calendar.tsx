import { memo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, DateSelectArg } from '@fullcalendar/core';
import type { EventInput } from '@fullcalendar/core';
import { Card } from '../../shadcn/Card';

interface CalendarProps {
  events: EventInput[];
  onEventClick: (info: EventClickArg) => void;
  onDateSelect: (info: DateSelectArg) => void;
  startDate: Date;
  endDate: Date;
}

export const Calendar = memo(function Calendar({
  events,
  onEventClick,
  onDateSelect,
  startDate,
  endDate
}: CalendarProps) {
  return (
    <Card className="p-4">
      <FullCalendar
        plugins={[dayGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        events={events}
        eventClick={onEventClick}
        selectable={true}
        select={onDateSelect}
        validRange={{
          start: startDate,
          end: endDate
        }}
        headerToolbar={{
          left: 'prev,next today',
          center: 'title',
          right: 'dayGridMonth,dayGridWeek'
        }}
        eventClassNames="cursor-pointer"
        eventContent={renderEventContent}
        height="auto"
      />
    </Card>
  );
});

function renderEventContent(eventInfo: { event: EventInput }) {
  const status = eventInfo.event.extendedProps?.status;
  return (
    <div className={`p-1 rounded text-xs ${
      status === 'draft' ? 'bg-yellow-500/20' :
      status === 'scheduled' ? 'bg-blue-500/20' :
      'bg-green-500/20'
    }`}>
      {eventInfo.event.title}
    </div>
  );
} 