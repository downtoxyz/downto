import { NextRequest, NextResponse } from "next/server";

// Capacitor's WebView serves the static export from a non-http origin
// (capacitor://localhost on iOS, https://localhost on Android), so any
// fetch('/api/...') from the native app is cross-origin against the Vercel
// deploy. Handle the preflight + tag responses so those calls aren't blocked
// by the browser. Web origin (downto.xyz, vercel previews) is same-origin
// and gets a no-op pass-through.

const ALLOWED_ORIGINS = new Set([
  "capacitor://localhost",
  "https://localhost",
  "http://localhost",
]);

function corsHeadersFor(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export function middleware(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeadersFor(origin);

  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers });
  }

  const res = NextResponse.next();
  for (const [k, v] of Object.entries(headers)) res.headers.set(k, v);
  return res;
}

export const config = {
  matcher: "/api/:path*",
};
