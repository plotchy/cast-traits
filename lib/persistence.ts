import type { CastTraitIndex, TraitsRegistry } from '@/lib/traits';
import type { CompactCast } from '@/app/compact_cast_interface';

const STORAGE_KEY = 'cte_traits_v1';
const STORAGE_INDEX_KEY = 'cte_trait_index_v1';

type Persisted = {
  version: 1;
  traits: TraitsRegistry;
};

export function loadTraitsFromStorage(): TraitsRegistry | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (!parsed || parsed.version !== 1 || typeof parsed.traits !== 'object') return null;
    return parsed.traits;
  } catch {
    return null;
  }
}

export function saveTraitsToStorage(traits: TraitsRegistry): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: Persisted = { version: 1, traits };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage errors
  }
}

// Persisted index payload keyed by dataset and trait signatures
type PersistedIndex = {
  version: 1;
  datasetSig: string;
  traitsSig: string;
  index: CastTraitIndex;
};

function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  function helper(v: unknown): unknown {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map((x) => helper(x));
    const obj = v as Record<string, unknown>;
    if (seen.has(obj)) return '[circular]';
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = helper(obj[key]);
    }
    return out;
  }
  try {
    return JSON.stringify(helper(value));
  } catch {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

function simpleHash(input: string): string {
  // djb2
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function computeTraitsSignature(traits: TraitsRegistry): string {
  // Only include fields that affect predicate results: code + enabled
  const minimal: Record<string, { code: string; enabled?: boolean }> = {};
  for (const [name, def] of Object.entries(traits).sort(([a], [b]) => a.localeCompare(b))) {
    minimal[name] = { code: def.code, enabled: def.enabled };
  }
  return simpleHash(stableStringify(minimal));
}

export function computeDatasetSignature(casts: CompactCast[]): string {
  const n = casts.length;
  const sampleCount = Math.min(10, n);
  const first = casts.slice(0, sampleCount);
  const last = casts.slice(Math.max(0, n - sampleCount));
  const summary = {
    n,
    first: first.map((c) => ({
      k: c.hash ?? `${c.timestamp ?? ''}|${(c.text ?? '').slice(0, 16)}`,
      t: c.timestamp,
    })),
    last: last.map((c) => ({
      k: c.hash ?? `${c.timestamp ?? ''}|${(c.text ?? '').slice(0, 16)}`,
      t: c.timestamp,
    })),
  };
  return simpleHash(stableStringify(summary));
}

export function loadTraitIndexFromStorage(
  casts: CompactCast[],
  traits: TraitsRegistry
): CastTraitIndex | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_INDEX_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedIndex;
    if (!parsed || parsed.version !== 1) return null;
    const ds = computeDatasetSignature(casts);
    const ts = computeTraitsSignature(traits);
    if (parsed.datasetSig !== ds || parsed.traitsSig !== ts) return null;
    return parsed.index || null;
  } catch {
    return null;
  }
}

export function saveTraitIndexToStorage(
  index: CastTraitIndex,
  casts: CompactCast[],
  traits: TraitsRegistry
): void {
  if (typeof window === 'undefined') return;
  try {
    const payload: PersistedIndex = {
      version: 1,
      datasetSig: computeDatasetSignature(casts),
      traitsSig: computeTraitsSignature(traits),
      index,
    };
    window.localStorage.setItem(STORAGE_INDEX_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}


