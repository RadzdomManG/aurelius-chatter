# Deployment

1. Create or select a Supabase project and apply migrations in `supabase/migrations`.
2. Configure Supabase Auth redirect URLs for the deployed app.
3. Import the repository into Vercel with pnpm enabled.
4. Add `.env.example` variables in Vercel. Keep token encryption, Fanvue, xAI, service-role, and cron values server-only.
5. Set `NEXT_PUBLIC_APP_URL` to the deployed origin.
6. Register `${NEXT_PUBLIC_APP_URL}/api/fanvue/oauth/callback` as the Fanvue OAuth callback.
7. Register `${NEXT_PUBLIC_APP_URL}/api/webhooks/fanvue` as the Fanvue webhook endpoint.
8. Use a Fanvue test creator to verify a signed test event and a safe inbound message before enabling automatic sending.

Free-tier serverless functions do not provide a permanent worker. Production processing must use the durable `automation_jobs` table plus a protected cron/reconciliation route and must monitor dead-letter jobs.