"use client";

import { Bot, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ConversationSendForm, StopAiButton, UnsendMessageButton } from "@/app/inbox-actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export type ChatDeskMessage = { body: string | null; created_at: string; external_uuid: string | null; sender_type: "fan" | "creator" | "system" };
export type ChatDeskConversation = {
  id: string;
  status: string;
  unreadCount: number;
  fanName: string;
  fanHandle: string | null;
  latestMessage: string | null;
  automationPaused: boolean;
  messages: ChatDeskMessage[];
};

type RealtimeMessageRow = ChatDeskMessage & { conversation_id: string; organization_id: string };
type RealtimeConversationRow = { id: string; status: string; unread_count: number | null; organization_id: string };

function sortConversations(items: ChatDeskConversation[]) {
  return [...items].sort((a, b) => (b.messages.at(-1)?.created_at ?? "").localeCompare(a.messages.at(-1)?.created_at ?? ""));
}

export function ChatDesk({ conversations, organizationId }: { conversations: ChatDeskConversation[]; organizationId: string }) {
  const router = useRouter();
  const [liveConversations, setLiveConversations] = useState(conversations);
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const [realtimeState, setRealtimeState] = useState<"connecting" | "live" | "reconnecting" | "offline">("connecting");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "paused">("all");
  const [draft, setDraft] = useState("");
  const [draftInfo, setDraftInfo] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const filteredConversations = useMemo(() => liveConversations.filter((conversation) => {
    const matchesQuery = `${conversation.fanName} ${conversation.fanHandle ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "unread" && conversation.unreadCount > 0) || (filter === "paused" && conversation.automationPaused);
    return matchesQuery && matchesFilter;
  }), [liveConversations, filter, query]);
  const selected = filteredConversations.find((conversation) => conversation.id === selectedId) ?? filteredConversations[0] ?? null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [selected?.id, selected?.messages.length]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`inbox:${organizationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `organization_id=eq.${organizationId}` }, (payload) => {
        const row = payload.new as RealtimeMessageRow;
        setLiveConversations((current) => sortConversations(current.map((conversation) => {
          if (conversation.id !== row.conversation_id) return conversation;
          const exists = conversation.messages.some((message) => message.external_uuid && message.external_uuid === row.external_uuid);
          const messages = exists ? conversation.messages : [...conversation.messages, { body: row.body, created_at: row.created_at, external_uuid: row.external_uuid, sender_type: row.sender_type }].sort((a, b) => a.created_at.localeCompare(b.created_at));
          return { ...conversation, latestMessage: row.body ?? conversation.latestMessage, messages };
        })));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` }, (payload) => {
        const row = payload.new as RealtimeConversationRow;
        setLiveConversations((current) => current.map((conversation) => conversation.id === row.id ? {
          ...conversation,
          status: row.status,
          unreadCount: row.unread_count ?? conversation.unreadCount,
          automationPaused: row.status !== "ai_active" || conversation.automationPaused,
        } : conversation));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "automation_jobs", filter: `organization_id=eq.${organizationId}` }, () => {
        router.refresh();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations", filter: `organization_id=eq.${organizationId}` }, () => {
        router.refresh();
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeState("live");
        if (status === "CHANNEL_ERROR") setRealtimeState("offline");
        if (status === "TIMED_OUT") setRealtimeState("reconnecting");
        if (status === "CLOSED") setRealtimeState("offline");
      });

    const reconciliation = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60000);

    return () => {
      window.clearInterval(reconciliation);
      supabase.removeChannel(channel);
    };
  }, [organizationId, router]);

  if (!selected) return null;

  async function generateDraft() {
    setDraftBusy(true);
    setDraftInfo("");
    setDraft("");
    try {
      const response = await fetch(`/api/conversations/${selected.id}/draft`, { method: "POST" });
      const payload = await response.json() as { decision?: { replyText: string | null }; diagnostics?: { estimatedInputTokens: number; maxOutputTokens: number; recentFanMessagesUsed: number; creatorMessagesExcluded: boolean }; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "AI draft could not be generated.");
      setDraft(payload.decision?.replyText ?? "");
      setDraftInfo(`Grok used ${payload.diagnostics?.recentFanMessagesUsed ?? 0} fan messages, ~${payload.diagnostics?.estimatedInputTokens ?? 0} input tokens, max ${payload.diagnostics?.maxOutputTokens ?? 0} output tokens. Creator messages excluded.`);
    } catch (error) {
      setDraftInfo(error instanceof Error ? error.message : "AI draft could not be generated.");
    } finally {
      setDraftBusy(false);
    }
  }

  async function approveDraft() {
    if (!draft.trim()) return;
    setSendBusy(true);
    try {
      const response = await fetch(`/api/conversations/${selected.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: draft }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Draft could not be sent.");
      setDraft("");
      setDraftInfo("Approved draft sent to Fanvue.");
      window.location.reload();
    } catch (error) {
      setDraftInfo(error instanceof Error ? error.message : "Draft could not be sent.");
    } finally {
      setSendBusy(false);
    }
  }

  return <section className="chat-desk">
    <aside className="chat-list">
      <input className="chat-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username..." />
      <div className="chat-filters"><button type="button" className={filter === "all" ? "selected" : ""} onClick={() => setFilter("all")}>All</button><button type="button" className={filter === "unread" ? "selected" : ""} onClick={() => setFilter("unread")}>Unread</button><button type="button" className={filter === "paused" ? "selected" : ""} onClick={() => setFilter("paused")}>Paused</button></div>
      {filteredConversations.map((conversation) => <button className={`chat-list-row ${conversation.id === selected.id ? "selected" : ""}`} type="button" onClick={() => { setSelectedId(conversation.id); setDraft(""); setDraftInfo(""); }} key={conversation.id}>
        <strong>{conversation.fanName}</strong>
        <span>{conversation.fanHandle ? `@${conversation.fanHandle}` : "Fanvue fan"}</span>
        <p>{conversation.latestMessage ?? "No message body imported yet."}</p>
        <small>{conversation.unreadCount} unread</small>
      </button>)}
    </aside>
    <section className="chat-thread">
      <span className={`realtime-state ${realtimeState}`}>Realtime: {realtimeState}</span>
      <header><div><strong>{selected.fanName}</strong><span>{selected.fanHandle ? `@${selected.fanHandle}` : "Fanvue fan"} · {selected.status}</span></div><StopAiButton conversationId={selected.id} disabled={selected.automationPaused} /></header>
      <div className="chat-bubbles">
        {selected.messages.length ? selected.messages.map((message) => <div className={`chat-bubble ${message.sender_type === "fan" ? "fan" : "bot"}`} key={message.external_uuid ?? `${message.created_at}-${message.body}`}>
          <small>{message.sender_type === "fan" ? "fan" : "bot"} · {new Date(message.created_at).toLocaleString()}</small>
          <p>{message.body}</p>
          {message.sender_type === "creator" && message.external_uuid && <UnsendMessageButton conversationId={selected.id} messageUuid={message.external_uuid} />}
        </div>) : <div className="chat-empty"><Bot size={22} /><p>No imported messages yet. Sync Fanvue to load the latest fan conversation.</p></div>}
        <div ref={bottomRef} />
      </div>
      <div className="ai-draft-panel">
        <button className="truth-secondary" type="button" onClick={generateDraft} disabled={draftBusy || selected.automationPaused}><Sparkles size={15} /> {draftBusy ? "Generating..." : "Generate AI draft"}</button>
        {draft && <div><strong>AI draft</strong><p>{draft}</p><button className="truth-primary" type="button" onClick={approveDraft} disabled={sendBusy}>{sendBusy ? "Sending..." : "Approve & send"}</button></div>}
        {draftInfo && <small>{draftInfo}</small>}
      </div>
      <ConversationSendForm conversationId={selected.id} />
    </section>
  </section>;
}
