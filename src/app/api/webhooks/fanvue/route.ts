import { verifyFanvueSignature } from "@/server/fanvue/signatures";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function sanitizedEvent(raw: unknown): { id: string | null; type: string | null; creatorUuid: string | null; safePayload: Record<string, unknown> } {
  if (!raw || typeof raw !== "object") return { id: null, type: null, creatorUuid: null, safePayload: {} };
  const event = raw as Record<string, unknown>;
  const data = event.data && typeof event.data === "object" ? event.data as Record<string, unknown> : {};
  const creator = data.creator && typeof data.creator === "object" ? data.creator as Record<string, unknown> : {};
  return {
    id: typeof event.id === "string" ? event.id : null,
    type: typeof event.type === "string" ? event.type : null,
    creatorUuid: typeof creator.uuid === "string" ? creator.uuid : null,
    safePayload: { object: typeof data.object === "string" ? data.object : null, creatorUuid: typeof creator.uuid === "string" ? creator.uuid : null },
  };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.FANVUE_WEBHOOK_SECRET;
  if (!secret || !verifyFanvueSignature(rawBody, request.headers.get("x-fanvue-signature"), secret)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  let event: unknown;
  try { event = JSON.parse(rawBody); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const safe = sanitizedEvent(event);
  if (!safe.id || !safe.type) return Response.json({ error: "Missing event identity" }, { status: 400 });
  try {
    const supabase = createSupabaseAdminClient();
    let organizationId: string | null = null;
    let creatorProfileId: string | null = null;
    if (safe.creatorUuid) {
      const { data: connection } = await supabase.from("fanvue_connections").select("organization_id, creator_profile_id").eq("external_user_uuid", safe.creatorUuid).eq("status", "healthy").maybeSingle();
      organizationId = connection?.organization_id ?? null;
      creatorProfileId = connection?.creator_profile_id ?? null;
    }
    const { error: insertError } = await supabase.from("webhook_events").upsert({ organization_id: organizationId, creator_profile_id: creatorProfileId, external_event_id: safe.id, event_type: safe.type, sanitized_payload: safe.safePayload }, { onConflict: "external_event_id,event_type", ignoreDuplicates: true });
    if (insertError) return Response.json({ error: "Webhook event could not be persisted." }, { status: 503 });
    return Response.json({ accepted: true, eventId: safe.id, eventType: safe.type }, { status: 202 });
  } catch {
    return Response.json({ error: "Webhook processing is not configured." }, { status: 503 });
  }
}