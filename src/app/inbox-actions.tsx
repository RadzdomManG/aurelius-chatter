"use client";

import { Megaphone, PauseCircle, RefreshCw, Send, Trash2 } from "lucide-react";
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

export function ConversationSendForm({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          text: formData.get("text"),
          mediaUuids: formData.get("mediaUuids"),
          price: formData.get("price"),
        }),
      });
      const payload = await response.json() as { error?: string; messageUuid?: string };
      if (!response.ok) throw new Error(payload.error ?? "Message could not be sent.");
      setMessage(`Sent${payload.messageUuid ? `: ${payload.messageUuid}` : "."}`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="fanvue-action-form" action={submit}>
    <label>Message<input name="text" placeholder="Type a Fanvue reply..." /></label>
    <label>Media UUIDs<input name="mediaUuids" placeholder="Optional, comma-separated" /></label>
    <label>PPV cents<input name="price" inputMode="numeric" placeholder="Optional, min 300" /></label>
    <button className="truth-primary" type="submit" disabled={busy}><Send size={15} /> {busy ? "Sending..." : "Send / PPV"}</button>
    {message && <small>{message}</small>}
  </form>;
}

export function UnsendMessageButton({ conversationId, messageUuid }: { conversationId: string; messageUuid: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function unsend() {
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${conversationId}/messages/${messageUuid}`, { method: "DELETE" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "Message could not be unsent.");
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <button className="truth-secondary" type="button" onClick={unsend} disabled={busy}><Trash2 size={14} /> {busy ? "Unsending..." : "Unsend"}</button>;
}

export function MassMessageForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/fanvue/mass-messages", {
        method: "POST",
        body: JSON.stringify({
          text: formData.get("text"),
          mediaUuids: formData.get("mediaUuids"),
          price: formData.get("price"),
          scheduledAt: formData.get("scheduledAt"),
          smartListIds: formData.getAll("smartListIds"),
        }),
      });
      const payload = await response.json() as { error?: string; uuid?: string; recipientCount?: number; publishedAt?: string | null };
      if (!response.ok) throw new Error(payload.error ?? "Mass message could not be sent.");
      setMessage(`${payload.publishedAt ? "Sent" : "Scheduled"} mass message ${payload.uuid ?? ""} to ${payload.recipientCount ?? 0} resolved fans.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mass message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="operator-card" action={submit}>
    <h3>Mass / scheduled message</h3>
    <label>Text<textarea name="text" placeholder="Broadcast message..." /></label>
    <label>Media UUIDs<input name="mediaUuids" placeholder="Optional, comma-separated" /></label>
    <label>PPV cents<input name="price" inputMode="numeric" placeholder="Optional, min 200" /></label>
    <label>Schedule time<input name="scheduledAt" type="datetime-local" /></label>
    <div className="operator-checks">
      <label><input type="checkbox" name="smartListIds" value="subscribers" /> Subscribers</label>
      <label><input type="checkbox" name="smartListIds" value="followers" /> Followers</label>
      <label><input type="checkbox" name="smartListIds" value="auto_renewing" /> Auto-renewing</label>
    </div>
    <button className="truth-primary" disabled={busy} type="submit"><Megaphone size={15} /> {busy ? "Submitting..." : "Send / Schedule"}</button>
    {message && <small>{message}</small>}
  </form>;
}

export function PostToFanvueForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/fanvue/posts", {
        method: "POST",
        body: JSON.stringify({
          text: formData.get("text"),
          mediaUuids: formData.get("mediaUuids"),
          price: formData.get("price"),
          publishAt: formData.get("publishAt"),
          audience: formData.get("audience"),
        }),
      });
      const payload = await response.json() as { error?: string; uuid?: string; publishedAt?: string | null; publishAt?: string | null };
      if (!response.ok) throw new Error(payload.error ?? "Post could not be created.");
      setMessage(`${payload.publishAt && !payload.publishedAt ? "Scheduled" : "Posted"} Fanvue post ${payload.uuid ?? ""}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Post could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="operator-card" action={submit}>
    <h3>Post / scheduled post</h3>
    <label>Text<textarea name="text" placeholder="Fanvue post..." /></label>
    <label>Media UUIDs<input name="mediaUuids" placeholder="Optional, comma-separated" /></label>
    <label>PPV cents<input name="price" inputMode="numeric" placeholder="Optional, min 300" /></label>
    <label>Publish time<input name="publishAt" type="datetime-local" /></label>
    <label>Audience<select name="audience" defaultValue="subscribers"><option value="subscribers">Subscribers</option><option value="followers-and-subscribers">Followers and subscribers</option></select></label>
    <button className="truth-primary" disabled={busy} type="submit"><Send size={15} /> {busy ? "Submitting..." : "Post / Schedule"}</button>
    {message && <small>{message}</small>}
  </form>;
}

export function InsightsLoader() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [payload, setPayload] = useState<unknown>(null);

  async function load() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/fanvue/insights");
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Insights could not be loaded.");
      setPayload(body);
      setMessage("Fanvue insights loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Insights could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="operator-card">
    <h3>Fanvue insight import</h3>
    <p>Loads confirmed Fanvue insight data through your connected account. Nothing synthetic is counted.</p>
    <button className="truth-primary" type="button" disabled={busy} onClick={load}><RefreshCw size={15} /> {busy ? "Loading..." : "Load insights"}</button>
    {message && <small>{message}</small>}
    {payload !== null && <pre className="insights-json">{JSON.stringify(payload, null, 2)}</pre>}
  </div>;
}
