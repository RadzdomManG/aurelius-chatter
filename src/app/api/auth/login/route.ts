import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { email?: string; password?: string };
  try {
    body = await request.json() as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid sign-in request." }, { status: 400 });
  }

  const email = body.email?.trim();
  const password = body.password;
  if (!email || !password) return NextResponse.json({ error: "Email and password are required." }, { status: 400 });

  const response = NextResponse.json({ signedIn: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase authentication is not configured." }, { status: 503 });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.headers.get("cookie")?.split("; ").filter(Boolean).map((cookie) => {
        const separator = cookie.indexOf("=");
        return { name: separator >= 0 ? cookie.slice(0, separator) : cookie, value: separator >= 0 ? decodeURIComponent(cookie.slice(separator + 1)) : "" };
      }) ?? [],
      setAll: (cookies) => cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: error.message }, { status: 401 });
  return response;
}
