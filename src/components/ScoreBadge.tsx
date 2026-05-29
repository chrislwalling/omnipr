import type { ScoreTier } from '../types';

const STYLES: Record<ScoreTier, { bg: string; color: string }> = {
  High: { bg: '#C9A84C', color: '#1B2F52' },
  Medium: { bg: '#1B2F52', color: '#C9A84C' },
  Low: { bg: '#8A9BB0', color: '#fff' },
  Discard: { bg: '#e2e8f0', color: '#64748b' },
};

export default function ScoreBadge({ tier }: { tier: ScoreTier }) {
  const s = STYLES[tier] || STYLES.Low;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: s.bg, color: s.color }}
    >
      {tier}
    </span>
  );
}
