import { verifyFanvueSignature } from "@/server/fanvue/signatures";

export const runtime = "nodejs";

function sanitizedEvent(raw: unknown): { id: string | null; type: string | null } {
  if (!raw || typeof raw !== "object") return { id: null, type: null };
  const event = raw as Record<string, unknown>;
  return { id: typeof event.id === "string" ? event.id : typeof event.eventId === "string" ? event.eventId : null, type: typeof event.type === "string" ? event.type : null };
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.FANVUE_WEBHOOK_SECRET;
  if (!secret || !verifyFanvueSignature(rawBody, request.headers.get("x-fanvue-signature"), secret)) return Response.json({ error: "Invalid signature" }, { status: 401 });
  let event: unknown;
  try { event = JSON.parse(rawBody); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
  const safe = sanitizedEvent(event);
  if (!safe.id || !safe.type) return Response.json({ error: "Missing event identity" }, { status: 400 });
  return Response.json({ accepted: true, eventId: safe.id, eventType: safe.type }, { status: 202 });
}