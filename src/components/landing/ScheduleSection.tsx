'use client';

import { teamConfig } from '@/lib/team-config';
import { ScrollReveal } from '@/components/ui/ScrollReveal';
import { MapPin, Clock } from 'lucide-react';

const sampleEvents = [
  { id: '1', title: `${teamConfig.sportConfig.practiceLabel}`, date: '2026-04-08', startTime: '17:30', endTime: '19:00', location: 'Scottsdale Sports Complex', type: 'practice' },
  { id: '2', title: `${teamConfig.sportConfig.practiceLabel}`, date: '2026-04-10', startTime: '17:30', endTime: '19:00', location: 'Scottsdale Sports Complex', type: 'practice' },
  { id: '3', title: `${teamConfig.sportConfig.gameLabel} vs Wildcats`, date: '2026-04-12', startTime: '09:00', endTime: '10:30', location: 'Desert Ridge Park', type: 'game' },
  { id: '4', title: `${teamConfig.sportConfig.practiceLabel}`, date: '2026-04-15', startTime: '17:30', endTime: '19:00', location: 'Scottsdale Sports Complex', type: 'practice' },
  { id: '5', title: 'Spring Tournament', date: '2026-04-19', startTime: '08:00', endTime: '17:00', location: 'Tempe Diablo Stadium', type: 'tournament' },
  { id: '6', title: `${teamConfig.sportConfig.gameLabel} vs Thunder`, date: '2026-04-22', startTime: '18:00', endTime: '19:30', location: 'Chaparral Park', type: 'game' },
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    dayName: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
    dayNum: d.getDate(),
    month: d.toLocaleDateString('en-US', { month: 'short' }),
  };
}

function formatTime(time: string) {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function getEventColor(type: string) {
  if (type === 'game') return teamConfig.accentColor;
  if (type === 'tournament') return '#F59E0B';
  return 'transparent';
}

export function ScheduleSection() {
  return (
    <section id="schedule" className="relative py-32 md:py-40">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,1.5fr] gap-16 lg:gap-24">
          {/* Left — heading */}
          <div className="lg:sticky lg:top-32 lg:self-start">
            <ScrollReveal>
              <div
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-medium border mb-6"
                style={{
                  color: teamConfig.accentColor,
                  borderColor: `${teamConfig.accentColor}33`,
                  background: `${teamConfig.accentColor}0A`,
                }}
              >
                Upcoming
              </div>
              <h2 className="font-display text-3xl md:text-5xl tracking-tighter leading-none text-foreground mb-4">
                Schedule
              </h2>
              <p className="text-base text-text-secondary leading-relaxed max-w-[40ch]">
                Stay on top of practices, games, and tournaments. Never miss a session.
              </p>
            </ScrollReveal>
          </div>

          {/* Right — event list */}
          <div className="space-y-2">
            {sampleEvents.map((event, i) => {
              const { dayName, dayNum, month } = formatDate(event.date);
              const isHighlight = event.type === 'game' || event.type === 'tournament';

              return (
                <ScrollReveal key={event.id} delay={i * 0.06}>
                  <div className={`group flex items-stretch gap-0 rounded-xl border transition-all duration-500 overflow-hidden ${
                    isHighlight ? 'border-border hover:border-border-hover' : 'border-transparent hover:border-border'
                  }`}>
                    {/* Color bar */}
                    <div
                      className="w-1 shrink-0 rounded-l-xl"
                      style={{ background: getEventColor(event.type) }}
                    />

                    <div className="flex-1 flex items-center gap-5 p-4 md:p-5">
                      {/* Date block */}
                      <div className="w-14 h-14 rounded-lg bg-surface-elevated flex flex-col items-center justify-center shrink-0">
                        <span className="text-[10px] font-medium text-text-muted tracking-wider">{dayName}</span>
                        <span className="text-xl font-display font-bold text-foreground leading-none">{dayNum}</span>
                        <span className="text-[10px] text-text-muted">{month}</span>
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-foreground truncate">{event.title}</div>
                        <div className="flex items-center gap-4 mt-1">
                          <span className="flex items-center gap-1.5 text-xs text-text-muted">
                            <Clock size={12} />
                            {formatTime(event.startTime)} - {formatTime(event.endTime)}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-text-muted truncate">
                            <MapPin size={12} className="shrink-0" />
                            {event.location}
                          </span>
                        </div>
                      </div>

                      {/* Type badge */}
                      {isHighlight && (
                        <span
                          className="hidden sm:inline-flex text-[10px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full shrink-0"
                          style={{
                            color: getEventColor(event.type),
                            background: `${getEventColor(event.type)}15`,
                          }}
                        >
                          {event.type}
                        </span>
                      )}
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
