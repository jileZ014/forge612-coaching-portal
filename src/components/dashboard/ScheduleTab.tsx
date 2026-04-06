'use client';

import { teamConfig } from '@/lib/team-config';
import { demoSchedule } from './demo-data';
import { Plus, MapPin, Clock, FileText, X } from 'lucide-react';

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getTypeColor(type: string) {
  if (type === 'game') return teamConfig.accentColor;
  if (type === 'tournament') return '#F59E0B';
  return '#71717A';
}

export function ScheduleTab() {
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-lg font-display font-semibold text-foreground tracking-tight">
          {demoSchedule.length} Events
        </h2>
        <button
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold text-white transition-all duration-300 hover:brightness-110 active:scale-[0.97]"
          style={{ background: teamConfig.accentColor }}
        >
          <Plus size={14} />
          Add Event
        </button>
      </div>

      {/* Timeline */}
      <div className="space-y-2">
        {demoSchedule.map((event) => {
          const d = new Date(event.date + 'T00:00:00');
          const dayName = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
          const dayNum = d.getDate();
          const month = d.toLocaleDateString('en-US', { month: 'short' });
          const typeColor = getTypeColor(event.type);

          return (
            <div
              key={event.id}
              className={`group flex items-stretch gap-0 rounded-xl border transition-all duration-300 overflow-hidden ${
                event.cancelled ? 'opacity-50' : 'hover:border-border-hover'
              } border-border`}
            >
              {/* Color indicator */}
              <div className="w-1 shrink-0" style={{ background: typeColor }} />

              <div className="flex-1 flex items-center gap-5 p-4 md:p-5">
                {/* Date */}
                <div className="w-14 h-14 rounded-lg bg-surface-elevated flex flex-col items-center justify-center shrink-0">
                  <span className="text-[10px] font-medium text-text-muted tracking-wider">{dayName}</span>
                  <span className="text-xl font-display font-bold text-foreground leading-none">{dayNum}</span>
                  <span className="text-[10px] text-text-muted">{month}</span>
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-sm font-semibold text-foreground ${event.cancelled ? 'line-through' : ''}`}>
                      {event.title}
                    </span>
                    <span
                      className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        color: typeColor,
                        background: `${typeColor}15`,
                      }}
                    >
                      {event.type}
                    </span>
                    {event.cancelled && (
                      <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-error/10 text-error flex items-center gap-1">
                        <X size={10} />
                        Cancelled
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="flex items-center gap-1.5 text-xs text-text-muted">
                      <Clock size={12} />
                      {formatTime(event.startTime)} - {formatTime(event.endTime)}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-text-muted truncate">
                      <MapPin size={12} className="shrink-0" />
                      {event.location}
                    </span>
                    {event.notes && (
                      <span className="flex items-center gap-1.5 text-xs text-text-muted truncate">
                        <FileText size={12} className="shrink-0" />
                        {event.notes}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {demoSchedule.length === 0 && (
        <div className="text-center py-16 bg-surface border border-border rounded-xl">
          <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center mx-auto mb-4">
            <Plus size={20} className="text-text-muted" />
          </div>
          <p className="text-sm text-text-muted mb-4">
            No events scheduled yet.
          </p>
          <button
            className="text-xs font-medium transition-colors"
            style={{ color: teamConfig.accentColor }}
          >
            Create your first event
          </button>
        </div>
      )}
    </div>
  );
}
