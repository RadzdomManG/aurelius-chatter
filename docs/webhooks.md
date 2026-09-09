# Webhooks

New integrations should use the official `creator.*` event family. Relevant message events include `creator.message.received` and `creator.message.sent`; outbound events must never trigger an inbound reply loop. Events are at-least-once, so the unique external event identity and external message UUID are required for idempotency.

The webhook route preserves raw bytes for signature verification, rejects stale or invalid signatures, parses only after verification, sanitizes payloads, and should persist the event before returning a success response. The current route accepts verified events and exposes only event identity in its response; durable persistence and job enqueueing belong in the server-only Supabase service.