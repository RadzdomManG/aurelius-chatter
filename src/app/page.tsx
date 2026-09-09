import Link from "next/link";
import { BarChart3, Bot, Inbox, Plus, Settings, Sparkles, Users } from "lucide-react";

import { ConversationSendForm, MassMessageForm, PostToFanvueForm, StopAiButton, SyncFanvueButton, UnsendMessageButton } from "@/app/inbox-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type MessageRow = { body: string | null; created_at: string; external_uuid: string | null; sender_type: "fan" | "creator" | "system" };
type ConversationRow = {
  id: string;
  status: string;
  unreadCount: number;
  fanName: string;
  fanHandle: string | null;
  latestMessage: string | null;
  latestCreatorMessageUuid: string | null;
  automationPaused: boolean;
  messages: MessageRow[];
};

type DashboardData = {
  configured: boolean;
  organizationName: string | null;
  modelCount: number;
  conversationCount: number;
  unreadCount: number;
  conversations: ConversationRow[];
};

async function getDashboardData(): Promise<DashboardData> {
  const empty: DashboardData = { configured: false, organizationName: null, modelCount: 0, conversationCount: 0, unreadCount: 0, conversations: [] };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return empty;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return { ...empty, configured: true };

    const { data: membership } = await supabase.from("organization_members").select("organization_id, organizations(name)").eq("user_id", userData.user.id).limit(1).maybeSingle();
    if (!membership?.organization_id) return { ...empty, configured: true };

    const { data: creatorConnections } = await supabase.from("fanvue_connections").select("external_user_uuid").eq("organization_id", membership.organization_id).eq("status", "healthy");
    const creatorUuids = new Set((creatorConnections ?? []).map((connection) => connection.external_user_uuid).filter(Boolean));

    const [models, conversationRows] = await Promise.all([
      supabase.from("creator_profiles").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id),
      supabase.from("conversations").select("id, status, unread_count, fans(display_name, handle, automation_paused, external_uuid), messages(body, created_at, external_uuid, sender_type)").eq("organization_id", membership.organization_id).order("last_message_at", { ascending: false }).limit(20),
    ]);

    const organization = membership.organizations as { name?: string } | { name?: string }[] | null;
    const organizationName = Array.isArray(organization) ? organization[0]?.name ?? null : organization?.name ?? null;
    const rows = (conversationRows.data ?? []).flatMap((conversation) => {
      const fan = Array.isArray(conversation.fans) ? conversation.fans[0] : conversation.fans;
      if (fan?.external_uuid && creatorUuids.has(fan.external_uuid)) return [];
      const messages = (Array.isArray(conversation.messages) ? conversation.messages : [])
        .filter((message): message is MessageRow => Boolean(message?.body))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
      const latestMessage = messages.at(-1)?.body ?? null;
      const latestCreatorMessageUuid = [...messages].reverse().find((message) => message.sender_type === "creator")?.external_uuid ?? null;
      return [{
        id: conversation.id,
        status: conversation.status,
        unreadCount: conversation.unread_count ?? 0,
        fanName: fan?.display_name ?? fan?.handle ?? "Fan",
        fanHandle: fan?.handle ?? null,
        latestMessage,
        latestCreatorMessageUuid,
        automationPaused: Boolean(fan?.automation_paused) || conversation.status !== "ai_active",
        messages,
      }];
    });

    return {
      configured: true,
      organizationName,
      modelCount: models.count ?? 0,
      conversationCount: rows.length,
      unreadCount: rows.reduce((total, conversation) => total + conversation.unreadCount, 0),
      conversations: rows,
    };
  } catch {
    return empty;
  }
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className="truth-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

export default async function Home() {
  const data = await getDashboardData();
  const selected = data.conversations[0] ?? null;
  const hasActivity = data.conversations.length > 0;

  return (
    <main className="truth-shell">
      <aside className="truth-sidebar">
        <Link className="truth-brand" href="/"><span className="truth-brand-mark">A</span><span>Aurelius <em>Chatter</em></span></Link>
        <p className="truth-nav-label">WORKSPACE</p>
        <p className="truth-workspace">{data.organizationName ?? "No workspace connected"}</p>
        <nav className="truth-nav" aria-label="Main navigation">
          <Link className="truth-nav-active" href="/"><Inbox size={17} /> Inbox</Link>
          <Link href="/models"><Users size={17} /> Models</Link>
          <Link href="/playground"><Sparkles size={17} /> Playground</Link>
          <Link href="/analytics"><BarChart3 size={17} /> Analytics</Link>
          <Link href="/settings"><Settings size={17} /> Settings</Link>
        </nav>
        <div className="truth-sidebar-footer"><span className="truth-status-dot" /><span>{data.configured ? "Connected to app" : "Setup required"}</span></div>
      </aside>

      <section className="truth-main">
        <header className="truth-topbar"><div><span>Workspace</span><b>/</b><strong>Inbox</strong></div><Link className="truth-icon-link" href="/settings" aria-label="Open settings"><Settings size={18} /></Link></header>
        <div className="truth-content">
          <div className="truth-heading">
            <div><p className="truth-eyebrow">CONVERSATION DESK</p><h1>Fan conversations, clearly managed.</h1><p>Only fan accounts appear here. Connected creator accounts are excluded from dashboard counts, sync display, and bot targeting.</p></div>
            <div className="inbox-top-actions"><SyncFanvueButton /><Link className="truth-primary" href="/models"><Plus size={16} /> Add model</Link></div>
          </div>

          <div className="truth-metrics">
            <Metric label="Models" value={String(data.modelCount)} detail={data.modelCount ? "Personas available" : "No models configured"} />
            <Metric label="Fan conversations" value={String(data.conversationCount)} detail={hasActivity ? "Creators excluded" : "No fan data yet"} />
            <Metric label="Unread" value={String(data.unreadCount)} detail={data.unreadCount ? "Needs attention" : "No unread conversations"} />
            <Metric label="AI model" value="4.1 Fast" detail="Low-credit Grok mode" />
          </div>

          {hasActivity && selected ? <section className="chat-desk">
            <aside className="chat-list">
              <div className="chat-search">Search username...</div>
              {data.conversations.map((conversation, index) => <article className={`chat-list-row ${index === 0 ? "selected" : ""}`} key={conversation.id}>
                <strong>{conversation.fanName}</strong>
                <span>{conversation.fanHandle ? `@${conversation.fanHandle}` : "Fanvue fan"}</span>
                <p>{conversation.latestMessage ?? "No message body imported yet."}</p>
                <small>{conversation.unreadCount} unread</small>
              </article>)}
            </aside>
            <section className="chat-thread">
              <header><div><strong>{selected.fanName}</strong><span>{selected.fanHandle ? `@${selected.fanHandle}` : "Fanvue fan"} · {selected.status}</span></div><StopAiButton conversationId={selected.id} disabled={selected.automationPaused} /></header>
              <div className="chat-bubbles">
                {selected.messages.length ? selected.messages.map((message) => <div className={`chat-bubble ${message.sender_type === "fan" ? "fan" : "bot"}`} key={message.external_uuid ?? `${message.created_at}-${message.body}`}>
                  <small>{message.sender_type === "fan" ? "fan" : "bot"} · {new Date(message.created_at).toLocaleString()}</small>
                  <p>{message.body}</p>
                  {message.sender_type === "creator" && message.external_uuid && <UnsendMessageButton conversationId={selected.id} messageUuid={message.external_uuid} />}
                </div>) : <div className="chat-empty"><Bot size={22} /><p>No imported messages yet. Sync Fanvue to load the latest fan conversation.</p></div>}
              </div>
              <ConversationSendForm conversationId={selected.id} />
            </section>
          </section> : <section className="truth-empty-panel">
            <div className="truth-empty-icon"><Bot size={25} /></div>
            <p className="truth-eyebrow">INBOX</p>
            <h2>No fan conversations yet.</h2>
            <p>Sync Fanvue to import fan chats. Creator accounts are filtered out and will not be targeted by the bot.</p>
            <div className="truth-empty-actions"><SyncFanvueButton /><Link className="truth-secondary" href="/playground">Test safely in Playground</Link></div>
          </section>}

          <section className="operator-grid">
            <MassMessageForm />
            <PostToFanvueForm />
          </section>

          <p className="truth-disclaimer">Persona connection stays model-based: connect Fanvue from a model card so that the saved persona for that model is the one used for testing and automation context. Playground remains simulation-only.</p>
        </div>
      </section>
    </main>
  );
}
