import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  if (error) return Response.json({ error: "Fanvue authorization was declined.", code: error }, { status: 400 });
  if (!code || !state) return Response.json({ error: "Missing OAuth callback parameters." }, { status: 400 });
  const cookieStore = await cookies();
  const storedValue = cookieStore.get("aurelius_fanvue_oauth")?.value;
  if (!storedValue) return Response.json({ error: "OAuth session expired. Please reconnect Fanvue." }, { status: 400 });
  let stored: { state: string; verifier: string };
  try { stored = JSON.parse(storedValue) as { state: string; verifier: string }; } catch { return Response.json({ error: "Invalid OAuth session." }, { status: 400 }); }
  cookieStore.delete("aurelius_fanvue_oauth");
  if (stored.state !== state) return Response.json({ error: "Invalid OAuth state." }, { status: 400 });
  const env = serverEnv();
  const basic = Buffer.from(`${env.fanvueClientId}:${env.fanvueClientSecret ?? ""}`).toString("base64");
  const tokenResponse = await fetch("https://auth.fanvue.com/oauth2/token", { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: env.fanvueRedirectUri, code_verifier: stored.verifier }) });
  if (!tokenResponse.ok) return Response.json({ error: "Fanvue token exchange failed." }, { status: 502 });
  const tokenPayload = await tokenResponse.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string };
  if (!tokenPayload.access_token || !tokenPayload.refresh_token) return Response.json({ error: "Fanvue did not return the required tokens." }, { status: 502 });
  return Response.json({ connected: true, expiresIn: tokenPayload.expires_in, scope: tokenPayload.scope, note: "Persist these tokens through the server-only connection service." });
}