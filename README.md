# Aurelius Chatter

Aurelius Chatter is a multi-tenant, AI-assisted Fanvue conversation desk. The first vertical slice includes the inbox experience, tenant-safe fan-memory schema, bounded context assembly, memory safety rules, OAuth PKCE boundaries, signed webhook verification, and validated xAI contracts.

# Aurelius Chatter

Aurelius Chatter is a multi-tenant, AI-assisted Fanvue conversation desk. Production screens are data-driven and show explicit empty or setup states when integrations have not supplied real data.

## Local development

```bash
pnpm install
copy .env.example .env.local
pnpm dev
```

Useful checks are `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`.

## Current vertical slice

- Supabase session refresh and protected application routes
- Tenant-scoped schema with RLS, encrypted Fanvue token storage, and idempotent webhook records
- Fanvue OAuth PKCE boundaries and current `creator.*` webhook envelope handling
- Bounded memory context assembly and validated xAI reply decisions
- Isolated `/playground` using the same context and xAI provider path without sending to Fanvue
- Truthful dashboard, integration health, analytics, and model empty states

External integrations remain in `Setup required` state until server-only environment variables are configured. See [docs/fanvue-setup.md](docs/fanvue-setup.md), [docs/security.md](docs/security.md), and [docs/deployment.md](docs/deployment.md).
# or
