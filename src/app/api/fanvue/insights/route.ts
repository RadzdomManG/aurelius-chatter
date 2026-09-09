import { fanvueRequest } from "@/server/fanvue/client";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

export async function GET() {
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });
  const connection = await healthyFanvueConnection(supabase, organizationId);
  if (!connection) return Response.json({ error: "Connect Fanvue before loading insights." }, { status: 404 });
  const accessToken = await accessTokenForFanvue(supabase, connection);
  const startDate = new Date(Date.now() - 30 * 86400000).toISOString();
  const endDate = new Date().toISOString();
  const [unread, topFans, earnings] = await Promise.allSettled([
    fanvueRequest<unknown>("/v1/chats/unread", accessToken),
    fanvueRequest<unknown>("/v1/insights/fans/top-spenders", accessToken),
    fanvueRequest<unknown>(`/v1/insights/earnings?${new URLSearchParams({ startDate, endDate, source: "message,post,tip" }).toString()}`, accessToken),
  ]);
  return Response.json({
    unread: unread.status === "fulfilled" ? unread.value : null,
    topFans: topFans.status === "fulfilled" ? topFans.value : null,
    earnings: earnings.status === "fulfilled" ? earnings.value : null,
    note: "Earnings are Fanvue-confirmed rows only. Bot attribution requires matching Fanvue message/post UUIDs against local bot action logs.",
  });
}
