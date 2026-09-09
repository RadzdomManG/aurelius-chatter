import { randomUUID } from "node:crypto";

import { fanvueRequest } from "@/server/fanvue/client";
import { normalizeScheduledAt, parseMediaUuids, parsePriceCents, validateMediaUuids, validatePricedMedia } from "@/server/fanvue/actions";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const body = await request.json().catch(() => null) as { text?: unknown; mediaUuids?: unknown; price?: unknown; scheduledAt?: unknown; smartListIds?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const mediaUuids = parseMediaUuids(body?.mediaUuids);
  const price = parsePriceCents(body?.price);
  const smartListIds = Array.isArray(body?.smartListIds) ? body.smartListIds.filter((item): item is string => typeof item === "string") : [];
  const scheduledAt = normalizeScheduledAt(body?.scheduledAt);
  const mediaError = validateMediaUuids(mediaUuids);
  const priceError = validatePricedMedia(price, mediaUuids, 200);
  if (!text && mediaUuids.length === 0) return Response.json({ error: "Mass message text or media is required." }, { status: 400 });
  if (smartListIds.length === 0) return Response.json({ error: "Choose at least one Fanvue fan recipient list." }, { status: 400 });
  if (mediaError || priceError) return Response.json({ error: mediaError ?? priceError }, { status: 400 });

  const connection = await healthyFanvueConnection(supabase, organizationId);
  if (!connection) return Response.json({ error: "Connect Fanvue before mass messaging." }, { status: 404 });
  const accessToken = await accessTokenForFanvue(supabase, connection);
  const result = await fanvueRequest<{ uuid: string; publishedAt: string | null; recipientCount: number }>("/v1/chats/mass-messages", accessToken, {
    method: "POST",
    headers: { "Idempotency-Key": randomUUID() },
    body: JSON.stringify({ text, mediaUuids, price, scheduledAt, includedLists: { smartListIds }, excludedLists: { smartListIds: ["creators"] } }),
  });
  return Response.json({ sent: true, ...result });
}
