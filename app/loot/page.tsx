"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TouchEvent as ReactTouchEvent } from 'react';
import Link from 'next/link';
import type { CompactBatch, CompactCast } from '@/app/compact_cast_interface';
import { isQuoteCast } from '@/app/compact_cast_interface';
import { CastCard } from '@/app/components/CastCard';
import { TraitGenerator } from '@/app/components/TraitGenerator';
import type { CastTraitIndex, TraitsRegistry } from '@/lib/traits';
import { applyTraitToAllCasts, rebuildTraitIndex, stableCastKey } from '@/lib/traits';
import { loadTraitsFromStorage, saveTraitsToStorage, loadTraitIndexFromStorage, saveTraitIndexToStorage } from '@/lib/persistence';
import { getDefaultTraits } from '@/lib/defaultTraits';

function castHasImage(cast: CompactCast): boolean {
  const urls: string[] = [];
  if (cast.embeds) {
    for (const e of cast.embeds) {
      if ('url' in e) urls.push(e.url);
      if ('cast' in e && e.cast.embeds) {
        for (const ee of e.cast.embeds) {
          if ('url' in ee) urls.push(ee.url);
        }
      }
    }
  }
  return urls.some((u) => /(\.png$|\.jpg$|\.jpeg$|\.gif$|\.webp$|imagedelivery\.net)/i.test(u));
}

function castHasLink(cast: CompactCast): boolean {
  const text = cast.text ?? '';
  if (/https?:\/\//i.test(text)) return true;
  if (cast.embeds) {
    for (const e of cast.embeds) {
      if ('url' in e) return true;
      if ('cast' in e) {
        if (/https?:\/\//i.test(e.cast.text ?? '')) return true;
        if (e.cast.embeds) {
          for (const ee of e.cast.embeds) {
            if ('url' in ee) return true;
          }
        }
      }
    }
  }
  return false;
}

type Weighted = {
  cast: CompactCast;
  key: string;
  weight: number;
};

function computeWeight(
  cast: CompactCast,
  key: string,
  traitIndex: CastTraitIndex,
  traits: TraitsRegistry
): { weight: number } {
  let weight = 1;
  const likes = cast.reactions?.likes_count ?? 0;
  const replies = cast.replies?.count ?? 0;
  const hasImg = castHasImage(cast);
  const hasLnk = castHasLink(cast);
  const isQuote = isQuoteCast(cast);
  const enabledTraits = (traitIndex[key] ?? []).filter((t) => traits[t]?.enabled !== false);

  if (likes > 0) {
    const bump = Math.log1p(likes) * 0.5;
    weight += bump;
  }
  if (replies > 0) {
    const bump = Math.log1p(replies) * 0.3;
    weight += bump;
  }
  if (hasImg) {
    weight += 1.0;
  }
  if (hasLnk) {
    weight += 0.5;
  }
  if (isQuote) {
    weight += 0.3;
  }
  if (enabledTraits.length > 0) {
    const bump = Math.min(5, enabledTraits.length) * 0.4;
    weight += bump;
  }
  return { weight };
}

function sampleThreeDistinctWeighted(items: Weighted[]): Weighted[] {
  // Simple without replacement sampling by re-normalizing after each pick
  const picked: Weighted[] = [];
  const pool = [...items];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const total = pool.reduce((acc, it) => acc + (it.weight > 0 ? it.weight : 0), 0);
    if (total <= 0) {
      // fallback to uniform
      const idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
      continue;
    }
    let r = Math.random() * total;
    let chosenIndex = 0;
    for (let j = 0; j < pool.length; j++) {
      r -= Math.max(0, pool[j].weight);
      if (r <= 0) {
        chosenIndex = j;
        break;
      }
    }
    picked.push(pool[chosenIndex]);
    pool.splice(chosenIndex, 1);
  }
  return picked;
}

export default function LootBoxPage() {
  const [casts, setCasts] = useState<CompactCast[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const [traits, setTraits] = useState<TraitsRegistry>({});
  const [traitIndex, setTraitIndex] = useState<CastTraitIndex>({});
  const [traitsHydrated, setTraitsHydrated] = useState<boolean>(false);

  // Carousel state
  const [slides, setSlides] = useState<Weighted[][]>([]);
  const [activeSlide, setActiveSlide] = useState<number>(-1);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

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
      initial = getDefaultTraits();
      setTraits(initial);
    } else {
      setTraits(initial);
    }
    const cached = loadTraitIndexFromStorage(casts, initial);
    if (cached) {
      setTraitIndex(cached);
      setTraitsHydrated(true);
      return;
    }
    const idx = rebuildTraitIndex(casts, initial);
    setTraitIndex(idx);
    setTraitsHydrated(true);
    saveTraitIndexToStorage(idx, casts, initial);
  }, [casts]);

  // Persist traits on change
  useEffect(() => {
    if (!traitsHydrated) return;
    saveTraitsToStorage(traits);
  }, [traits, traitsHydrated]);

  // Persist index when it changes
  useEffect(() => {
    if (!traitsHydrated) return;
    if (!casts) return;
    saveTraitIndexToStorage(traitIndex, casts, traits);
  }, [traitIndex, casts, traits, traitsHydrated]);

  const weightedPool: Weighted[] = useMemo(() => {
    if (!casts) return [];
    const out: Weighted[] = [];
    for (const c of casts) {
      const key = stableCastKey(c);
      const { weight } = computeWeight(c, key, traitIndex, traits);
      out.push({ cast: c, key, weight });
    }
    return out;
  }, [casts, traitIndex, traits]);

  const traitPercentByName = useMemo(() => {
    if (!casts || casts.length === 0) return {} as Record<string, number>;
    const total = casts.length;
    const out: Record<string, number> = {};
    const counts: Record<string, number> = {};
    for (const names of Object.values(traitIndex)) {
      for (const t of names ?? []) counts[t] = (counts[t] ?? 0) + 1;
    }
    for (const [t, c] of Object.entries(counts)) out[t] = (c / total) * 100;
    return out;
  }, [casts, traitIndex]);

  const openBox = useCallback(() => {
    const picks = sampleThreeDistinctWeighted(weightedPool);
    setSlides((prev) => {
      const next = [...prev, picks];
      setActiveSlide(next.length - 1);
      return next;
    });
  }, [weightedPool]);

  const goNext = useCallback(() => {
    setSlides((prev) => {
      if (activeSlide < prev.length - 1) {
        setActiveSlide((i) => i + 1);
        return prev;
      }
      const picks = sampleThreeDistinctWeighted(weightedPool);
      const next = [...prev, picks];
      setActiveSlide(next.length - 1);
      return next;
    });
  }, [activeSlide, weightedPool]);

  const goPrev = useCallback(() => {
    setActiveSlide((i) => Math.max(0, i - 1));
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  // Auto-open first box once data & weights are ready
  useEffect(() => {
    if (!loading && !error && weightedPool.length > 0 && slides.length === 0 && activeSlide < 0) {
      openBox();
    }
  }, [loading, error, weightedPool, slides.length, activeSlide, openBox]);

  const handleTouchStart = (e: ReactTouchEvent) => {
    const t = e.changedTouches[0];
    touchStartX.current = t.clientX;
    touchStartY.current = t.clientY;
  };
  const handleTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartX.current;
    const dy = t.clientY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) goNext();
      else goPrev();
    }
  };

  const onTraitGenerated = ({ name, description, code }: { name: string; description: string; code: string }) => {
    if (!casts) return;
    const created_at = new Date().toISOString();
    setTraits((t) => ({ ...t, [name]: { description, code, created_at, enabled: true } }));
    setTraitIndex((idx) => applyTraitToAllCasts(casts, name, code, idx));
  };

  return (
    <div className="min-h-screen p-6 md:p-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Loot Box Simulator</h1>
          <Link className="underline text-sm" href="/">Back to Explorer</Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <TraitGenerator onGenerated={onTraitGenerated} />
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-3">
              <button className="border rounded px-3 py-2" onClick={openBox} disabled={loading || !!error || !casts}>
                {loading ? 'Loading…' : slides.length === 0 ? 'Open Box' : 'Open Box'}
              </button>
              <div className="text-sm opacity-80">
                {error && <span className="text-red-600">{error}</span>}
                {!loading && !error && casts && <span>Pool: {casts.length} casts</span>}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button className="border rounded px-2 py-1" onClick={goPrev} disabled={activeSlide <= 0}>←</button>
                <button className="border rounded px-2 py-1" onClick={goNext} disabled={!casts}>→</button>
              </div>
            </div>
            <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
              {activeSlide >= 0 && slides[activeSlide] && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {slides[activeSlide].map((w) => {
                    const traitNames = (traitIndex[w.key] ?? []).filter((t) => traits[t]?.enabled !== false);
                    return (
                      <CastCard
                        key={w.key}
                        cast={w.cast}
                        castKey={w.key}
                        traitNames={traitNames}
                        traitPercentByName={traitPercentByName}
                        variant="loot"
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


