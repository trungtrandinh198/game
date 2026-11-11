import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["vi", "en"];
const DEFAULT = "vi";

/** Đường dẫn không có tiền tố ngôn ngữ thì chuyển tới `/vi/...` hoặc ngôn ngữ ưu tiên trong cookie/Accept-Language. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (LOCALES.includes(first)) return NextResponse.next();

  const cookie = request.cookies.get("dnw_locale")?.value;
  const accept = request.headers.get("accept-language")?.toLowerCase() ?? "";
  const locale =
    cookie && LOCALES.includes(cookie) ? cookie : accept.startsWith("en") ? "en" : DEFAULT;
  return NextResponse.redirect(
    new URL(`/${locale}${pathname === "/" ? "" : pathname}${search}`, request.url),
  );
}

export const config = {
  // Bỏ qua API, tài nguyên Next và trang dev
  matcher: ["/((?!api|_next|dev|favicon.ico|.*\\..*).*)"],
};
