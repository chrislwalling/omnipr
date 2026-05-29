import { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, RotateCw } from 'lucide-react';
import type { AllConnectionStatus, ConnectionStatus } from '../types';

function StatusIcon({ s }: { s: ConnectionStatus }) {
  if (!s.configured) return <AlertCircle size={12} style={{ color: '#f59e0b' }} />;
  if (s.reachable) return <CheckCircle size={12} style={{ color: '#22c55e' }} />;
  return <AlertCircle size={12} style={{ color: '#ef4444' }} />;
}

function statusColor(s: ConnectionStatus) {
  if (!s.configured) return '#f59e0b';
  if (s.reachable) return '#22c55e';
  return '#ef4444';
}

const SERVICES = [
  { key: 'googleSheets' as const, label: 'Google Sheets' },
  { key: 'claude' as const, label: 'Claude' },
  { key: 'slack' as const, label: 'Slack' },
];

export default function SystemStatus() {
  const [status, setStatus] = useState<AllConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [spinning, setSpinning] = useState(false);

  const fetchStatus = async () => {
    setSpinning(true);
    try {
      const res = await fetch('/api/status');
      if (res.ok) setStatus(await res.json());
    } catch { /* ignore */ } finally {
      setSpinning(false);
    }
  };

  useEffect(() => {
    fetchStatus().finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: '#C8A45A' }}>System Status</span>
        <button
          onClick={fetchStatus}
          disabled={spinning}
          className="p-1 rounded"
          style={{ color: '#C8A45A', opacity: spinning ? 0.5 : 1 }}
          title="Refresh"
        >
          <RotateCw size={12} className={spinning ? 'animate-spin' : ''} />
        </button>
      </div>
      {loading ? (
        <p className="text-xs" style={{ color: '#9CA3AF' }}>Checking...</p>
      ) : !status ? (
        <p className="text-xs" style={{ color: '#DC2626' }}>Unable to check</p>
      ) : (
        <div className="space-y-1">
          {SERVICES.map(({ key, label }) => (
            <div
              key={key}
              className="flex items-center gap-2 px-2 py-1 rounded text-xs"
              style={{ backgroundColor: 'rgba(200,164,90,0.08)' }}
              title={status[key].error || undefined}
            >
              <StatusIcon s={status[key]} />
              <span style={{ color: statusColor(status[key]) }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
