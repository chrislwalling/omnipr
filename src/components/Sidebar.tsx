import { Newspaper, Users, PenLine, ClipboardList, BarChart2 } from 'lucide-react';
import type { TabId } from '../App';
import SystemStatus from './SystemStatus';
import OmniLogo from './OmniLogo';

// Replace the styled "O" placeholder with omni-logo.svg once Chris provides the asset:
// <img src="/omni-logo.svg" alt="Omni Hotels" className="w-10 h-10" />

const NAV_ITEMS: { id: TabId; label: string; Icon: React.FC<{ size: number }> }[] = [
  { id: 'news',    label: 'News',         Icon: Newspaper },
  { id: 'media',   label: 'Media',        Icon: Users },
  { id: 'pitches', label: 'Pitches',      Icon: PenLine },
  { id: 'tracker', label: 'Pitch Tracker',Icon: ClipboardList },
  { id: 'usage',   label: 'Usage',        Icon: BarChart2 },
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
        backgroundColor: '#003E52',
        borderRight: '1px solid rgba(200,164,90,0.15)',
      }}
    >
      {/* Logo area — swap inner content for <img src="/omni-logo.svg" /> when available */}
      <div
        className="flex flex-col items-center justify-center px-4 py-6"
        style={{ borderBottom: '1px solid rgba(200,164,90,0.15)', minHeight: '100px' }}
      >
        <div className="w-24 mb-3">
          <OmniLogo />
        </div>
        <div
          className="text-xs font-semibold tracking-widest uppercase"
          style={{ color: 'rgba(255,255,255,0.6)', letterSpacing: '0.15em', fontSize: '10px' }}
        >
          PR Dashboard
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className="flex items-center w-full px-4 py-3 text-sm font-medium transition-colors"
              style={{
                color: active ? '#C8A45A' : 'rgba(255,255,255,0.6)',
                backgroundColor: active ? 'rgba(200,164,90,0.12)' : 'transparent',
                borderLeft: active ? '3px solid #C8A45A' : '3px solid transparent',
                cursor: 'pointer',
              }}
              onMouseEnter={e => {
                if (!active) (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(200,164,90,0.1)';
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
        style={{ borderTop: '1px solid rgba(200,164,90,0.15)' }}
      >
        <SystemStatus />
      </div>
    </aside>
  );
}
