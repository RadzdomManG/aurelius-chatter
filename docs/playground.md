# Playground

`/playground` is an isolated simulation surface. It sends the supplied test message through the bounded memory context builder and the same validated xAI reply provider used by automation.

Playground requests do not write Fanvue records, production fans, production messages, production analytics, or long-term memory. The API returns an explicit configuration error when `XAI_API_KEY` or `XAI_MODEL` is missing; it never invents a fallback reply.

Diagnostics expose only safe structured fields: action, intent, sentiment, confidence, stage, validation, recent message count, memory count, context size, and approximate historical characters avoided. Hidden prompts and chain-of-thought are not exposed.