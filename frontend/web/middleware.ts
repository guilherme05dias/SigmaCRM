import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "servicocrm_session";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublicPath =
    pathname === "/login" ||
    pathname === "/logout" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon");

  if (isPublicPath) {
    return NextResponse.next();
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|.*\\..*).*)"]
};

