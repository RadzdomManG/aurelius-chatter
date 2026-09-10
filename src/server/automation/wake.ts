export async function wakeAutomationWorker(requestUrl: string, limit = 3) {
  const secret = process.env.AUTOMATION_WORKER_SECRET ?? process.env.CRON_SECRET;
  if (!secret) throw new Error("Automation worker secret is not configured.");
  const endpoint = new URL("/api/automation/worker", requestUrl);
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ limit }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Automation worker wake failed with ${response.status}.`);
  return response.json() as Promise<{ ok: boolean; processed: number }>;
}
