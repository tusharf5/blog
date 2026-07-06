const formatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC", // publishedAt is a plain YYYY-MM-DD; keep the day stable
});

/**
 * Format an ISO date string (e.g. "2019-05-12") as "May 12, 2019".
 * Returns the raw input if it can't be parsed.
 */
export function formatDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.valueOf())) {
    return isoDate;
  }
  return formatter.format(date);
}
