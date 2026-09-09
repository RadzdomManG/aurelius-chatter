# Security Baseline

- Supabase RLS is enabled on tenant tables and policies use organization membership.
- OAuth state and PKCE verifier are short-lived, HTTP-only, SameSite cookies during the callback exchange.
- Fanvue tokens are server-only and are intended to be stored encrypted with AES-256-GCM using `TOKEN_ENCRYPTION_KEY`.
- Webhook verification uses the raw request body, `X-Fanvue-Signature`, timestamp tolerance, HMAC-SHA256, and timing-safe comparison.
- AI output is treated as untrusted until it passes Zod validation and policy checks.
- Fan messages are untrusted content and cannot override system rules.
- Memory values reject credentials, payment-card data, government IDs, precise addresses, and adult-sensitive facts when adult status is unclear.
- Secrets must use Vercel encrypted environment variables and must never use `NEXT_PUBLIC_*` names.

Before production, add rate limiting, audit persistence in the webhook/job service, secret rotation runbooks, and Supabase advisor review.