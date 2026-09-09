import Link from "next/link";
import { xaiEnv } from "@/lib/env";

export default function IntegrationsPage() {
  const fanvueConfigured = Boolean(process.env.FANVUE_CLIENT_ID && process.env.FANVUE_REDIRECT_URI);
  const xai = xaiEnv();
  const xaiConfigured = Boolean(process.env.XAI_API_KEY);
  return <main className="workspace-page"><Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link><section className="integration-page"><p className="truth-eyebrow">INTEGRATIONS</p><h1>Connection health</h1><p>Only verified configuration is shown. Secrets are never displayed.</p><div className="integration-list"><div><strong>Fanvue</strong><span className={fanvueConfigured ? "integration-ready" : "integration-missing"}>{fanvueConfigured ? "Configured" : "Setup required"}</span></div><div><strong>xAI / Grok</strong><span className={xaiConfigured ? "integration-ready" : "integration-missing"}>{xaiConfigured ? `Configured: ${xai.model}` : "Setup required"}</span></div><div><strong>Supabase</strong><span className={process.env.NEXT_PUBLIC_SUPABASE_URL ? "integration-ready" : "integration-missing"}>{process.env.NEXT_PUBLIC_SUPABASE_URL ? "Configured" : "Setup required"}</span></div></div>{!fanvueConfigured && <p className="integration-note">Fanvue is not connected. Add the server-side application configuration before starting OAuth from the model you want attached to that Fanvue account.</p>}<div className="workspace-state-actions"><Link className="truth-primary" href="/playground">Open Playground</Link><Link className="truth-secondary" href="/settings">Review settings</Link></div></section></main>;
}
