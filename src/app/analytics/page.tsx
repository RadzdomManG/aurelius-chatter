import Link from "next/link";
import type { ReactNode } from "react";
import { Activity, BarChart3, CheckCircle2, DollarSign, MessageSquare, XCircle } from "lucide-react";

import { InsightsLoader, RetryJobButton } from "@/app/inbox-actions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AnalyticsData = {
  botMessages: number;
  fanMessages: number;
  failedJobs: number;
  completedJobs: number;
  pendingJobs: number;
  webhookLogs: number;
  earningsCents: number;
  estimatedProfitCents: number;
  daily: Array<{ label: string; bot: number; fan: number }>;
  logs: Array<{ label: string; detail: string; status: string }>;
  failedQueue: Array<{ id: string; detail: string }>;
  schedules: Array<{ label: string; detail: string }>;
  durableLogsReady: boolean;
};

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function getAnalytics(): Promise<AnalyticsData> {
  const empty: AnalyticsData = { botMessages: 0, fanMessages: 0, failedJobs: 0, completedJobs: 0, pendingJobs: 0, webhookLogs: 0, earningsCents: 0, estimatedProfitCents: 0, daily: [], logs: [], failedQueue: [], schedules: [], durableLogsReady: false };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return empty;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return empty;
    const { data: membership } = await supabase.from("organization_members").select("organization_id").eq("user_id", userData.user.id).limit(1).maybeSingle();
    if (!membership?.organization_id) return empty;
    const organizationId = membership.organization_id;
    const [botActions, fanMessages, failedJobs, completedJobs, pendingJobs, webhookLogs, recentMessages, recentJobs, recentWebhooks, failedQueue, schedules] = await Promise.all([
      supabase.from("bot_action_logs").select("action_type, input_tokens, output_tokens, estimated_cost_cents, revenue_cents, created_at", { count: "exact" }).eq("organization_id", organizationId).in("action_type", ["message_send", "ppv_message_send", "mass_message_send"]).eq("status", "completed"),
      supabase.from("messages").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("sender_type", "fan"),
      supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).in("status", ["failed", "dead_letter"]),
      supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "completed"),
      supabase.from("automation_jobs").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("status", "pending"),
      supabase.from("webhook_events").select("id", { count: "exact", head: true }).eq("organization_id", organizationId),
      supabase.from("messages").select("sender_type, created_at").eq("organization_id", organizationId).gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString()).order("created_at", { ascending: true }),
      supabase.from("automation_jobs").select("status, created_at, last_error").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(5),
      supabase.from("webhook_events").select("event_type, status, received_at").eq("organization_id", organizationId).order("received_at", { ascending: false }).limit(5),
      supabase.from("automation_jobs").select("id, status, last_error, created_at").eq("organization_id", organizationId).in("status", ["failed", "dead_letter"]).order("created_at", { ascending: false }).limit(8),
      supabase.from("scheduled_operator_actions").select("action_type, status, scheduled_at").eq("organization_id", organizationId).gte("scheduled_at", new Date(Date.now() - 86400000).toISOString()).order("scheduled_at", { ascending: true }).limit(8),
    ]);
    const durableLogsReady = !botActions.error;
    const botActionRows = botActions.data ?? [];
    const botCreatedDays = botActionRows.map((action) => ({ sender_type: "bot", created_at: action.created_at }));
    const daily = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(Date.now() - (6 - index) * 86400000);
      const label = date.toLocaleDateString("en", { month: "short", day: "numeric" });
      const dayMessages = (recentMessages.data ?? []).filter((message) => new Date(message.created_at).toDateString() === date.toDateString());
      const dayBotActions = botCreatedDays.filter((message) => new Date(message.created_at).toDateString() === date.toDateString());
      return { label, bot: dayBotActions.length, fan: dayMessages.filter((message) => message.sender_type === "fan").length };
    });
    const logs = [
      ...(recentJobs.data ?? []).map((job) => ({ label: `Automation ${job.status}`, detail: job.last_error ?? new Date(job.created_at).toLocaleString(), status: job.status })),
      ...(recentWebhooks.data ?? []).map((event) => ({ label: event.event_type, detail: new Date(event.received_at).toLocaleString(), status: event.status })),
    ].slice(0, 8);
    return {
      botMessages: durableLogsReady ? botActions.count ?? 0 : 0,
      fanMessages: fanMessages.count ?? 0,
      failedJobs: failedJobs.count ?? 0,
      completedJobs: completedJobs.count ?? 0,
      pendingJobs: pendingJobs.count ?? 0,
      webhookLogs: webhookLogs.count ?? 0,
      earningsCents: botActionRows.reduce((total, row) => total + Number(row.revenue_cents ?? 0), 0),
      estimatedProfitCents: botActionRows.reduce((total, row) => total + Number(row.revenue_cents ?? 0) - Number(row.estimated_cost_cents ?? 0), 0),
      daily,
      logs,
      failedQueue: (failedQueue.data ?? []).map((job) => ({ id: job.id, detail: job.last_error ?? `${job.status} since ${new Date(job.created_at).toLocaleString()}` })),
      schedules: schedules.error ? [] : (schedules.data ?? []).map((schedule) => ({ label: schedule.action_type, detail: `${schedule.status} · ${new Date(schedule.scheduled_at).toLocaleString()}` })),
      durableLogsReady,
    };
  } catch {
    return empty;
  }
}

function AnalyticsMetric({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return <article className="analytics-card"><span>{icon}</span><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>;
}

export default async function AnalyticsPage() {
  const data = await getAnalytics();
  const maxBar = Math.max(1, ...data.daily.map((day) => Math.max(day.bot, day.fan)));
  return <main className="workspace-page analytics-shell">
    <Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link>
    <section className="analytics-header">
      <p className="truth-eyebrow">INSIGHTS</p>
      <h1>Bot performance dashboard.</h1>
      <p>Professional metrics from confirmed app data only. Fanvue earnings are shown as $0 until Fanvue returns revenue/PPV data through the connected insights API.</p>
    </section>
    <section className="analytics-metrics">
      <AnalyticsMetric icon={<MessageSquare size={18} />} label="Bot messages sent" value={String(data.botMessages)} detail={data.durableLogsReady ? "Only app/bot sends after logging upgrade" : "Durable bot log table not applied yet"} />
      <AnalyticsMetric icon={<XCircle size={18} />} label="Failed jobs" value={String(data.failedJobs)} detail="Failed or dead-letter automation jobs" />
      <AnalyticsMetric icon={<Activity size={18} />} label="Logs" value={String(data.webhookLogs)} detail="Fanvue webhook events received" />
      <AnalyticsMetric icon={<DollarSign size={18} />} label="Bot earnings" value={money(data.earningsCents)} detail={`Estimated profit ${money(data.estimatedProfitCents)}`} />
    </section>
    <section className="analytics-grid">
      <article className="analytics-panel">
        <div className="analytics-panel-heading"><div><p className="truth-eyebrow">MESSAGE VOLUME</p><h2>Last 7 days</h2></div><BarChart3 size={18} /></div>
        <div className="bar-chart">{data.daily.map((day) => <div className="bar-day" key={day.label}><div><span className="bar fan" style={{ height: `${Math.max(4, (day.fan / maxBar) * 130)}px` }} /><span className="bar bot" style={{ height: `${Math.max(4, (day.bot / maxBar) * 130)}px` }} /></div><small>{day.label}</small></div>)}</div>
        <p className="chart-legend"><span className="legend-fan" /> Fan messages <span className="legend-bot" /> Bot messages</p>
      </article>
      <article className="analytics-panel">
        <div className="analytics-panel-heading"><div><p className="truth-eyebrow">AUTOMATION HEALTH</p><h2>Queue status</h2></div><CheckCircle2 size={18} /></div>
        <div className="status-bars"><p><span>Completed</span><b>{data.completedJobs}</b></p><meter min={0} max={Math.max(1, data.completedJobs + data.pendingJobs + data.failedJobs)} value={data.completedJobs} /><p><span>Pending</span><b>{data.pendingJobs}</b></p><meter min={0} max={Math.max(1, data.completedJobs + data.pendingJobs + data.failedJobs)} value={data.pendingJobs} /><p><span>Failed</span><b>{data.failedJobs}</b></p><meter min={0} max={Math.max(1, data.completedJobs + data.pendingJobs + data.failedJobs)} value={data.failedJobs} /></div>
      </article>
      <article className="analytics-panel">
        <div className="analytics-panel-heading"><div><p className="truth-eyebrow">RECENT LOGS</p><h2>Audit trail</h2></div></div>
        <div className="analytics-log">{data.logs.length ? data.logs.map((log, index) => <p key={`${log.label}-${index}`}><strong>{log.label}</strong><span>{log.status} · {log.detail}</span></p>) : <p><strong>No logs yet</strong><span>Sync Fanvue or receive webhooks to populate logs.</span></p>}</div>
      </article>
      <article className="analytics-panel">
        <div className="analytics-panel-heading"><div><p className="truth-eyebrow">RETRY QUEUE</p><h2>Failed automation</h2></div><XCircle size={18} /></div>
        <div className="analytics-log">{data.failedQueue.length ? data.failedQueue.map((job) => <p key={job.id}><strong>{job.detail}</strong><span><RetryJobButton jobId={job.id} /></span></p>) : <p><strong>No failed jobs</strong><span>Nothing needs manual retry right now.</span></p>}</div>
      </article>
      <article className="analytics-panel">
        <div className="analytics-panel-heading"><div><p className="truth-eyebrow">SCHEDULED CALENDAR</p><h2>Upcoming sends</h2></div></div>
        <div className="analytics-log">{data.schedules.length ? data.schedules.map((schedule, index) => <p key={`${schedule.label}-${index}`}><strong>{schedule.label.replaceAll("_", " ")}</strong><span>{schedule.detail}</span></p>) : <p><strong>No scheduled sends</strong><span>Scheduled mass messages and posts will appear here after creation.</span></p>}</div>
      </article>
      <InsightsLoader />
    </section>
  </main>;
}
