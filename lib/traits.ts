import type { CompactCast } from '@/app/compact_cast_interface';

export type TraitDefinition = {
  description: string;
  code: string; // stringified predicate: (cast) => boolean
  created_at: string; // ISO
  enabled?: boolean; // default true
};

export type TraitsRegistry = Record<string, TraitDefinition>;

export type CastTraitIndex = Record<string, string[]>; // cast.hash -> trait names

// Cache compiled predicate functions by their source code to avoid recompilation
type TraitPredicate = (cast: CompactCast) => boolean;
const predicateCache = new Map<string, TraitPredicate>();

export function compileTraitPredicate(code: string): TraitPredicate {
  if (predicateCache.has(code)) return predicateCache.get(code)!;
  let compiled: TraitPredicate;
  try {
    const fn = new Function('cast', `return Boolean((${code})(cast))`);
    compiled = (cast: CompactCast) => Boolean((fn as (c: CompactCast) => unknown)(cast));
  } catch {
    compiled = () => false;
  }
  predicateCache.set(code, compiled);
  return compiled;
}

export function stableCastKey(cast: CompactCast): string {
  if (cast.hash) return String(cast.hash);
  const t = cast.timestamp ?? '';
  const x = cast.text ?? '';
  return `${t}|${x}`;
}

export function sandboxCast(cast: CompactCast): CompactCast {
  return {
    hash: cast.hash,
    text: cast.text,
    timestamp: cast.timestamp,
    reactions: cast.reactions ? { ...cast.reactions } : undefined,
    replies: cast.replies ? { ...cast.replies } : undefined,
    embeds: cast.embeds
      ? cast.embeds.map((e) => {
          if ('url' in e) return { url: e.url } as const;
          if ('cast' in e)
            return {
              cast: {
                text: e.cast.text,
                timestamp: e.cast.timestamp,
                embeds: e.cast.embeds?.map((ee) =>
                  'url' in ee ? { url: ee.url } : 'cast_id_hash' in ee ? { cast_id_hash: ee.cast_id_hash } : ee
                ),
                author: e.cast.author
                  ? {
                      fid: e.cast.author.fid ?? null,
                      username: e.cast.author.username,
                      display_name: e.cast.author.display_name,
                      pfp_url: e.cast.author.pfp_url,
                    }
                  : undefined,
              },
            } as const;
          if ('cast_id_hash' in e) return { cast_id_hash: e.cast_id_hash } as const;
          return e as { cast_id_hash: string };
        })
      : undefined,
    parent_hash: cast.parent_hash,
    parent_author: cast.parent_author,
  };
}

export function executeTraitPredicate(code: string, cast: CompactCast): boolean {
  try {
    const compiled = compileTraitPredicate(code);
    return Boolean(compiled(sandboxCast(cast)));
  } catch {
    return false;
  }
}

export function applyTraitToAllCasts(
  allCasts: CompactCast[],
  traitName: string,
  code: string,
  prevIndex: CastTraitIndex
): CastTraitIndex {
  const nextIndex: CastTraitIndex = { ...prevIndex };
  for (const cast of allCasts) {
    const hash = stableCastKey(cast);
    const matches = executeTraitPredicate(code, cast);
    const current = new Set(nextIndex[hash] ?? []);
    if (matches) current.add(traitName);
    else current.delete(traitName);
    nextIndex[hash] = Array.from(current);
  }
  return nextIndex;
}

export function computeStatistics(index: CastTraitIndex, traits: TraitsRegistry) {
  const countsByTrait: Record<string, number> = {};
  const enabledTraits = new Set(
    Object.entries(traits)
      .filter((entry) => entry[1].enabled !== false)
      .map((entry) => entry[0])
  );
  for (const t of enabledTraits) countsByTrait[t] = 0;

  const distribution: Record<number | '3+', number> = { 0: 0, 1: 0, 2: 0, '3+': 0 };
  const entries = Object.values(index);
  for (const traitList of entries) {
    const filtered = (traitList ?? []).filter((t) => enabledTraits.has(t));
    const n = filtered.length;
    if (n === 0) distribution[0]++;
    else if (n === 1) distribution[1]++;
    else if (n === 2) distribution[2]++;
    else distribution['3+']++;
    for (const t of filtered) countsByTrait[t] = (countsByTrait[t] ?? 0) + 1;
  }
  return { countsByTrait, distribution };
}

// Build the entire trait index in a single pass over casts, compiling predicates once
export function rebuildTraitIndex(allCasts: CompactCast[], traits: TraitsRegistry): CastTraitIndex {
  const compiledList: Array<[string, TraitPredicate]> = [];
  for (const [name, def] of Object.entries(traits)) {
    compiledList.push([name, compileTraitPredicate(def.code)]);
  }

  const index: CastTraitIndex = {};
  for (const c of allCasts) {
    const key = stableCastKey(c);
    const safe = sandboxCast(c);
    const names: string[] = [];
    for (const [name, pred] of compiledList) {
      let ok = false;
      try {
        ok = Boolean(pred(safe));
      } catch {
        ok = false;
      }
      if (ok) names.push(name);
    }
    // Always set an entry so downstream stats can count 0-trait casts
    index[key] = names;
  }
  return index;
}


