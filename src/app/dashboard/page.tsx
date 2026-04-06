'use client';

import { useState } from 'react';
import { teamConfig } from '@/lib/team-config';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { PaymentsTab } from '@/components/dashboard/PaymentsTab';
import { RosterTab } from '@/components/dashboard/RosterTab';
import { FeesTab } from '@/components/dashboard/FeesTab';
import { ScheduleTab } from '@/components/dashboard/ScheduleTab';
import { CreditCard, Users, Receipt, CalendarDays } from 'lucide-react';

const tabs = [
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'roster', label: teamConfig.sportConfig.playersLabel, icon: Users },
  { id: 'fees', label: 'Fees', icon: Receipt },
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
] as const;

type TabId = typeof tabs[number]['id'];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('payments');

  return (
    <div className="min-h-[100dvh] bg-background">
      <DashboardHeader />

      <div className="max-w-[1400px] mx-auto px-4 md:px-6 pt-6 pb-24">
        {/* Tab navigation */}
        <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all duration-300 ${
                  isActive
                    ? 'text-white'
                    : 'text-text-muted hover:text-foreground hover:bg-surface-elevated'
                }`}
                style={isActive ? { background: teamConfig.accentColor } : {}}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'payments' && <PaymentsTab />}
        {activeTab === 'roster' && <RosterTab />}
        {activeTab === 'fees' && <FeesTab />}
        {activeTab === 'schedule' && <ScheduleTab />}
      </div>
    </div>
  );
}
