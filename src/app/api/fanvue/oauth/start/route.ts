import { cookies } from "next/headers";
import { createOAuthState, createPkcePair } from "@/server/fanvue/pkce";
import { fanvueAuthorizationUrl } from "@/server/fanvue/client";

export const runtime = "nodejs";
const defaultScopes = ["openid", "offline_access", "offline", "read:self", "read:chat", "write:chat"];

export async function GET() {
  const state = createOAuthState();
  const { verifier, challenge } = createPkcePair();
  const cookieStore = await cookies();
  cookieStore.set("aurelius_fanvue_oauth", JSON.stringify({ state, verifier }), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/fanvue/oauth", maxAge: 600 });
  return Response.redirect(fanvueAuthorizationUrl(state, challenge, process.env.FANVUE_SCOPES?.split(" ").filter(Boolean) ?? defaultScopes));
}