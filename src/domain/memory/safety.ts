const sensitivePatterns = [
  /\b(password|passcode|secret|api[ _-]?key|token)\b/i,
  /\b(card|credit|debit)\s*(number|details?)\b/i,
  /\b(ssn|social security|government id|passport|driver'?s license)\b/i,
  /\b(address|home address)\s*(is|:)?\s*\d/i,
];

export function isUnsafeMemoryValue(value: string, adultStatusConfirmed: boolean): boolean {
  if (sensitivePatterns.some((pattern) => pattern.test(value))) return true;
  if (!adultStatusConfirmed && /\b(sexual|fetish|explicit|nude|turn[- ]?on)\b/i.test(value)) return true;
  return false;
}

export function normalizeMemoryKey(key: string): string {
  return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}