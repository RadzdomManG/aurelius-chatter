import Link from "next/link";
import { CheckCircle2, Settings2 } from "lucide-react";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  let organizationName: string | null = null;
  let role: string | null = null;
  let signedIn = false;
  let dataError = false;

  try {
    const supabase = await createSupabaseServerClient();
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) {
      signedIn = true;
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id, role")
        .eq("user_id", userData.user.id)
        .limit(1)
        .maybeSingle();
      if (membershipError) dataError = true;
      role = membership?.role ?? null;
      if (membership?.organization_id) {
        const { data: organization, error: organizationError } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", membership.organization_id)
          .maybeSingle();
        if (organizationError) dataError = true;
        organizationName = organization?.name ?? null;
      }
    }
  } catch {
    dataError = true;
  }

  if (!signedIn) {
    return <main className="workspace-page"><Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link><section className="workspace-state"><div className="workspace-state-icon"><Settings2 size={24} /></div><p className="truth-eyebrow">SETTINGS</p><h1>Sign in to manage your workspace.</h1><p>Your Aurelius workspace exists, but settings require an authenticated owner or team member session.</p><div className="workspace-state-actions"><Link className="truth-primary" href="/login">Sign in</Link></div></section></main>;
  }

  if (dataError) {
    return <main className="workspace-page"><Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link><section className="workspace-state"><div className="workspace-state-icon"><Settings2 size={24} /></div><p className="truth-eyebrow">SETTINGS</p><h1>Workspace data is temporarily unavailable.</h1><p>Your session is active, but the workspace settings could not be loaded. Refresh this page or check the Supabase connection.</p></section></main>;
  }

  if (!organizationName) {
    return <main className="workspace-page"><Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link><section className="workspace-state"><div className="workspace-state-icon"><Settings2 size={24} /></div><p className="truth-eyebrow">SETTINGS</p><h1>No workspace membership found.</h1><p>Your session is active, but this account is not connected to an Aurelius organization.</p></section></main>;
  }

  return <main className="workspace-page"><Link className="workspace-back" href="/"><span>←</span> Back to inbox</Link><section className="integration-page"><p className="truth-eyebrow">SETTINGS</p><h1>Workspace configured.</h1><p>{organizationName} is connected to Supabase. You are signed in as {role ?? "team member"}.</p><div className="integration-list"><div><strong>Organization</strong><span className="integration-ready">{organizationName}</span></div><div><strong>Your role</strong><span className="integration-ready">{role ?? "Member"}</span></div><div><strong>Data policy</strong><span className="integration-ready"><CheckCircle2 size={14} /> Real data only</span></div></div><div className="workspace-state-actions"><Link className="truth-primary" href="/models">Manage models</Link><Link className="truth-secondary" href="/integrations">View integrations</Link></div></section></main>;
}
