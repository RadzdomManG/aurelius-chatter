import { WorkspacePlaceholder } from "@/app/workspace-placeholder";

export default function SettingsPage() {
  return <WorkspacePlaceholder eyebrow="SETTINGS" title="Workspace setup required." description="Organization, team roles, emergency stop, retention, and integration settings become available after a Supabase workspace is configured." actionHref="/login" actionLabel="Sign in" />;
}
