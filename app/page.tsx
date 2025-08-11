"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CompactBatch, CompactCast } from '@/app/compact_cast_interface';
import { CastCard } from '@/app/components/CastCard';
import { searchCasts } from '@/lib/clientSearch';
import type { SearchFilters } from '@/lib/searchTypes';
import type { CastTraitIndex, TraitsRegistry } from '@/lib/traits';
import { computeStatistics, rebuildTraitIndex, stableCastKey } from '@/lib/traits';
import { loadTraitsFromStorage, saveTraitsToStorage, loadTraitIndexFromStorage, saveTraitIndexToStorage } from '@/lib/persistence';
import { getDefaultTraits } from '@/lib/defaultTraits';

export default function Home() {
  const [casts, setCasts] = useState<CompactCast[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [filters, setFilters] = useState<SearchFilters>({ q: '', sortBy: 'newest' });

  // Trait system state
  const [traits, setTraits] = useState<TraitsRegistry>({});
  const [traitIndex, setTraitIndex] = useState<CastTraitIndex>({});
  const [traitsHydrated, setTraitsHydrated] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const res = await fetch('/data/casts.json');
        const json = (await res.json()) as CompactBatch;
        if (!cancelled) setCasts(json.casts ?? []);
      } catch (e) {
        if (!cancelled) setError((e as Error).message || 'Failed to load dataset');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load traits from localStorage and quickly build or hydrate index
  useEffect(() => {
    if (!casts) return;
    let initial = loadTraitsFromStorage();
    if (!initial || Object.keys(initial).length === 0) {
      // Seed default pack on true first run only
      initial = getDefaultTraits();
      setTraits(initial);
    } else {
      setTraits(initial);
    }
    // Try fast path: load cached index if signatures match
    const cached = loadTraitIndexFromStorage(casts, initial);
    if (cached) {
      setTraitIndex(cached);
      setTraitsHydrated(true);
      return;
    }
    // Fallback: rebuild in one pass and persist
    const idx = rebuildTraitIndex(casts, initial);
    setTraitIndex(idx);
    setTraitsHydrated(true);
    saveTraitIndexToStorage(idx, casts, initial);
  }, [casts]);

  // Persist traits on change
  useEffect(() => {
    if (!traitsHydrated) return; // avoid clobbering persisted data with empty state on first mount
    saveTraitsToStorage(traits);
  }, [traits, traitsHydrated]);

  // Persist index when it changes (and we have casts + traits)
  useEffect(() => {
    if (!traitsHydrated) return;
    if (!casts) return;
    saveTraitIndexToStorage(traitIndex, casts, traits);
  }, [traitIndex, casts, traits, traitsHydrated]);

  const search = useMemo(() => {
    if (!casts) return null;
    return searchCasts(casts, filters);
  }, [casts, filters]);

  const stats = useMemo(() => computeStatistics(traitIndex, traits), [traitIndex, traits]);
  const traitPercentByName = useMemo(() => {
    if (!casts || casts.length === 0) return {} as Record<string, number>;
    const total = casts.length;
    const out: Record<string, number> = {};
    for (const [name, count] of Object.entries(stats.countsByTrait)) {
      out[name] = (count / total) * 100;
    }
    return out;
  }, [casts, stats]);
  const [selectedTraits, setSelectedTraits] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState<number>(50);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  

  // const total = search?.total ?? 0; // no longer displayed; count derived from resultsAfterTraitFilter

  const resultsAfterTraitFilter = useMemo(() => {
    const list = search?.results ?? [];
    if (selectedTraits.length === 0) return list;
    const enabledSelected = selectedTraits.filter((t) => traits[t]?.enabled !== false);
    const mustHave = new Set(enabledSelected);
    if (mustHave.size === 0) return list;
    return list.filter((c) => {
      const tNames = new Set(traitIndex[stableCastKey(c)] ?? []);
      for (const t of mustHave) if (!tNames.has(t)) return false;
      return true;
    });
  }, [search, selectedTraits, traitIndex, traits]);

  // Reset windowed rendering on data/filter changes
  const windowResetDeps = `${filters.q}|${filters.hasImage}|${filters.hasLink}|${filters.isQuote}|${filters.sortBy}|${casts ? casts.length : 0}|${selectedTraits.sort().join(',')}`;
  useEffect(() => {
    setVisibleCount(50);
  }, [windowResetDeps]);

  // Infinite scroll sentinel
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    let ticking = false;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !ticking) {
          ticking = true;
          setVisibleCount((c) => c + 50);
          // allow next tick to schedule again
          setTimeout(() => {
            ticking = false;
          }, 100);
        }
      },
      { rootMargin: '1000px 0px 1000px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [sentinelRef]);

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Cast Trait Explorer</h1>
          <a className="underline text-sm" href="/loot">Loot Box</a>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <input
            type="text"
            placeholder="Search text..."
            className="border rounded px-3 py-2 md:col-span-2"
            value={filters.q ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value, offset: 0 }))}
          />
          <select
            className="border rounded px-3 py-2"
            value={filters.sortBy ?? 'newest'}
            onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value as SearchFilters['sortBy'] }))}
          >
            <option value="newest">Newest</option>
            <option value="likes">Likes</option>
            <option value="replies">Replies</option>
          </select>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(filters.hasImage)}
                onChange={(e) => setFilters((f) => ({ ...f, hasImage: e.target.checked || undefined, offset: 0 }))}
              />
              <span>Images</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(filters.hasLink)}
                onChange={(e) => setFilters((f) => ({ ...f, hasLink: e.target.checked || undefined, offset: 0 }))}
              />
              <span>Links</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={Boolean(filters.isQuote)}
                onChange={(e) => setFilters((f) => ({ ...f, isQuote: e.target.checked || undefined, offset: 0 }))}
              />
              <span>Quotes</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="border rounded p-3">
            <div className="text-sm font-medium mb-2">Active traits</div>
            <ul className="text-sm space-y-1 max-h-64 md:max-h-80 overflow-auto pr-1">
              {Object.entries(traits).length === 0 && <li className="opacity-70">None yet</li>}
              {Object.entries(traits)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([name, def]) => (
                  <li key={name} className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-mono text-xs">{name}</div>
                      <div className="text-xs opacity-80 break-words max-w-[28rem]">{def.description}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs border rounded px-2 py-1"
                        title={def.enabled === false ? 'Enable' : 'Disable'}
                        onClick={() =>
                          setTraits((t) => ({
                            ...t,
                            [name]: { ...t[name], enabled: t[name].enabled === false ? true : false },
                          }))
                        }
                      >
                        {def.enabled === false ? '👁️‍🗨️ Show' : '🙈 Hide'}
                      </button>
                      <button
                        className="text-xs border rounded px-2 py-1"
                        title="Delete trait"
                        onClick={() => {
                          setTraits((t) => {
                            const nt = { ...t };
                            delete nt[name];
                            return nt;
                          });
                          setTraitIndex((idx) => {
                            const nidx = { ...idx };
                            for (const k of Object.keys(nidx)) {
                              nidx[k] = (nidx[k] ?? []).filter((x) => x !== name);
                            }
                            return nidx;
                          });
                          setSelectedTraits((cur) => cur.filter((x) => x !== name));
                        }}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </li>
                ))}
            </ul>
          </div>
          {/* Stats */}
          {casts && (
            <div className="border rounded p-3">
              <div className="text-sm font-medium mb-2">Stats</div>
              <div className="text-sm flex flex-wrap gap-3 mb-2">
                <span>Total casts: {casts.length}</span>
                <span>0 traits: {stats.distribution[0]}</span>
                <span>1 trait: {stats.distribution[1]}</span>
                <span>2 traits: {stats.distribution[2]}</span>
                <span>3+ traits: {stats.distribution['3+']}</span>
              </div>
              <div className="text-xs grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-auto">
                {Object.entries(stats.countsByTrait)
                  .sort((a, b) => b[1] - a[1])
                  .map(([t, c]) => {
                    const active = selectedTraits.includes(t);
                    return (
                      <button
                        key={t}
                        className={`flex items-center justify-between border rounded px-2 py-1 text-left ${
                          active ? 'bg-black/5 dark:bg-white/10' : ''
                        }`}
                        onClick={() =>
                          setSelectedTraits((cur) =>
                            cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]
                          )
                        }
                      >
                        <span className="font-mono">{t}</span>
                        <span>{c}</span>
                      </button>
                    );
                  })}
              </div>
              {selectedTraits.length > 0 && (
                <div className="mt-2 text-xs">
                  Filtering by traits:{' '}
                  {selectedTraits.map((t) => (
                    <span key={t} className="font-mono mr-1">
                      {t}
                    </span>
                  ))}
                  <button className="ml-2 underline" onClick={() => setSelectedTraits([])}>
                    clear all
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-sm mb-4">
          {loading && <span>Loading…</span>}
          {error && <span className="text-red-600">{error}</span>}
          {!loading && !error && <span>Total: {resultsAfterTraitFilter.length}</span>}
        </div>

        {/* Facets removed per TODO */}

        <div className="grid grid-cols-1 gap-3">
          {resultsAfterTraitFilter.slice(0, visibleCount).map((cast) => {
            const key = stableCastKey(cast);
            const traitsForCast = (traitIndex[key] ?? []).filter((t) => traits[t]?.enabled !== false);
            return (
              <CastCard
                key={key}
                cast={cast}
                castKey={key}
                traitNames={traitsForCast}
                traitPercentByName={traitPercentByName}
                onTraitClick={(t) =>
                  setSelectedTraits((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))
                }
              />
            );
          })}
          <div ref={sentinelRef} />
        </div>
      </div>
    </div>
  );
}
