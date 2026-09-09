"use client";

import { Bot } from "lucide-react";
import { useState } from "react";

import { ConversationSendForm, StopAiButton, UnsendMessageButton } from "@/app/inbox-actions";

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

export function ChatDesk({ conversations }: { conversations: ChatDeskConversation[] }) {
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "");
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0] ?? null;

  if (!selected) return null;

  return <section className="chat-desk">
    <aside className="chat-list">
      <div className="chat-search">Search username...</div>
      {conversations.map((conversation) => <button className={`chat-list-row ${conversation.id === selected.id ? "selected" : ""}`} type="button" onClick={() => setSelectedId(conversation.id)} key={conversation.id}>
        <strong>{conversation.fanName}</strong>
        <span>{conversation.fanHandle ? `@${conversation.fanHandle}` : "Fanvue fan"}</span>
        <p>{conversation.latestMessage ?? "No message body imported yet."}</p>
        <small>{conversation.unreadCount} unread</small>
      </button>)}
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
  </section>;
}
