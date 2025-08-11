import { NextResponse } from 'next/server';
import { signAuthToken } from '@/lib/auth';

const COOKIE_NAME = 'cte_auth';

export async function POST(req: Request) {
  const { password, next } = (await req.json().catch(() => ({}))) as {
    password?: string;
    next?: string;
  };

  const expected = process.env.BASIC_PASSWORD;
  if (!expected) {
    return NextResponse.json(
      { error: 'BASIC_PASSWORD not configured on server' },
      { status: 500 }
    );
  }

  if (!password || password !== expected) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 });
  }

  const token = await signAuthToken();
  const res = NextResponse.json({ ok: true, next: next || '/' });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });
  return res;
}


