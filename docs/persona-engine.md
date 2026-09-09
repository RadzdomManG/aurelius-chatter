# Persona and Memory Engine

The prompt context is assembled in priority order: safety rules, active persona, latest fan message, recent messages, unresolved items, relevant memories, rolling summary, and approved knowledge. The context manager trims low-priority memories and summary text first. It never removes safety rules or the latest fan message.

Memory extraction and reply generation are separate validated operations. Only useful, source-backed facts are stored. Repeated facts confirm an existing normalized record; corrections replace the active value and preserve an audit trail. Deleted, invalidated, and expired records are excluded from retrieval.