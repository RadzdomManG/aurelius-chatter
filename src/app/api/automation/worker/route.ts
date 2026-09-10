import { processAutomationQueue } from "@/server/automation/worker";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secrets = [process.env.AUTOMATION_WORKER_SECRET, process.env.CRON_SECRET].filter(Boolean);
  if (!secrets.length) return false;
  const authHeader = request.headers.get("authorization");
  return secrets.some((secret) => authHeader === `Bearer ${secret}`);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const body = await request.json().catch(() => null) as { limit?: unknown } | null;
  const limit = Math.min(10, Math.max(1, Number(body?.limit ?? 3) || 3));
  const result = await processAutomationQueue(limit);
  return Response.json({ ok: true, ...result });
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  const result = await processAutomationQueue(5);
  return Response.json({ ok: true, ...result });
}
