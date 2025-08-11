// Compact batch root
export type CompactBatch = {
    casts: CompactCast[];
  };
  
  // Shared bits
  export type Reactions = {
    likes_count?: number;
    recasts_count?: number;
  };
  
  export type Replies = {
    count: number;
  };
  
  export type MinimalAuthor = {
    fid?: number | null;
    username?: string;
    display_name?: string;
    pfp_url?: string;
  };
  
  // Embeds
  export type Embed =
    | { cast: CompactEmbeddedCast }
    | { url: string }
    | { cast_id_hash: string };
  
  // Base across top-level and embedded casts
  export type CompactBase = {
    // producer usually includes these, but they’re optional by construction
    hash?: string;
    text?: string;
    timestamp?: string;
  
    reactions?: Reactions;
    replies?: Replies;
    embeds?: Embed[];
  };
  
  // Top-level casts (include parent info; no author)
  export type CompactCast = CompactBase & {
    parent_hash: string | null;
    parent_author: { fid: number | null };
  };
  
  // Embedded casts (include author; no parent info)
  export type CompactEmbeddedCast = CompactBase & {
    author?: MinimalAuthor;
  };
  
  // Helpers
  export function isQuoteCast(cast: CompactCast): boolean {
    return Boolean(cast.embeds?.some((e): e is { cast: CompactEmbeddedCast } => "cast" in e));
  }
  
  export function isReplyCast(cast: CompactCast): boolean {
    return cast.parent_hash !== null && cast.parent_author?.fid !== null;
  }
  
  export function isStandaloneCast(cast: CompactCast): boolean {
    return !isReplyCast(cast) && !isQuoteCast(cast);
  }
  
  // Example parse
  export function parseCompactBatch(json: string): CompactBatch {
    return JSON.parse(json) as CompactBatch;
  }