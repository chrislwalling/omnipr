const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  Draft: { bg: '#e2e8f0', color: '#475569' },
  Sent: { bg: '#dbeafe', color: '#1d4ed8' },
  'Followed Up': { bg: '#fef3c7', color: '#92400e' },
  Responded: { bg: '#d1fae5', color: '#065f46' },
  Closed: { bg: '#f3f4f6', color: '#6b7280' },
};

export default function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] || { bg: '#e2e8f0', color: '#475569' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {status}
    </span>
  );
}
