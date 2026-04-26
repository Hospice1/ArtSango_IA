export function formatShortDate(value: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function extractFirstPrice(value: string): number | null {
  const sanitized = value.replace(/\s+/g, " ").replace(/,/g, ".");
  const match = sanitized.match(/\d+(?:\.\d+)?/);

  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

