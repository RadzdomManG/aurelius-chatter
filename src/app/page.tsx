import Link from "next/link";
import { BarChart3, Bot, Inbox, Plus, Settings, Sparkles, Users } from "lucide-react";

import { StopAiButton, SyncFanvueButton } from "@/app/inbox-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type ConversationRow = {
  id: string;
  status: string;
  unreadCount: number;
  fanName: string;
  latestMessage: string | null;
  automationPaused: boolean;
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

    const [models, conversations, conversationRows] = await Promise.all([
      supabase.from("creator_profiles").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id),
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", membership.organization_id),
      supabase.from("conversations").select("id, status, unread_count, fans(display_name, handle, automation_paused), messages(body, created_at)").eq("organization_id", membership.organization_id).order("last_message_at", { ascending: false }).limit(8),
    ]);

    const organization = membership.organizations as { name?: string } | { name?: string }[] | null;
    const organizationName = Array.isArray(organization) ? organization[0]?.name ?? null : organization?.name ?? null;
    const rows = (conversationRows.data ?? []).map((conversation) => {
      const fan = Array.isArray(conversation.fans) ? conversation.fans[0] : conversation.fans;
      const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
      const latestMessage = messages.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0]?.body ?? null;
      return {
        id: conversation.id,
        status: conversation.status,
        unreadCount: conversation.unread_count ?? 0,
        fanName: fan?.display_name ?? fan?.handle ?? "Fan",
        latestMessage,
        automationPaused: Boolean(fan?.automation_paused) || conversation.status !== "ai_active",
      };
    });

    return {
      configured: true,
      organizationName,
      modelCount: models.count ?? 0,
      conversationCount: conversations.count ?? 0,
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
  const hasActivity = data.conversationCount > 0;

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
            <div><p className="truth-eyebrow">CONVERSATION DESK</p><h1>Real conversations, clearly managed.</h1><p>Monitor Fanvue activity, review AI drafts, and keep every automation decision auditable.</p></div>
            <div className="inbox-top-actions"><SyncFanvueButton /><Link className="truth-primary" href="/models"><Plus size={16} /> Add model</Link></div>
          </div>

          <div className="truth-metrics">
            <Metric label="Models" value={String(data.modelCount)} detail={data.modelCount ? "From your workspace" : "No models configured"} />
            <Metric label="Conversations" value={String(data.conversationCount)} detail={hasActivity ? "Received from Fanvue" : "No data yet"} />
            <Metric label="Unread" value={String(data.unreadCount)} detail={data.unreadCount ? "Needs attention" : "No unread conversations"} />
            <Metric label="Automation" value="Draft" detail="Paused per fan when needed" />
          </div>

          {hasActivity ? <section className="inbox-list">
            {data.conversations.map((conversation) => <article className="inbox-row" key={conversation.id}>
              <div><strong>{conversation.fanName}</strong><p>{conversation.latestMessage ?? "No message body imported yet."}</p></div>
              <div><span>{conversation.unreadCount} unread</span><StopAiButton conversationId={conversation.id} disabled={conversation.automationPaused} /></div>
            </article>)}
          </section> : <section className="truth-empty-panel">
            <div className="truth-empty-icon"><Bot size={25} /></div>
            <p className="truth-eyebrow">INBOX</p>
            <h2>No conversations yet.</h2>
            <p>Sync Fanvue to import unread chats. Your inbox will only show activity received from the API.</p>
            <div className="truth-empty-actions"><SyncFanvueButton /><Link className="truth-secondary" href="/playground">Test safely in Playground</Link></div>
          </section>}

          <section className="inbox-capabilities">
            <p className="truth-eyebrow">FANVUE ACTIONS</p>
            <h2>Available after review controls</h2>
            <div><span>Message fans</span><span>Unsend</span><span>Post</span><span>Schedule</span><span>Mass message</span><span>Send PPV</span></div>
          </section>

          <p className="truth-disclaimer">Production analytics use confirmed application data only. Test activity stays isolated in Playground. Real Fanvue send actions require explicit review controls before activation.</p>
        </div>
      </section>
    </main>
  );
}
