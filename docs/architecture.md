# Aurelius Chatter Architecture

```mermaid
flowchart LR
  Fanvue[Fanvue creator events] --> Webhook[Signed Node webhook route]
  Webhook --> Events[(Webhook events)]
  Events --> Jobs[(Durable automation jobs)]
  Jobs --> Context[Bounded context manager]
  Context --> AI[xAI provider]
  AI --> Decision[Validated reply decision]
  AI --> Extraction[Validated memory extraction]
  Extraction --> Memories[(Per-fan memories)]
  Context --> Summary[(Conversation summary checkpoint)]
  Decision --> Draft[Draft or policy-gated send]
  Draft --> Fanvue
  Memories --> Inbox[Realtime inbox Memory tab]
  Summary --> Inbox
```

Every fan memory is owned by an organization, creator profile, and fan. The AI context is assembled from safety rules, the active persona, the latest fan message, a bounded recent-message window, unresolved items, relevant active memories, the rolling summary, and approved knowledge. Complete lifetime history is never sent to the model during normal reply generation.

The webhook route verifies the raw request body before parsing. Event persistence and job enqueueing belong in the privileged server service; the route must acknowledge after durable persistence and never expose the raw payload to ordinary workspace users.