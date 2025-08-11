import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';

const COOKIE_NAME = 'cte_auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow these paths
  const allow =
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/vercel.svg') ||
    pathname.startsWith('/next.svg') ||
    pathname.startsWith('/file.svg') ||
    pathname.startsWith('/window.svg') ||
    pathname.startsWith('/globe.svg') ||
    pathname.startsWith('/data/');

  const token = req.cookies.get(COOKIE_NAME)?.value;
  const hasAuth = await verifyAuthToken(token);

  // If already authed and on /auth, redirect to home
  if (hasAuth && pathname === '/auth') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  if (allow) return NextResponse.next();

  if (!hasAuth) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};


