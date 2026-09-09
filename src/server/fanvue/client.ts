import { serverEnv } from "@/lib/env";

export class FanvueApiError extends Error {
  constructor(public status: number, public endpoint: string, message: string, public retryAfter?: string) { super(message); }
}

export async function fanvueRequest<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const env = serverEnv();
  const response = await fetch(`${env.fanvueApiBaseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, "X-Fanvue-API-Version": env.fanvueApiVersion, "Content-Type": "application/json", ...init.headers } });
  if (!response.ok) throw new FanvueApiError(response.status, path, `Fanvue request failed with ${response.status}`, response.headers.get("retry-after") ?? undefined);
  return response.json() as Promise<T>;
}

export function fanvueAuthorizationUrl(state: string, challenge: string, scopes: string[]) {
  const url = new URL("https://auth.fanvue.com/oauth2/auth");
  const env = serverEnv();
  url.searchParams.set("client_id", env.fanvueClientId);
  url.searchParams.set("redirect_uri", env.fanvueRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}