import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isProduction = process.env.NODE_ENV === "production";
const SESSION_COOKIE = isProduction
  ? "__Secure-authjs.session-token"
  : "authjs.session-token";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- Auth guard for dashboard routes (lightweight cookie check) ---
  if (pathname.startsWith("/dashboard")) {
    const token = request.cookies.get(SESSION_COOKIE)?.value;
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const response = NextResponse.next();

  // --- Security headers ---
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://upload-widget.cloudinary.com https://widget.cloudinary.com",
    "style-src 'self' 'unsafe-inline' https://unpkg.com https://fonts.googleapis.com https://upload-widget.cloudinary.com",
    "img-src 'self' data: blob: https://res.cloudinary.com https://*.tile.openstreetmap.org https://*.google.com https://server.arcgisonline.com https://upload-widget.cloudinary.com",
    "font-src 'self' https://fonts.gstatic.com https://upload-widget.cloudinary.com",
    "connect-src 'self' https://accounts.google.com https://api.cloudinary.com https://res.cloudinary.com https://nominatim.openstreetmap.org https://upload-widget.cloudinary.com",
    "frame-src https://accounts.google.com https://upload-widget.cloudinary.com https://widget.cloudinary.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
    "frame-ancestors 'none'",
  ].join("; ");

  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=()");
  response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/).*)",
  ],
};
