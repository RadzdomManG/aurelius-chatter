import { WorkspacePlaceholder } from "@/app/workspace-placeholder";

export default function AnalyticsPage() {
  return <WorkspacePlaceholder eyebrow="ANALYTICS" title="No analytics data yet." description="Analytics will appear after confirmed Fanvue activity is received. No estimates or synthetic activity are shown here." actionHref="/integrations" actionLabel="Check connection" />;
}
