"use client";

import { PauseCircle, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncFanvueButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function sync() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/fanvue/sync", { method: "POST" });
      const payload = await response.json() as { conversationsImported?: number; messagesImported?: number; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Fanvue sync failed.");
      setMessage(`Synced ${payload.conversationsImported ?? 0} chats and ${payload.messagesImported ?? 0} messages.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Fanvue sync failed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="inbox-action-stack"><button className="truth-primary" type="button" onClick={sync} disabled={busy}><RefreshCw size={16} /> {busy ? "Syncing..." : "Sync Fanvue"}</button>{message && <span>{message}</span>}</div>;
}

export function StopAiButton({ conversationId, disabled }: { conversationId: string; disabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function stop() {
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/pause-ai`, { method: "POST" });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <button className="truth-secondary" type="button" onClick={stop} disabled={disabled || busy}><PauseCircle size={15} /> {busy ? "Stopping..." : disabled ? "AI stopped" : "Stop AI"}</button>;
}
