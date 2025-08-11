import type { CompactCast } from '@/app/compact_cast_interface';

export type SearchFilters = {
  q?: string;
  offset?: number;
  limit?: number;
  isQuote?: boolean;
  hasImage?: boolean;
  hasLink?: boolean;
  dateFrom?: string; // ISO
  dateTo?: string; // ISO
  emojis?: string[]; // match any of these
  oneWord?: boolean; // single word
  longform?: boolean; // long text
  // Engagement thresholds
  minLikes?: number;
  minReplies?: number;
  // Sorting
  sortBy?: 'newest' | 'likes' | 'replies';
  // Time-based collections (Pacific Time)
  timeBucket?: 'midnight' | 'morning' | 'lunch';
  timePattern?: 'topOfHour' | 'buzzerBeater' | 'elevenEleven' | 'duplicities';
};

export type SearchResponse = {
  results: CompactCast[];
  total: number;
  facets?: {
    topEmojis: { emoji: string; count: number }[];
    counts: {
      quotes: number;
      images: number;
      links: number;
    };
  };
  suggestions?: { cast: CompactCast; score: number }[];
};


