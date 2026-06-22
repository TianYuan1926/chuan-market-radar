import { NextResponse, type NextRequest } from "next/server";
import {
  privateSessionConfig,
  verifyPrivateSessionToken,
} from "@/lib/auth/private-session";

const publicFilePattern = /\.(?:ico|png|jpg|jpeg|gif|webp|svg|css|js|map|txt|xml)$/i;

function isPublicPath(pathname: string) {
  return pathname === "/login" ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/api/auth/session") ||
    publicFilePattern.test(pathname);
}

function shouldProtect(pathname: string) {
  if (isPublicPath(pathname)) {
    return false;
  }

  if (!pathname.startsWith("/api/")) {
    return true;
  }

  return pathname.startsWith("/api/frontend/") ||
    pathname.startsWith("/api/radar") ||
    pathname.startsWith("/api/archive") ||
    pathname.startsWith("/api/journal") ||
    pathname.startsWith("/api/daily-movers");
}

function unauthorizedApiResponse() {
  return NextResponse.json(
    { ok: false, error: "private_session_required" },
    {
      status: 401,
      headers: {
        "cache-control": "no-store",
        "x-chuan-private-mode": "enabled",
      },
    },
  );
}

export async function middleware(request: NextRequest) {
  const config = privateSessionConfig(process.env);
  const { pathname } = request.nextUrl;

  if (!config.enabled || !shouldProtect(pathname)) {
    return NextResponse.next();
  }

  if (!config.configured) {
    return pathname.startsWith("/api/")
      ? unauthorizedApiResponse()
      : NextResponse.redirect(new URL("/login?reason=private-mode-misconfigured", request.url));
  }

  const session = await verifyPrivateSessionToken(
    request.cookies.get(config.cookieName)?.value,
    process.env,
  );

  if (session) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/")) {
    return unauthorizedApiResponse();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", pathname);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
