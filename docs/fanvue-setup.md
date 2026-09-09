# Fanvue Setup

The application uses the official OAuth 2.0 authorization-code flow with PKCE.

Local callback URL: `http://localhost:3000/api/fanvue/oauth/callback`

The deployed callback URL is `${NEXT_PUBLIC_APP_URL}/api/fanvue/oauth/callback`.

Webhook URL: `${NEXT_PUBLIC_APP_URL}/api/webhooks/fanvue`

The current default authorization scopes are `openid offline_access offline read:self read:chat write:chat`. Add creator-event scopes only after confirming the current Fanvue event catalog and the permissions selected in the Fanvue Builder area. Store a space-separated override in `FANVUE_SCOPES` rather than changing source code.

Required server secrets are documented in `.env.example`. Put them in Vercel encrypted environment variables. Never put client secrets, webhook secrets, encryption keys, refresh tokens, or the xAI key in a `NEXT_PUBLIC_*` variable.

Live OAuth, webhook delivery, and sending remain unverified until a Fanvue test creator and credentials are configured.