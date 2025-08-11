import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyAuthToken } from '@/lib/auth';

const COOKIE_NAME = 'cte_auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow these paths without even touching auth
  const alwaysAllow =
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/vercel.svg') ||
    pathname.startsWith('/next.svg') ||
    pathname.startsWith('/file.svg') ||
    pathname.startsWith('/window.svg') ||
    pathname.startsWith('/globe.svg') ||
    pathname.startsWith('/data/');

  if (alwaysAllow) return NextResponse.next();

  const token = req.cookies.get(COOKIE_NAME)?.value;
  let hasAuth = false;
  try {
    hasAuth = await verifyAuthToken(token);
  } catch {
    // Treat as unauthenticated if verification throws (e.g., missing env)
    hasAuth = false;
  }

  // If on /auth, redirect to home when already authed; otherwise allow page load
  if (pathname === '/auth') {
    if (hasAuth) {
      const url = req.nextUrl.clone();
      url.pathname = '/';
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (!hasAuth) {
    const url = req.nextUrl.clone();
    url.pathname = '/auth';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};


