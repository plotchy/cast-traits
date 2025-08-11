import type { TraitsRegistry } from '@/lib/traits';

export function getDefaultTraits(): TraitsRegistry {
  const now = new Date().toISOString();
  const t: TraitsRegistry = {
    'Welcome': {
      description: 'Welcomes a new user and mentions them',
      code: `(cast) => /\\bwelcome\\b/i.test(cast.text ?? '') && /@\\w+/.test(cast.text ?? '')`,
      created_at: now,
      enabled: true,
    },
    'Humorous': {
      description: 'Has a lol, haha, or lmao',
      code: `(cast) => /\\b(lol|haha|lmao)\\b/i.test(cast.text ?? '')`,
      created_at: now,
      enabled: true,
    },
    'Emoji': {
      description: 'Contains an emoji',
      code: `(cast) => { const s = cast.text ?? ''; try { return /\\p{Extended_Pictographic}/u.test(s); } catch { return /[\\u{1F300}-\\u{1FAFF}]/u.test(s); } }`,
      created_at: now,
      enabled: true,
    },
    'Wtf': {
      description: 'Contains "wtf"',
      code: `(cast) => /\\bwtf\\b/i.test(cast.text ?? '')`,
      created_at: now,
      enabled: true,
    },
    'Mentioner': {
      description: 'Mentions a user',
      code: `(cast) => /@\\w+/.test(cast.text ?? '')`,
      created_at: now,
      enabled: true,
    },
    'TIL': {
      description: 'Cast is about something learned (TIL)',
      code: `(cast) => (cast.text ?? '').includes('TIL')`,
      created_at: now,
      enabled: true,
    },
    'One Word': {
      description: 'Cast is a single word',
      code: `(cast) => { const s = (cast.text ?? '').trim(); if (s.length === 0) return false; return !/\\s/.test(s); }`,
      created_at: now,
      enabled: true,
    },
    'Longform': {
      description: '100 words or more',
      code: `(cast) => { const s = cast.text ?? ''; const words = s.trim().split(/\\s+/).filter(Boolean); return words.length >= 100; }`,
      created_at: now,
      enabled: true,
    },
    '11:11 club': {
      description: 'Timestamp at 11:11 America/Los_Angeles',
      code: `(cast) => { if (!cast.timestamp) return false; const d = new Date(cast.timestamp); if (isNaN(d.getTime())) return false; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(d); const h = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); const m = Number(parts.find(p => p.type === 'minute')?.value ?? '-1'); return h === 11 && m === 11; }`,
      created_at: now,
      enabled: true,
    },
    '1:11, 2:22, 3:33, 4:44, 5:55': {
      description: 'Hour/minute duplicate digits (LA time) like 1:11, 2:22, ... 5:55',
      code: `(cast) => { if (!cast.timestamp) return false; const d = new Date(cast.timestamp); if (isNaN(d.getTime())) return false; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(d); const h = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); const m = Number(parts.find(p => p.type === 'minute')?.value ?? '-1'); if (h < 1 || h > 5) return false; return m === h * 11; }`,
      created_at: now,
      enabled: true,
    },
    'Breakfast club': {
      description: 'Timestamp between 7:00am and 10:30am America/Los_Angeles',
      code: `(cast) => { if (!cast.timestamp) return false; const d = new Date(cast.timestamp); if (isNaN(d.getTime())) return false; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(d); const h = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); const m = Number(parts.find(p => p.type === 'minute')?.value ?? '-1'); if (h === -1 || m === -1) return false; const totalMinutes = h * 60 + m; return totalMinutes >= 420 && totalMinutes <= 630; }`,
      created_at: now,
      enabled: true,
    },
    'Midnight': {
      description: 'Timestamp between 12:00am and 12:59am America/Los_Angeles',
      code: `(cast) => { if (!cast.timestamp) return false; const d = new Date(cast.timestamp); if (isNaN(d.getTime())) return false; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(d); const h = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); return h === 0; }`,
      created_at: now,
      enabled: true,
    },
    'Buzzer Beater': {
      description: 'Timestamp with minute 59 America/Los_Angeles',
      code: `(cast) => { if (!cast.timestamp) return false; const d = new Date(cast.timestamp); if (isNaN(d.getTime())) return false; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(d); const m = Number(parts.find(p => p.type === 'minute')?.value ?? '-1'); return m === 59; }`,
      created_at: now,
      enabled: true,
    },
    'Web surfer': {
      description: 'Contains a URL',
      code: `(cast) => /https?:\\/\\/[^\\s]+/.test(cast.text ?? '') || (cast.embeds?.some(e => 'url' in e) === true)`,
      created_at: now,
      enabled: true,
    },
    'Questioner': {
      description: 'Contains a question mark',
      code: `(cast) => (cast.text ?? '').includes('?')`,
      created_at: now,
      enabled: true,
    },
    'Liked': {
      description: '100+ likes',
      code: `(cast) => (cast.reactions?.likes_count ?? 0) >= 100`,
      created_at: now,
      enabled: true,
    },
    'Viral': {
      description: '1000+ likes',
      code: `(cast) => (cast.reactions?.likes_count ?? 0) >= 1000`,
      created_at: now,
      enabled: true,
    },
    "Reply'd guy": {
      description: '10+ replies',
      code: `(cast) => (cast.replies?.count ?? 0) >= 10`,
      created_at: now,
      enabled: true,
    },
    'Thought provoking': {
      description: '100+ replies',
      code: `(cast) => (cast.replies?.count ?? 0) >= 100`,
      created_at: now,
      enabled: true,
    },
    'gm': {
      description: 'Contains "gm"',
      code: `(cast) => /\\bgm\\b/i.test(cast.text ?? '')`,
      created_at: now,
      enabled: true,
    },
    'Quote': {
      description: 'Contains an embedded cast',
      code: `(cast) => cast.embeds?.some(e => 'cast' in e) === true`,
      created_at: now,
      enabled: true,
    },
    'Music': {
      description: 'Links to Spotify or Apple Music',
      code: `(cast) => { const text = cast.text ?? ''; const has = /(https?:\\/\\/[^\\s]*\\b(open\\.spotify\\.com|music\\.apple\\.com)\\b)/i.test(text); const embed = cast.embeds?.some(e => 'url' in e && /(open\\.spotify\\.com|music\\.apple\\.com)/i.test(e.url)) === true; return has || embed; }`,
      created_at: now,
      enabled: true,
    },
  };
  return t;
}


