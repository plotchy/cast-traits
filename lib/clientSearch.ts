import type { CompactBatch, CompactCast } from '@/app/compact_cast_interface';
import { isQuoteCast } from '@/app/compact_cast_interface';
import type { SearchFilters, SearchResponse } from '@/lib/searchTypes';

function extractEmojisFromText(text?: string): string[] {
  if (!text) return [];
  return text.match(/\p{Extended_Pictographic}/gu) ?? [];
}

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

function getCastOwnEmojis(cast: CompactCast): string[] {
  return extractEmojisFromText(cast.text);
}

function getPacificTimeParts(iso: string): { hour24: number; hour12: number; minute: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = fmt.formatToParts(new Date(iso));
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  const hour24 = h;
  const hour12 = ((hour24 + 11) % 12) + 1;
  return { hour24, hour12, minute: m };
}

function includesInOriginalText(cast: CompactCast, qLower: string): boolean {
  if (!qLower) return false;
  const text = cast.text?.toLowerCase() ?? '';
  return text.includes(qLower);
}

function includesInEmbeddedText(cast: CompactCast, qLower: string): boolean {
  if (!qLower) return false;
  if (!cast.embeds) return false;
  for (const e of cast.embeds) {
    if ('cast' in e) {
      const t = e.cast.text?.toLowerCase() ?? '';
      if (t.includes(qLower)) return true;
    }
  }
  return false;
}

function getCombinedText(cast: CompactCast): string {
  let acc = cast.text ?? '';
  if (cast.embeds) {
    for (const e of cast.embeds) {
      if ('cast' in e) {
        acc += ' ' + (e.cast.text ?? '');
      }
    }
  }
  return acc;
}

function normalizeForWords(input: string): string[] {
  const lowered = input.toLowerCase();
  const cleaned = lowered.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  const tokens = cleaned
    .split(/\s+/)
    .filter((t) => t.length > 1);
  return tokens;
}

function toTrigrams(input: string): string[] {
  const s = input.toLowerCase().replace(/\s+/g, ' ');
  const trimmed = s.trim();
  if (trimmed.length < 3) return trimmed.length ? [trimmed] : [];
  const grams: string[] = [];
  for (let i = 0; i < trimmed.length - 2; i++) {
    grams.push(trimmed.slice(i, i + 3));
  }
  return grams;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const v of a) if (b.has(v)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

function similarityScore(query: string, text: string): number {
  if (!query || !text) return 0;
  const qWords = new Set(normalizeForWords(query));
  const tWords = new Set(normalizeForWords(text));
  const wordScore = jaccard(qWords, tWords);

  const qTri = new Set(toTrigrams(query));
  const tTri = new Set(toTrigrams(text));
  const triScore = jaccard(qTri, tTri);

  return 0.6 * wordScore + 0.4 * triScore;
}

function applyFilters(source: CompactCast[], f: SearchFilters): CompactCast[] {
  const q = (f.q ?? '').trim().toLowerCase();
  const dateFrom = f.dateFrom ? Date.parse(f.dateFrom) : undefined;
  const dateTo = f.dateTo ? Date.parse(f.dateTo) : undefined;
  const emojiSet = new Set(f.emojis ?? []);

  return source.filter((cast) => {
    if (q.length > 0) {
      const text = cast.text?.toLowerCase() ?? '';
      let match = text.includes(q);
      if (!match && cast.embeds) {
        for (const e of cast.embeds) {
          if ('cast' in e) {
            const t = e.cast.text?.toLowerCase() ?? '';
            if (t.includes(q)) {
              match = true;
              break;
            }
          }
        }
      }
      if (!match) return false;
    }

    if (typeof f.isQuote === 'boolean') {
      if (isQuoteCast(cast) !== f.isQuote) return false;
    }

    if (typeof f.hasImage === 'boolean') {
      if (castHasImage(cast) !== f.hasImage) return false;
    }

    if (typeof f.hasLink === 'boolean') {
      if (castHasLink(cast) !== f.hasLink) return false;
    }

    if (dateFrom !== undefined || dateTo !== undefined) {
      const ts = cast.timestamp ? Date.parse(cast.timestamp) : NaN;
      if (!Number.isFinite(ts)) return false;
      if (dateFrom !== undefined && ts < dateFrom) return false;
      if (dateTo !== undefined && ts > dateTo) return false;
    }

    if (emojiSet.size > 0) {
      const emojis = getCastOwnEmojis(cast);
      let any = false;
      for (const e of emojis) {
        if (emojiSet.has(e)) {
          any = true;
          break;
        }
      }
      if (!any) return false;
    }

    const text = cast.text ?? '';
    if (f.oneWord === true) {
      const wordCount = (text.trim().match(/\S+/g) || []).length;
      if (wordCount !== 1) return false;
    }
    if (f.longform === true) {
      if ((text ?? '').length < 240) return false;
    }

    if (typeof f.minLikes === 'number') {
      const likes = cast.reactions?.likes_count ?? 0;
      if (likes < f.minLikes) return false;
    }
    if (typeof f.minReplies === 'number') {
      const replies = cast.replies?.count ?? 0;
      if (replies < f.minReplies) return false;
    }

    if (f.timeBucket || f.timePattern) {
      const ts = cast.timestamp;
      if (!ts) return false;
      const { hour24, minute, hour12 } = getPacificTimeParts(ts);
      if (f.timeBucket === 'midnight' && hour24 !== 0) return false;
      if (f.timeBucket === 'morning' && !(hour24 >= 6 && hour24 <= 10)) return false;
      if (f.timeBucket === 'lunch' && hour24 !== 12) return false;

      if (f.timePattern === 'topOfHour' && minute !== 0) return false;
      if (f.timePattern === 'buzzerBeater' && minute !== 59) return false;
      if (f.timePattern === 'elevenEleven' && !(hour12 === 11 && minute === 11)) return false;
      if (f.timePattern === 'duplicities') {
        const dupMinute = hour12 * 11;
        const isDup = hour12 !== 11 && dupMinute < 60 && minute === dupMinute;
        if (!isDup) return false;
      }
    }

    return true;
  });
}

function computeFacetsForList(list: CompactCast[]) {
  const emojiCounts = new Map<string, number>();
  let quotes = 0;
  let images = 0;
  let links = 0;
  for (const c of list) {
    if (isQuoteCast(c)) quotes++;
    if (castHasImage(c)) images++;
    if (castHasLink(c)) links++;
    const emojis = getCastOwnEmojis(c);
    for (const e of emojis) {
      emojiCounts.set(e, (emojiCounts.get(e) ?? 0) + 1);
    }
  }
  const topEmojis = Array.from(emojiCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emoji, count]) => ({ emoji, count }));
  return {
    topEmojis,
    counts: { quotes, images, links },
  };
}

export type LoadedData = CompactBatch;

export function searchCasts(allCasts: CompactCast[], filters: SearchFilters): SearchResponse {
  const offset = Math.max(0, filters.offset ?? 0);
  const source = allCasts ?? [];
  let filtered = applyFilters(source, filters);

  const sortBy = filters.sortBy ?? 'newest';
  const sortFn = (a: CompactCast, b: CompactCast) => {
    if (sortBy === 'likes') {
      return (b.reactions?.likes_count ?? 0) - (a.reactions?.likes_count ?? 0);
    }
    if (sortBy === 'replies') {
      return (b.replies?.count ?? 0) - (a.replies?.count ?? 0);
    }
    const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
    const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
    return tb - ta;
  };

  const qLower = (filters.q ?? '').trim().toLowerCase();
  if (qLower.length > 0) {
    const originals: CompactCast[] = [];
    const embeddedOnly: CompactCast[] = [];
    for (const c of filtered) {
      const inOrig = includesInOriginalText(c, qLower);
      if (inOrig) originals.push(c);
      else if (includesInEmbeddedText(c, qLower)) embeddedOnly.push(c);
      else originals.push(c);
    }
    originals.sort(sortFn);
    embeddedOnly.sort(sortFn);
    filtered = originals.concat(embeddedOnly);
  } else {
    filtered = filtered.sort(sortFn);
  }

  const total = filtered.length;
  let limit = filters.limit;
  if (limit === undefined || limit === null) limit = total; // default: return all
  limit = Math.max(0, Math.min(total - offset, limit));
  const results = filtered.slice(offset, offset + limit);

  const facets = computeFacetsForList(filtered);

  let suggestions: { cast: CompactCast; score: number }[] | undefined = undefined;
  const q = (filters.q ?? '').trim();
  if (q && total === 0) {
    const candidates = applyFilters(source, { ...filters, q: '' });
    const scored = candidates
      .map((cast) => ({ cast, score: similarityScore(q, getCombinedText(cast)) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    if (scored.length > 0) suggestions = scored;
  }

  return { results, total, facets, suggestions };
}


