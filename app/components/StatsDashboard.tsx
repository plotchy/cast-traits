"use client";
import type { CastTraitIndex } from '@/lib/traits';

export function StatsDashboard({
  index,
  traitCounts,
  distribution,
}: {
  index: CastTraitIndex;
  traitCounts: Record<string, number>;
  distribution: Record<number | '3+', number>;
}) {
  const totalCasts = Object.keys(index).length;
  return (
    <div className="border rounded p-3">
      <div className="text-sm font-medium mb-2">Statistics</div>
      <div className="text-sm flex flex-wrap gap-3 mb-3">
        <span>Total casts: {totalCasts}</span>
        <span>0 traits: {distribution[0] ?? 0}</span>
        <span>1 trait: {distribution[1] ?? 0}</span>
        <span>2 traits: {distribution[2] ?? 0}</span>
        <span>3+ traits: {distribution['3+'] ?? 0}</span>
      </div>
      <div className="text-sm">
        <div className="opacity-70 mb-1">Trait counts</div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
          {Object.entries(traitCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([trait, count]) => (
              <li key={trait} className="flex items-center justify-between border rounded px-2 py-1">
                <span className="font-mono text-xs">{trait}</span>
                <span className="text-xs">{count}</span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}


