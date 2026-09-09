export type SummaryCheckpoint = { lastSummarizedMessageUuid?: string; messagesIncluded: number; summary: string; updatedAt: string };
export type SummaryTriggerInput = { newMessages: number; newCharacters: number; stageChanged: boolean; beforeArchive: boolean; thresholdMessages?: number; thresholdCharacters?: number };

export function shouldRefreshSummary(input: SummaryTriggerInput): boolean {
  return input.stageChanged || input.beforeArchive || input.newMessages >= (input.thresholdMessages ?? 20) || input.newCharacters >= (input.thresholdCharacters ?? 6000);
}

export function createSummaryCheckpoint(previous: SummaryCheckpoint | undefined, summary: string, lastMessageUuid: string, messagesIncluded: number, now = new Date().toISOString()): SummaryCheckpoint {
  return { lastSummarizedMessageUuid: lastMessageUuid, messagesIncluded: (previous?.messagesIncluded ?? 0) + messagesIncluded, summary: summary.trim().slice(0, 2400), updatedAt: now };
}