import { fanvueRequest } from "@/server/fanvue/client";
import { normalizeScheduledAt, parseMediaUuids, parsePriceCents, validateMediaUuids, validatePricedMedia } from "@/server/fanvue/actions";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";
import { recordBotActionSafely } from "@/server/operator/logging";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const body = await request.json().catch(() => null) as { text?: unknown; mediaUuids?: unknown; price?: unknown; publishAt?: unknown; audience?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const mediaUuids = parseMediaUuids(body?.mediaUuids);
  const price = parsePriceCents(body?.price);
  const publishAt = normalizeScheduledAt(body?.publishAt);
  const audience = body?.audience === "followers-and-subscribers" ? "followers-and-subscribers" : "subscribers";
  const mediaError = validateMediaUuids(mediaUuids);
  const priceError = validatePricedMedia(price, mediaUuids, 300);
  if (!text && mediaUuids.length === 0) return Response.json({ error: "Post text or media is required." }, { status: 400 });
  if (mediaError || priceError) return Response.json({ error: mediaError ?? priceError }, { status: 400 });

  const connection = await healthyFanvueConnection(supabase, organizationId);
  if (!connection) return Response.json({ error: "Connect Fanvue before posting." }, { status: 404 });
  const accessToken = await accessTokenForFanvue(supabase, connection);
  const result = await fanvueRequest<{ uuid: string; publishAt?: string | null; publishedAt?: string | null }>("/v1/posts", accessToken, {
    method: "POST",
    body: JSON.stringify({ text, mediaUuids, price, audience, publishAt }),
  });
  if (publishAt) {
    try {
      await supabase.from("scheduled_operator_actions").insert({
        organization_id: organizationId,
        creator_profile_id: connection.creator_profile_id,
        action_type: "scheduled_post",
        status: "scheduled",
        scheduled_at: publishAt,
        external_uuid: result.uuid,
        payload: { audience, mediaCount: mediaUuids.length, priceCents: price },
      }).throwOnError();
    } catch {}
  }
  await recordBotActionSafely(supabase, {
    organizationId,
    creatorProfileId: connection.creator_profile_id,
    actionType: publishAt ? "post_schedule" : "post_create",
    status: publishAt ? "queued" : "completed",
    externalUuid: result.uuid,
    metadata: { audience, mediaCount: mediaUuids.length, priceCents: price },
  });
  return Response.json({ posted: true, ...result });
}
