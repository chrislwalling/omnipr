import type { ScoreTier } from '../types';

const STYLES: Record<ScoreTier, { bg: string; color: string }> = {
  High: { bg: '#C8A45A', color: '#003E52' },
  Medium: { bg: '#003E52', color: '#C8A45A' },
  Low: { bg: '#6B7280', color: '#ffffff' },
  Discard: { bg: '#F3F4F6', color: '#6B7280' },
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
