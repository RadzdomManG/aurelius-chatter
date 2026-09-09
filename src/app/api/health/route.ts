export const runtime = "nodejs";

export function GET() {
  return Response.json({ ok: true, service: "aurelius-chatter", timestamp: new Date().toISOString() });
}