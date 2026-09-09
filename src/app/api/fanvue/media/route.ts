import { fanvueRequest } from "@/server/fanvue/client";
import { accessTokenForFanvue, healthyFanvueConnection, workspaceSession } from "@/server/fanvue/session";

export const runtime = "nodejs";

type FanvueMediaItem = {
  uuid?: string;
  name?: string;
  filename?: string;
  type?: string;
  mediaType?: string;
  status?: string;
  variants?: Array<{ url?: string; variantType?: string; width?: number; height?: number }>;
};

type FanvueMediaResponse = { data?: FanvueMediaItem[]; pagination?: unknown };

export async function GET(request: Request) {
  const { supabase, userId, organizationId } = await workspaceSession();
  if (!userId) return Response.json({ error: "Sign in required." }, { status: 401 });
  if (!organizationId) return Response.json({ error: "No workspace membership found." }, { status: 403 });

  const url = new URL(request.url);
  const folderName = url.searchParams.get("folderName")?.trim();
  const page = url.searchParams.get("page") ?? "1";
  const size = url.searchParams.get("size") ?? "24";
  const connection = await healthyFanvueConnection(supabase, organizationId);
  if (!connection) return Response.json({ error: "Connect Fanvue before browsing media." }, { status: 404 });

  const accessToken = await accessTokenForFanvue(supabase, connection);
  const params = new URLSearchParams({ variants: "thumbnail,main", status: "ready", page, size });
  if (folderName) params.set("folderName", folderName);
  const payload = await fanvueRequest<FanvueMediaResponse>(`/media?${params.toString()}`, accessToken);
  const items = (payload.data ?? []).map((item) => ({
    uuid: item.uuid,
    name: item.name ?? item.filename ?? item.uuid ?? "Untitled media",
    mediaType: item.mediaType ?? item.type ?? "media",
    status: item.status ?? "ready",
    thumbnailUrl: item.variants?.find((variant) => variant.variantType === "thumbnail")?.url ?? item.variants?.[0]?.url ?? null,
  })).filter((item) => item.uuid);

  await Promise.all(items.map(async (item) => {
    try {
      await supabase.from("fanvue_media_cache").upsert({
        organization_id: organizationId,
        creator_profile_id: connection.creator_profile_id,
        external_uuid: item.uuid,
        name: item.name,
        media_type: item.mediaType,
        metadata: { status: item.status },
      }, { onConflict: "organization_id,creator_profile_id,external_uuid" }).throwOnError();
    } catch {}
  }));

  return Response.json({ items, pagination: payload.pagination ?? null });
}
