"use client";

import { Megaphone, PauseCircle, RefreshCw, Send, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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

export function LiveInboxRefresh() {
  const router = useRouter();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 3000);
    return () => window.clearInterval(interval);
  }, [router]);

  return <span className="live-refresh-pill">Live refresh · 3s</span>;
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
      setMessage(`${payload.publishedAt ? "Sent" : "Scheduled"} mass message ${payload.uuid ?? ""} to ${payload.recipientCount ?? 0} resolved fans. Creators were excluded.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mass message could not be sent.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="operator-card" action={submit}>
    <h3>Mass / scheduled fan message</h3>
    <label>Text<textarea name="text" placeholder="Broadcast message..." /></label>
    <label>Media UUIDs<input name="mediaUuids" placeholder="Optional, comma-separated" /></label>
    <label>PPV cents<input name="price" inputMode="numeric" placeholder="Optional, min 200" /></label>
    <label>Schedule time<input name="scheduledAt" type="datetime-local" /></label>
    <div className="operator-checks">
      <label><input type="checkbox" name="smartListIds" value="subscribers" defaultChecked /> Subscribers</label>
      <label><input type="checkbox" name="smartListIds" value="followers" defaultChecked /> Followers</label>
      <label><input type="checkbox" name="smartListIds" value="auto_renewing" /> Auto-renewing</label>
    </div>
    <small>All sends exclude Fanvue creator accounts automatically.</small>
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

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function retry() {
    setBusy(true);
    try {
      const response = await fetch(`/api/automation/jobs/${jobId}/retry`, { method: "POST" });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <button className="truth-secondary compact" type="button" onClick={retry} disabled={busy}>{busy ? "Queueing..." : "Retry"}</button>;
}

export function MediaVaultBrowser() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<Array<{ uuid: string; name: string; mediaType: string; thumbnailUrl: string | null }>>([]);

  async function load(formData?: FormData) {
    setBusy(true);
    setMessage("");
    const folderName = formData?.get("folderName");
    const query = typeof folderName === "string" && folderName.trim() ? `?folderName=${encodeURIComponent(folderName.trim())}` : "";
    try {
      const response = await fetch(`/api/fanvue/media${query}`);
      const payload = await response.json() as { items?: Array<{ uuid: string; name: string; mediaType: string; thumbnailUrl: string | null }>; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Media vault could not be loaded.");
      setItems(payload.items ?? []);
      setMessage((payload.items ?? []).length ? "Vault media loaded. Copy UUIDs into message/post forms." : "No ready media found.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Media vault could not be loaded.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="operator-card media-vault-card" action={load}>
    <h3>Media vault browser</h3>
    <p>Loads ready Fanvue vault media with fresh thumbnail URLs. The app stores UUIDs only, not signed media URLs.</p>
    <label>Folder name<input name="folderName" placeholder="Optional exact Fanvue folder name" /></label>
    <button className="truth-primary" disabled={busy} type="submit"><RefreshCw size={15} /> {busy ? "Loading..." : "Load vault"}</button>
    {message && <small>{message}</small>}
    <div className="media-vault-grid">{items.map((item) => <button key={item.uuid} className="media-vault-item" type="button" onClick={() => navigator.clipboard?.writeText(item.uuid)}>
      {item.thumbnailUrl ? <span className="media-vault-thumb" style={{ backgroundImage: `url(${item.thumbnailUrl})` }} /> : <span>{item.mediaType}</span>}
      <strong>{item.name}</strong>
      <small>{item.uuid}</small>
    </button>)}</div>
  </form>;
}

export function AutoReplySettingsForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Loading automation settings...");
  const [settings, setSettings] = useState({
    enabled: false,
    approvalRequired: true,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
    maxRepliesPerHour: 20,
    minConfidence: 0.75,
    ppvAllowed: false,
    maxPpvCents: 50000,
  });

  useEffect(() => {
    let mounted = true;
    fetch("/api/automation/settings").then((response) => response.json()).then((payload: { settings?: typeof settings; migrationRequired?: boolean }) => {
      if (!mounted) return;
      if (payload.settings) setSettings(payload.settings);
      setMessage(payload.migrationRequired ? "Apply the latest Supabase migration to save durable settings." : "");
    }).catch(() => mounted && setMessage("Automation settings could not be loaded."));
    return () => { mounted = false; };
  }, []);

  async function submit(formData: FormData) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/automation/settings", {
        method: "POST",
        body: JSON.stringify({
          enabled: formData.get("enabled") === "on",
          approvalRequired: formData.get("approvalRequired") === "on",
          quietHoursStart: formData.get("quietHoursStart"),
          quietHoursEnd: formData.get("quietHoursEnd"),
          maxRepliesPerHour: formData.get("maxRepliesPerHour"),
          minConfidence: formData.get("minConfidence"),
          ppvAllowed: formData.get("ppvAllowed") === "on",
          maxPpvCents: formData.get("maxPpvCents"),
        }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Automation settings could not be saved.");
      setMessage("Automation settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Automation settings could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return <form className="operator-card" action={submit}>
    <h3>Auto-reply controls</h3>
    <p>Set safe automation limits. Approval mode keeps AI drafts human-reviewed before Fanvue sends.</p>
    <div className="operator-checks">
      <label><input name="enabled" type="checkbox" defaultChecked={settings.enabled} /> Auto-reply enabled</label>
      <label><input name="approvalRequired" type="checkbox" defaultChecked={settings.approvalRequired} /> Require approval</label>
      <label><input name="ppvAllowed" type="checkbox" defaultChecked={settings.ppvAllowed} /> Allow PPV automation</label>
    </div>
    <label>Quiet hours start<input name="quietHoursStart" type="time" defaultValue={settings.quietHoursStart} /></label>
    <label>Quiet hours end<input name="quietHoursEnd" type="time" defaultValue={settings.quietHoursEnd} /></label>
    <label>Max replies per hour<input name="maxRepliesPerHour" type="number" min="1" max="500" defaultValue={settings.maxRepliesPerHour} /></label>
    <label>Minimum AI confidence<input name="minConfidence" type="number" min="0" max="1" step="0.01" defaultValue={settings.minConfidence} /></label>
    <label>Max PPV cents<input name="maxPpvCents" type="number" min="0" defaultValue={settings.maxPpvCents} /></label>
    <button className="truth-primary" disabled={busy} type="submit"><Settings2 size={15} /> {busy ? "Saving..." : "Save controls"}</button>
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
