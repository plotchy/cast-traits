import { promises as fs } from 'fs';
import path from 'path';
import type { CompactBatch, CompactCast } from '@/app/compact_cast_interface';
import { isQuoteCast } from '@/app/compact_cast_interface';
import type { SearchFilters, SearchResponse } from '@/lib/searchTypes';

class InMemoryRepository {
  private casts: CompactCast[] | null = null;
  private initialized = false;
  private dataPath: string;

  constructor() {
    const configuredPath = process.env.DATA_FILE_PATH;
    // Default to project root + romero_compact_non_replies.json
    this.dataPath = configuredPath
      ? configuredPath
      : path.join(process.cwd(), 'romero_compact_non_replies.json');
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  private async loadData(): Promise<void> {
    if (this.initialized && this.casts) return;
    const raw = await fs.readFile(this.dataPath, 'utf-8');
    const parsed = JSON.parse(raw) as CompactBatch;
    this.casts = parsed.casts ?? [];
    this.initialized = true;
  }

  public async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.loadData();
    }
  }

  private extractEmojisFromText(text?: string): string[] {
    if (!text) return [];
    // Basic, fast emoji capture using Unicode property escapes
    const matches = text.match(/\p{Extended_Pictographic}/gu) ?? [];
    return matches;
  }

  private castHasImage(cast: CompactCast): boolean {
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
    return urls.some((u) =>
      /(\.png$|\.jpg$|\.jpeg$|\.gif$|\.webp$|imagedelivery\.net)/i.test(u)
    );
  }

  private castHasLink(cast: CompactCast): boolean {
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

  private getCastEmojis(cast: CompactCast): string[] {
    // Legacy: emojis from both top-level and embedded texts
    const list: string[] = [];
    list.push(...this.extractEmojisFromText(cast.text));
    if (cast.embeds) {
      for (const e of cast.embeds) {
        if ('cast' in e) {
          list.push(...this.extractEmojisFromText(e.cast.text));
        }
      }
    }
    return list;
  }

  private getCastOwnEmojis(cast: CompactCast): string[] {
    // Emojis from the original cast text only (no embeds)
    return this.extractEmojisFromText(cast.text);
  }

  private applyFilters(source: CompactCast[], f: SearchFilters): CompactCast[] {
    const q = (f.q ?? '').trim().toLowerCase();
    const dateFrom = f.dateFrom ? Date.parse(f.dateFrom) : undefined;
    const dateTo = f.dateTo ? Date.parse(f.dateTo) : undefined;
    const emojiSet = new Set(f.emojis ?? []);

    return source.filter((cast) => {
      // Text search
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

      // Quote filter
      if (typeof f.isQuote === 'boolean') {
        if (isQuoteCast(cast) !== f.isQuote) return false;
      }

      // Image filter
      if (typeof f.hasImage === 'boolean') {
        if (this.castHasImage(cast) !== f.hasImage) return false;
      }

      // Link filter
      if (typeof f.hasLink === 'boolean') {
        if (this.castHasLink(cast) !== f.hasLink) return false;
      }

      // Date range filter
      if (dateFrom !== undefined || dateTo !== undefined) {
        const ts = cast.timestamp ? Date.parse(cast.timestamp) : NaN;
        if (!Number.isFinite(ts)) return false;
        if (dateFrom !== undefined && ts < dateFrom) return false;
        if (dateTo !== undefined && ts > dateTo) return false;
      }

      // Emoji inclusion (any of)
      if (emojiSet.size > 0) {
        // Filter by emojis present in the original cast text only
        const emojis = this.getCastOwnEmojis(cast);
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
        // Use a softer threshold for "longform" to capture more interesting reads
        if ((text ?? '').length < 240) return false;
      }

      // Engagement thresholds
      if (typeof f.minLikes === 'number') {
        const likes = cast.reactions?.likes_count ?? 0;
        if (likes < f.minLikes) return false;
      }
      if (typeof f.minReplies === 'number') {
        const replies = cast.replies?.count ?? 0;
        if (replies < f.minReplies) return false;
      }
      // Time-based collections (PT)
      if (f.timeBucket || f.timePattern) {
        const ts = cast.timestamp;
        if (!ts) return false;
        const { hour24, minute, hour12 } = this.getPacificTimeParts(ts);
        // Buckets
        if (f.timeBucket === 'midnight' && hour24 !== 0) return false;
        if (f.timeBucket === 'morning' && !(hour24 >= 6 && hour24 <= 10)) return false;
        if (f.timeBucket === 'lunch' && hour24 !== 12) return false;

        // Patterns
        if (f.timePattern === 'topOfHour' && minute !== 0) return false;
        if (f.timePattern === 'buzzerBeater' && minute !== 59) return false;
        if (f.timePattern === 'elevenEleven' && !(hour12 === 11 && minute === 11)) return false;
        if (f.timePattern === 'duplicities') {
          // e.g., 2:22, 3:33, 4:44, 5:55 (exclude 11:11 which is handled above)
          const dupMinute = hour12 * 11; // 1->11, 2->22, ... 10->110 (won't match)
          const isDup = hour12 !== 11 && dupMinute < 60 && minute === dupMinute;
          if (!isDup) return false;
        }
      }

      return true;
    });
  }

  private getPacificTimeParts(iso: string): { hour24: number; hour12: number; minute: number } {
    // Use Intl to avoid dependencies
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
    const hour12 = ((hour24 + 11) % 12) + 1; // 1..12
    return { hour24, hour12, minute: m };
  }

  private includesInOriginalText(cast: CompactCast, qLower: string): boolean {
    if (!qLower) return false;
    const text = cast.text?.toLowerCase() ?? '';
    return text.includes(qLower);
  }

  private includesInEmbeddedText(cast: CompactCast, qLower: string): boolean {
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

  private getCombinedText(cast: CompactCast): string {
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

  private normalizeForWords(input: string): string[] {
    const lowered = input.toLowerCase();
    const cleaned = lowered.replace(/[^\p{L}\p{N}\s]/gu, ' ');
    const tokens = cleaned
      .split(/\s+/)
      .filter((t) => t.length > 1); // ignore single-char tokens
    return tokens;
  }

  private toTrigrams(input: string): string[] {
    const s = input.toLowerCase().replace(/\s+/g, ' ');
    const trimmed = s.trim();
    if (trimmed.length < 3) return trimmed.length ? [trimmed] : [];
    const grams: string[] = [];
    for (let i = 0; i < trimmed.length - 2; i++) {
      grams.push(trimmed.slice(i, i + 3));
    }
    return grams;
  }

  private jaccard<T>(a: Set<T>, b: Set<T>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const v of a) if (b.has(v)) inter++;
    const uni = a.size + b.size - inter;
    return uni === 0 ? 0 : inter / uni;
  }

  private similarityScore(query: string, text: string): number {
    if (!query || !text) return 0;
    const qWords = new Set(this.normalizeForWords(query));
    const tWords = new Set(this.normalizeForWords(text));
    const wordScore = this.jaccard(qWords, tWords);

    const qTri = new Set(this.toTrigrams(query));
    const tTri = new Set(this.toTrigrams(text));
    const triScore = this.jaccard(qTri, tTri);

    // Weighted blend; tweakable
    return 0.6 * wordScore + 0.4 * triScore;
  }

  private computeFacets(list: CompactCast[]) {
    const emojiCounts = new Map<string, number>();
    let quotes = 0;
    let images = 0;
    let links = 0;
    for (const c of list) {
      if (isQuoteCast(c)) quotes++;
      if (this.castHasImage(c)) images++;
      if (this.castHasLink(c)) links++;
      // Top emojis facet from original cast text only
      const emojis = this.getCastOwnEmojis(c);
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

  public async search(filters: SearchFilters): Promise<SearchResponse> {
    await this.ensureInitialized();
    const offset = Math.max(0, filters.offset ?? 0);
    const limit = Math.max(1, Math.min(200, filters.limit ?? 50));

    const source = this.casts ?? [];
    let filtered = this.applyFilters(source, filters);

    // Sorting
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
      return tb - ta; // newest first
    };

    // If q is present, prioritize original-text matches over embedded-only matches.
    const qLower = (filters.q ?? '').trim().toLowerCase();
    if (qLower.length > 0) {
      const originals: CompactCast[] = [];
      const embeddedOnly: CompactCast[] = [];
      for (const c of filtered) {
        const inOrig = this.includesInOriginalText(c, qLower);
        if (inOrig) originals.push(c);
        else if (this.includesInEmbeddedText(c, qLower)) embeddedOnly.push(c);
        else originals.push(c); // safety, but shouldn't happen because applyFilters enforces match
      }
      originals.sort(sortFn);
      embeddedOnly.sort(sortFn);
      filtered = originals.concat(embeddedOnly);
    } else {
      filtered = filtered.sort(sortFn);
    }

    const total = filtered.length;
    const results = filtered.slice(offset, offset + limit);

    const facets = this.computeFacets(filtered);

    // Fuzzy fallback: if q present and no exact results, suggest closest matches
    let suggestions: { cast: CompactCast; score: number }[] | undefined = undefined;
    const q = (filters.q ?? '').trim();
    if (q && total === 0) {
      // Keep other filters but ignore q for candidate pool
      const candidates = this.applyFilters(source, { ...filters, q: '' });
      const scored = candidates
        .map((cast) => ({ cast, score: this.similarityScore(q, this.getCombinedText(cast)) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (scored.length > 0) suggestions = scored;
    }

    return { results, total, facets, suggestions };
  }

  public async getStats(): Promise<{ total: number }>{
    await this.ensureInitialized();
    return { total: (this.casts ?? []).length };
  }
}

// Singleton instance
export const repository = new InMemoryRepository();


