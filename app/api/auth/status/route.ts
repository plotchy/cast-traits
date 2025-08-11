import { NextResponse } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';

const COOKIE_NAME = 'cte_auth';

export async function GET(req: Request) {
  const cookieHeader = req.headers.get('cookie') || '';
  const token = cookieHeader
    .split(/;\s*/)
    .map((p) => p.split('='))
    .find(([k]) => k === COOKIE_NAME)?.[1];

  let hasAuth = false;
  try {
    hasAuth = await verifyAuthToken(token);
  } catch {
    hasAuth = false;
  }

  return NextResponse.json({
    ok: true,
    cookiePresent: Boolean(token),
    hasAuth,
    env: {
      AUTH_SECRET: Boolean(process.env.AUTH_SECRET),
      BASIC_PASSWORD: Boolean(process.env.BASIC_PASSWORD),
    },
  });
}


