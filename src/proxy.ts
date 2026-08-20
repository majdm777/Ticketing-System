import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { readSessionFromRequestCookies } from '@/lib/admin-session';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === '/admin/login') {
    if (readSessionFromRequestCookies(request.cookies)) {
      return NextResponse.redirect(new URL('/admin', request.url));
    }

    return NextResponse.next();
  }

  if (!readSessionFromRequestCookies(request.cookies)) {
    const loginUrl = new URL('/admin/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/admin/:path*',
};
