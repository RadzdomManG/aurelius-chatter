const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseMediaUuids(value: unknown): string[] {
  if (typeof value === "string") {
    return value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
  }
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  return [];
}

export function validateMediaUuids(mediaUuids: string[]): string | null {
  return mediaUuids.every((uuid) => UUID_PATTERN.test(uuid)) ? null : "Media attachments must be valid Fanvue media UUIDs.";
}

export function parsePriceCents(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const numberValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : Number.NaN;
}

export function validatePricedMedia(price: number | null, mediaUuids: string[], minimum: number): string | null {
  if (price === null) return null;
  if (!Number.isFinite(price)) return "PPV price must be a valid number of cents.";
  if (price < minimum) return `PPV price must be at least ${minimum} cents.`;
  if (price > 50_000) return "PPV price is capped at 50000 cents until you intentionally raise that safety limit.";
  if (mediaUuids.length === 0) return "PPV messages require at least one media attachment UUID.";
  return null;
}

export function normalizeScheduledAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}
