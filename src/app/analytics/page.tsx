import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { InsightsLoader } from "@/app/inbox-actions";

export default function AnalyticsPage() {
  return <main className="workspace-page">
    <Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link>
    <section className="integration-page">
      <div className="workspace-state-icon"><BarChart3 size={24} /></div>
      <p className="truth-eyebrow">INSIGHTS</p>
      <h1>Fanvue insights dashboard.</h1>
      <p>Use the inbox sync for confirmed conversation counts. Revenue and fan insight data is loaded from Fanvue only after you click the loader below.</p>
      <div className="workspace-state-actions"><Link className="truth-primary" href="/">Open inbox controls</Link><Link className="truth-secondary" href="/integrations">Check connection</Link></div>
    </section>
    <section className="integration-page"><InsightsLoader /></section>
  </main>;
}
