import Link from "next/link";
import { ArrowLeft, CircleAlert, Settings2 } from "lucide-react";

export function WorkspacePlaceholder({ title, eyebrow, description, actionHref = "/playground", actionLabel = "Open Playground" }: { title: string; eyebrow: string; description: string; actionHref?: string; actionLabel?: string }) {
  return <main className="workspace-page"><Link className="workspace-back" href="/"><ArrowLeft size={15} /> Back to inbox</Link><section className="workspace-state"><div className="workspace-state-icon"><CircleAlert size={24} /></div><p className="truth-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p><div className="workspace-state-actions"><Link className="truth-primary" href={actionHref}>{actionLabel}</Link><Link className="truth-secondary" href="/settings"><Settings2 size={15} /> Check setup</Link></div></section></main>;
}
