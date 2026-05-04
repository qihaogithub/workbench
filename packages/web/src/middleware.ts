import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';

const PROTECTED_ROUTES = ['/demo', '/projects', '/api/sessions'];
const AUTH_ROUTES = ['/login', '/register'];
const VIEWER_ORIGINS = [
  'http://localhost:3300',
  'http://127.0.0.1:3300',
];

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth_token')?.value;
  const user = token ? await verifyToken(token) : null;
  const pathname = request.nextUrl.pathname;

  if (user && AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (!user && PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const response = NextResponse.next();

  const origin = request.headers.get('origin');
  const isApiOrEmbedRoute =
    pathname.startsWith('/api/') || pathname.startsWith('/embed/');
  if (origin && isApiOrEmbedRoute && VIEWER_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
