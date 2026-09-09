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

export type FanvueChat = {
  isRead?: boolean;
  unreadMessagesCount?: number;
  user?: { uuid?: string; handle?: string; displayName?: string };
  lastMessage?: { text?: string | null; senderUuid?: string; createdAt?: string };
};

export type FanvueMessage = {
  uuid?: string;
  text?: string | null;
  body?: string | null;
  createdAt?: string;
  created_at?: string;
  senderUuid?: string;
  sender?: { uuid?: string };
};

export type FanvuePaged<T> = { data?: T[]; pagination?: { hasMore?: boolean } };

export function fanvueMessageBody(message: FanvueMessage): string {
  return (message.text ?? message.body ?? "").trim();
}

export function fanvueMessageCreatedAt(message: FanvueMessage): string {
  return message.createdAt ?? message.created_at ?? new Date().toISOString();
}

export function fanvueSenderType(message: FanvueMessage, creatorUuid: string): "fan" | "creator" {
  const senderUuid = message.sender?.uuid ?? message.senderUuid;
  return senderUuid === creatorUuid ? "creator" : "fan";
}
