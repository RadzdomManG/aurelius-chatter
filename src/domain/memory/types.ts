export const memoryCategories = ["identity", "preference", "relationship", "interest", "boundary", "sales", "support", "conversation"] as const;
export type MemoryCategory = (typeof memoryCategories)[number];

export const memoryStatuses = ["confirmed", "inferred", "outdated", "invalidated", "deleted"] as const;
export type MemoryStatus = (typeof memoryStatuses)[number];

export const memorySensitivities = ["normal", "sensitive", "restricted"] as const;
export type MemorySensitivity = (typeof memorySensitivities)[number];

export type MemoryRecord = {
  id: string;
  organizationId: string;
  creatorProfileId: string;
  fanId: string;
  category: MemoryCategory;
  memoryKey: string;
  memoryValue: string;
  confidence: number;
  status: MemoryStatus;
  sensitivity: MemorySensitivity;
  sourceMessageUuid?: string;
  firstObservedAt: string;
  lastConfirmedAt?: string;
  expiresAt?: string;
};

export type MemoryOperation = {
  operation: "create" | "update" | "confirm" | "invalidate" | "none";
  category: MemoryCategory;
  key: string;
  value: string;
  confidence: number;
  sourceMessageUuid: string;
  reason: string;
};

export type UnresolvedItem = { type: "question" | "promise" | "follow_up"; text: string; status: "open" | "completed" | "cancelled" };

export type MemoryContext = {
  safetyRules: string;
  persona: string;
  latestFanMessage: string;
  recentMessages: string[];
  unresolvedItems: UnresolvedItem[];
  relevantMemories: MemoryRecord[];
  rollingSummary: string;
  approvedKnowledge: string;
};