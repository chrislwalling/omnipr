import { Newspaper, Users, PenLine, ClipboardList } from 'lucide-react';
import type { TabId } from '../App';
import SystemStatus from './SystemStatus';

const NAV_ITEMS: { id: TabId; label: string; Icon: React.FC<{ size: number }> }[] = [
  { id: 'news', label: 'News', Icon: Newspaper },
  { id: 'media', label: 'Media', Icon: Users },
  { id: 'pitches', label: 'Pitches', Icon: PenLine },
  { id: 'tracker', label: 'Pitch Tracker', Icon: ClipboardList },
];

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function Sidebar({ activeTab, onTabChange }: Props) {
  return (
    <aside
      className="flex flex-col h-screen fixed left-0 top-0 z-40"
      style={{
        width: '220px',
        backgroundColor: '#1B2F52',
        borderRight: '1px solid rgba(201,168,76,0.15)',
      }}
    >
      {/* Logo */}
      <div
        className="flex flex-col items-center justify-center px-4 py-6"
        style={{ borderBottom: '1px solid rgba(201,168,76,0.15)', minHeight: '100px' }}
      >
        <div
          className="text-xs font-semibold tracking-widest uppercase mb-1"
          style={{ color: '#C9A84C', letterSpacing: '0.2em' }}
        >
          Omni Hotels
        </div>
        <div
          className="text-sm font-medium"
          style={{ color: 'rgba(255,255,255,0.7)' }}
        >
          PR Dashboard
        </div>
        <div
          className="mt-2 w-8 border-t"
          style={{ borderColor: 'rgba(201,168,76,0.4)' }}
        />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex items-center w-full px-4 py-3 text-sm font-medium transition-colors relative"
              style={{
                color: active ? '#C9A84C' : '#94a3b8',
                backgroundColor: active ? 'rgba(201,168,76,0.08)' : 'transparent',
                borderLeft: active ? '3px solid #C9A84C' : '3px solid transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(201,168,76,0.1)';
              }}
              onMouseLeave={e => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
              }}
            >
              <Icon size={18} />
              <span className="ml-3">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* System Status */}
      <div
        className="px-4 py-4"
        style={{ borderTop: '1px solid rgba(201,168,76,0.15)' }}
      >
        <SystemStatus />
      </div>
    </aside>
  );
}
