export type ActivityFeedItem = {
  id: string;
  traceId: string;
  messageUuid: string | null;
  jobId: string | null;
  conversationId: string | null;
  event: string;
  status: string;
  latencyMs: number | null;
  error: string | null;
  createdAt: string;
  timeLabel: string;
  modelName: string;
  fanName: string;
};

export function ActivityFeed({ items }: { items: ActivityFeedItem[] }) {
  return <section className="activity-feed">
    <header><div><p className="truth-eyebrow">SYSTEM TRACE</p><h2>Recent Activity</h2></div><span>{items.length} recent events</span></header>
    <div className="activity-list">
      {items.length ? items.map((item) => <details className={`activity-row ${item.status}`} key={item.id}>
        <summary><span className="activity-source">system</span><strong>{item.event} · {item.modelName}</strong><span>{item.fanName}</span><time dateTime={item.createdAt}>{item.timeLabel}</time></summary>
        <dl>
          <div><dt>Trace ID</dt><dd>{item.traceId}</dd></div>
          <div><dt>Message UUID</dt><dd>{item.messageUuid ?? "—"}</dd></div>
          <div><dt>Job ID</dt><dd>{item.jobId ?? "—"}</dd></div>
          <div><dt>Creator / model</dt><dd>{item.modelName}</dd></div>
          <div><dt>Fan</dt><dd>{item.fanName}</dd></div>
          <div><dt>Conversation</dt><dd>{item.conversationId ?? "—"}</dd></div>
          <div><dt>Latency</dt><dd>{item.latencyMs === null ? "—" : `${item.latencyMs} ms`}</dd></div>
          <div><dt>Status</dt><dd>{item.status}</dd></div>
          {item.error ? <div className="activity-error"><dt>Error</dt><dd>{item.error}</dd></div> : null}
        </dl>
      </details>) : <p className="activity-empty">No event-driven activity has been recorded yet.</p>}
    </div>
  </section>;
}
