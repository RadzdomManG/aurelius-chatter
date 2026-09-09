# Data Deletion

Owners must be able to export or permanently delete a fan's conversations, memories, summaries, audit-linked records, and connected Fanvue data. Clearing memory is a destructive action and requires explicit confirmation. Deleting a fan cascades to conversations and messages, while audit records retain only the minimum operational reference required by the retention policy.

Token deletion must revoke or disconnect the Fanvue connection where the official API supports it, then remove encrypted access and refresh tokens. Rotate `TOKEN_ENCRYPTION_KEY` only with a planned migration; losing it makes encrypted token recovery impossible.