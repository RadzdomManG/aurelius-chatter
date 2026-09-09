import Link from "next/link";
import { CheckCircle2, Settings2 } from "lucide-react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  let organizationName: string | null = null;
  let role: string | null = null;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      const { data: membership } = await supabase
        .from("organization_members")
        .select("role, organizations(name)")
        .eq("user_id", userData.user.id)
        .limit(1)
        .maybeSingle();
      const organization = membership?.organizations as { name?: string } | { name?: string }[] | null;
      organizationName = Array.isArray(organization) ? organization[0]?.name ?? null : organization?.name ?? null;
      role = membership?.role ?? null;
    }
  } catch {
    organizationName = null;
  }

  if (!organizationName) {
    return <main className="workspace-page"><Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link><section className="workspace-state"><div className="workspace-state-icon"><Settings2 size={24} /></div><p className="truth-eyebrow">SETTINGS</p><h1>Sign in to manage your workspace.</h1><p>Your Aurelius workspace exists, but settings require an authenticated owner or team member session.</p><div className="workspace-state-actions"><Link className="truth-primary" href="/login">Sign in</Link></div></section></main>;
  }

  return <main className="workspace-page"><Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link><section className="integration-page"><p className="truth-eyebrow">SETTINGS</p><h1>Workspace configured.</h1><p>{organizationName} is connected to Supabase. You are signed in as {role ?? "team member"}.</p><div className="integration-list"><div><strong>Organization</strong><span className="integration-ready">{organizationName}</span></div><div><strong>Your role</strong><span className="integration-ready">{role ?? "Member"}</span></div><div><strong>Data policy</strong><span className="integration-ready"><CheckCircle2 size={14} /> Real data only</span></div></div><div className="workspace-state-actions"><Link className="truth-primary" href="/models">Manage models</Link><Link className="truth-secondary" href="/integrations">View integrations</Link></div></section></main>;
}
