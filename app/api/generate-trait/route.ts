import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';

type GenerateTraitRequest = {
  name: string;
  description: string;
};

export async function POST(req: Request) {
  try {
    // Simple cookie check to guard LLM endpoint
    const cookieHeader = req.headers.get('cookie') || '';
    const token = cookieHeader
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('cte_auth='))
      ?.split('=')[1];
    const authed = await verifyAuthToken(token);
    if (!authed) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, description } = (await req.json()) as GenerateTraitRequest;
    if (!name || !description) {
      return NextResponse.json({ error: 'name and description are required' }, { status: 400 });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OPENROUTER_API_KEY missing. Set it in your environment.' },
        { status: 400 }
      );
    }

    const messages = [
      {
        role: 'system',
        content:
          [
            'You write safe, concise, pure JavaScript predicate functions as a single arrow function string.',
            '- Input: a `cast` object (CompactCast) as defined below.',
            '- Output: ONLY the arrow function string. No backticks, code fences, comments, imports, or explanations.',
            '- The function must be total and safe: use optional chaining and nullish coalescing; never throw.',
          ].join('\n')
      },
      {
        role: 'user',
        content: [
          `Task: Create a JavaScript arrow function that takes a cast: CompactCast and returns true if it matches the trait. Return ONLY the function, nothing else.`,
          '',
          `Trait name: ${name}`,
          `Trait description: ${description}`,
          '',
          'CompactCast data shape (author omitted at top level; parent info present):',
          'type CompactCast = {',
          '  // Optional by construction',
          '  hash?: string;',
          '  text?: string;',
          '  timestamp?: string; // ISO-8601-like string',
          '  reactions?: { likes_count?: number; recasts_count?: number };',
          '  replies?: { count: number };',
          '  embeds?: Array<',
          '    | { url: string }',
          '    | { cast_id_hash: string }',
          '    | { cast: {',
          '        text?: string;',
          '        timestamp?: string;',
          '        embeds?: Array<{ url: string } | { cast_id_hash: string }>',
          '      } }',
          '  >;',
          '  // Present for top-level casts',
          '  parent_hash: string | null;',
          '  parent_author: { fid: number | null };',
          '};',
          '',
          'Generation rules:',
          '- Only use fields shown above; do not invent properties.',
          '- Always guard with optional chaining (?.) and default with nullish coalescing (??).',
          "- Treat missing text as '' and missing numeric counts as 0.",
          '- For embeds:',
          "  - Image: prefer extension match OR known CDN domains. Example predicate on a URL: `/\\.(jpg|jpeg|png|gif|webp|avif)(\\?.*)?$/i.test(u) || /(imagedelivery\\.net|imgur\\.com|i\\.imgur\\.com|twimg\\.com|pbs\\.twimg\\.com|tenor\\.com|i\\.ibb\\.co)/i.test(u)`",
          "  - Quote/embedded cast: `'cast' in e`",
          "  - Linked-by-hash only: `'cast_id_hash' in e`",
          '- Image-trait scope default: ONLY consider top-level `cast.embeds`. Do NOT inspect images inside embedded quoted casts unless the description explicitly requests it.',
          '- Reply cast: `cast.parent_hash !== null && cast.parent_author?.fid !== null`.',
          '- Prefer single-expression arrow functions; block arrow is allowed if needed.',
          '- No external helpers, no global state, no imports, deterministic, no async.',
          '',
          'Time zone policy:',
          "- Unless the trait description explicitly specifies another time zone, interpret all time-based logic in America/Los_Angeles (Pacific Time), honoring DST.",
          "- Do NOT use getUTCHours for local time checks; use Intl.DateTimeFormat with timeZone: 'America/Los_Angeles'.",
          "- Apply the same rule to embedded cast timestamps if you need to reference them.",
          '',
          'Useful snippets:',
          "- URL present in text: `/https?:\\/\\/[^\\s]+/.test(cast.text ?? '')`",
          "- Count likes+recasts: `(cast.reactions?.likes_count ?? 0) + (cast.reactions?.recasts_count ?? 0)`",
          "- Los Angeles hour (00-23) from timestamp (guarded): `(() => { if (!cast.timestamp) return -1; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit' }).formatToParts(new Date(cast.timestamp)); const h = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); return Number.isNaN(h) ? -1 : h; })()`",
          "- Los Angeles day of week (0=Sun..6=Sat): `(() => { if (!cast.timestamp) return -1; const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).formatToParts(new Date(cast.timestamp)); const m = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 }; const w = parts.find(p => p.type === 'weekday')?.value; return w && w in m ? m[w] : -1; })()`",
          '',
          'Examples (illustrative, not limiting):',
          '- contains_url: (cast) => /https?:\\/\\/[^\\s]+/.test(cast.text ?? \'\')',
          "- has_image_top_robust: (cast) => cast.embeds?.some(e => (\'url\' in e) && (/\\.(jpg|jpeg|png|gif|webp|avif)(\\?.*)?$/i.test(e.url) || /(imagedelivery\\.net|imgur\\.com|i\\.imgur\\.com|twimg\\.com|pbs\\.twimg\\.com|tenor\\.com|i\\.ibb\\.co)/i.test(e.url))) === true",
          '- is_quote: (cast) => cast.embeds?.some(e => (\'cast\' in e)) === true',
          '- high_engagement: (cast) => ((cast.reactions?.likes_count ?? 0) + (cast.reactions?.recasts_count ?? 0)) >= 100',
          "- morning_post_la: (cast) => { if (!cast.timestamp) return false; const h = (() => { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit' }).formatToParts(new Date(cast.timestamp)); const v = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); return Number.isNaN(v) ? -1 : v; })(); return h >= 0 && h < 12; }",
          "- midnight_la: (cast) => { if (!cast.timestamp) return false; const h = (() => { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour12: false, hour: '2-digit' }).formatToParts(new Date(cast.timestamp)); const v = Number(parts.find(p => p.type === 'hour')?.value ?? '-1'); return Number.isNaN(v) ? -1 : v; })(); return h === 0; }",
        ].join('\n')
      },
    ];

    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
        'X-Title': 'Cast Trait Explorer',
      },
      body: JSON.stringify({ model: 'anthropic/claude-opus-4', messages, temperature: 0.2 }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return NextResponse.json({ error: `Upstream error: ${text}` }, { status: 502 });
    }
    const data = await resp.json();
    const content: string = data?.choices?.[0]?.message?.content ?? '';

    // Extract code from markdown fences if present
    const fenced = content.match(/```[a-zA-Z]*\n([\s\S]*?)```/);
    const code = (fenced ? fenced[1] : content).trim();
    if (!code.startsWith('(')) {
      // Heuristic: attempt to find the first '(' and slice
      const idx = code.indexOf('(');
      if (idx >= 0) {
        const tryCode = code.slice(idx);
        return NextResponse.json({ name, code: tryCode });
      }
    }

    return NextResponse.json({ name, code });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}


