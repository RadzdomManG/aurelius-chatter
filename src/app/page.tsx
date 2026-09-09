"use client";

import { useState } from "react";

const models = [
  { name: "Lena Vale", handle: "@lenavale", status: "Connected", unread: 8, color: "rose" },
  { name: "Mira Stone", handle: "@mirastone", status: "Connected", unread: 3, color: "amber" },
  { name: "Nora Wilde", handle: "@norawilde", status: "Draft mode", unread: 0, color: "blue" },
];

const conversations = [
  { name: "Evan Brooks", preview: "That playlist you sent is perfect...", time: "2m", stage: "Engaged", active: true, avatar: "EB" },
  { name: "Theo Martin", preview: "I have a question about Friday", time: "18m", stage: "Support", active: false, avatar: "TM" },
  { name: "Alex Rivera", preview: "You remembered my favorite film", time: "41m", stage: "Rapport", active: false, avatar: "AR" },
  { name: "Jamie Chen", preview: "Can we pick this up tomorrow?", time: "1h", stage: "New", active: false, avatar: "JC" },
];

function Avatar({ initials, tone = "violet" }: { initials: string; tone?: string }) {
  return <div className={`avatar avatar-${tone}`}>{initials}</div>;
}

export default function Home() {
  const [automationPaused, setAutomationPaused] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">A</span><span>Aurelius <em>Chatter</em></span></div>
        <div className="workspace-label">WORKSPACE</div>
        <button className="workspace-switch"><span><strong>Velvet House</strong><small>Agency workspace</small></span><span className="chevron">⌄</span></button>
        <nav className="nav-list" aria-label="Main navigation">
          <a className="nav-item active" href="#inbox"><span className="nav-icon">◫</span>Inbox<span className="nav-count">11</span></a>
          <a className="nav-item" href="#models"><span className="nav-icon">◉</span>Models</a>
          <a className="nav-item" href="#automations"><span className="nav-icon">✦</span>Automations</a>
          <a className="nav-item" href="#fans"><span className="nav-icon">◎</span>Fans &amp; CRM</a>
          <a className="nav-item" href="#analytics"><span className="nav-icon">⌁</span>Analytics</a>
          <div className="nav-section">OPERATIONS</div>
          <a className="nav-item" href="#events"><span className="nav-icon">◌</span>Event center</a>
          <a className="nav-item" href="#team"><span className="nav-icon">♧</span>Team</a>
          <a className="nav-item" href="#settings"><span className="nav-icon">⚙</span>Settings</a>
        </nav>
        <div className="sidebar-bottom"><div className="health-row"><span className="status-dot" />All systems operational</div><div className="user-row"><Avatar initials="SR" tone="dark" /><span><strong>Sam Rivers</strong><small>Owner</small></span><span className="more">•••</span></div></div>
      </aside>

      <section className="main-area" id="inbox">
        <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><b>/</b><strong>Inbox</strong></div><div className="top-actions"><button className="icon-button" aria-label="Search">⌕</button><button className="icon-button" aria-label="Notifications">♢<i /></button><div className="top-avatar">SR</div></div></header>
        <div className="content">
          <div className="page-heading"><div><p className="eyebrow">TUESDAY, OCTOBER 14, 2025</p><h1>Good morning, Sam</h1><p className="muted">Your conversation desk is calm. There are 11 chats waiting for attention.</p></div><button className="primary-button">＋ Add model</button></div>

          <div className="metric-grid"><div className="metric-card"><span className="metric-label">Unread conversations</span><strong>11</strong><span className="trend positive">↗ 18% <small>vs last week</small></span></div><div className="metric-card"><span className="metric-label">AI-assisted replies</span><strong>84<span className="unit">%</span></strong><span className="trend positive">↗ 6% <small>vs last week</small></span></div><div className="metric-card"><span className="metric-label">Average response time</span><strong>4<span className="unit">m</span> 32<span className="unit">s</span></strong><span className="trend positive">↘ 12% <small>vs last week</small></span></div><div className="metric-card accent-card"><span className="metric-label">Automation health</span><strong>98.7<span className="unit">%</span></strong><span className="health-copy"><span className="status-dot" />Healthy across 3 models</span></div></div>

          <div className="section-heading"><div><h2>Conversation desk</h2><p className="muted">Review replies, memories, and handoffs in one place.</p></div><div className="desk-actions"><button className="filter-button">All conversations <span>⌄</span></button><button className="icon-button bordered" aria-label="More filters">☷</button></div></div>
          <div className="desk-grid">
            <section className="conversation-panel"><div className="panel-toolbar"><div className="search-box">⌕ <span>Search conversations</span></div><button className="sort-button">Recent <span>⌄</span></button></div><div className="model-strip"><button className="model-pill selected"><span className="mini-avatar all">✦</span>All models <b>11</b></button>{models.map((model) => <button className="model-pill" key={model.name}><span className={`mini-avatar ${model.color}`}>{model.name[0]}</span>{model.name.split(" ")[0]} {model.unread > 0 && <b>{model.unread}</b>}</button>)}</div><div className="conversation-list">{conversations.map((conversation) => <div className={`conversation-row ${conversation.active ? "selected-row" : ""}`} key={conversation.name}><Avatar initials={conversation.avatar} tone={conversation.active ? "violet" : "light"} /><div className="conversation-copy"><div><strong>{conversation.name}</strong><span className="conversation-time">{conversation.time}</span></div><p>{conversation.preview}</p><span className={`stage stage-${conversation.stage.toLowerCase()}`}>{conversation.stage}</span></div>{conversation.active && <span className="unread-dot" />}</div>)}</div><button className="view-all">View all conversations <span>→</span></button></section>
            <section className="detail-panel"><div className="detail-header"><div className="detail-person"><Avatar initials="EB" tone="violet" /><div><h3>Evan Brooks</h3><p>@evanbrooks · Subscriber <span className="online">● Online</span></p></div></div><div className="detail-actions"><button className={`icon-button bordered ${automationPaused ? "paused-button" : ""}`} aria-label="Pause automation" aria-pressed={automationPaused} onClick={() => setAutomationPaused((value) => !value)}>{automationPaused ? "▶" : "Ⅱ"}</button><button className="icon-button bordered" aria-label="More actions">•••</button></div></div><div className="message-area"><div className="day-divider"><span>Today</span></div><div className="message fan-message"><span className="message-time">10:42</span><p>Hey Lena, I finally listened to that playlist you sent me.</p></div><div className="message fan-message"><span className="message-time">10:42</span><p>The first track is completely my vibe. How did you find it?</p></div><div className="message ai-message"><span className="message-time">10:44 · AI draft</span><p>I&apos;m so glad it found you! I had a feeling that first track would be your kind of sound. What have you been listening to lately?</p></div></div><div className="draft-bar"><div className="draft-heading"><span className="sparkle">✦</span><strong>{automationPaused ? "Automation paused" : "AI draft ready"}</strong><span className="confidence">{automationPaused ? "Human review required" : "96% confidence"}</span></div><div className="draft-actions"><button className="secondary-button">Edit draft</button><button className="send-button">Send reply <span>↗</span></button></div></div></section>
            <aside className="memory-panel"><div className="memory-heading"><div><span className="eyebrow memory-eyebrow">FAN MEMORY</span><h3>What Aurelius remembers</h3></div><button className="icon-button" aria-label="Memory settings" onClick={() => setMemoryOpen((value) => !value)}>⚙</button></div><div className="memory-summary"><span className="summary-icon">✦</span><p>Evan responds well to thoughtful music recommendations and prefers a warm, curious tone.</p></div>{memoryOpen && <div className="memory-notice" role="status">Memory collection settings are ready for review.</div>}<div className="memory-group"><div className="group-title"><span>Confirmed facts</span><button aria-label="Add memory">＋</button></div><div className="memory-item"><span className="fact-icon blue">♫</span><div><strong>Enjoys indie folk music</strong><small>Confirmed 2 days ago</small></div></div><div className="memory-item"><span className="fact-icon amber">⌁</span><div><strong>Works in architecture</strong><small>Confirmed 1 week ago</small></div></div><div className="memory-item"><span className="fact-icon rose">♡</span><div><strong>Prefers being called “Ev”</strong><small>Confirmed 3 weeks ago</small></div></div></div><div className="memory-group"><div className="group-title"><span>Open threads</span><b>2</b></div><div className="thread-item"><span className="thread-dot" /><span>Ask about the studio project he mentioned</span></div><div className="thread-item"><span className="thread-dot" /><span>Follow up on the weekend hike</span></div></div><div className="memory-footer"><span>Last summary · 18 min ago</span><button>Open memory <span>→</span></button></div></aside>
          </div>
        </div>
      </section>
    </main>
  );
}
