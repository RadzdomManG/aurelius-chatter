# Troubleshooting

**OAuth state expired:** restart the connection flow. The state and PKCE verifier expire after ten minutes and are not accepted from the browser URL.

**Fanvue 401:** refresh the encrypted token pair once, then require reauthorization if refresh fails. Never retry a 4xx indefinitely.

**Fanvue 429:** honor `Retry-After`, reschedule the durable job, and avoid concurrent work for the same conversation.

**Webhook rejected:** verify the exact raw body, signing secret, timestamp tolerance, and `X-Fanvue-Signature` header. Do not parse and reserialize the body before verification.

**No AI draft:** confirm `XAI_API_KEY` and `XAI_MODEL` are configured and that the model supports the requested JSON contract. The app refuses to silently fall back to an invented model ID.