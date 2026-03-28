// =============================================================================
// EMP CLOUD — Working Days Calculator (#1048)
// Counts weekdays between two dates, excluding specified holidays.
// =============================================================================

/**
 * Calculate the number of working days between startDate and endDate (inclusive),
 * excluding weekends (Saturday & Sunday) and the provided holiday dates.
 *
 * @param startDate - Start of the range (inclusive)
 * @param endDate   - End of the range (inclusive)
 * @param holidays  - Array of holiday dates (as Date objects or ISO strings)
 * @returns Number of working days
 */
export function calculateWorkingDays(
  startDate: Date | string,
  endDate: Date | string,
  holidays: (Date | string)[] = [],
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Normalize to midnight
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);

  if (end < start) return 0;

  // Build a Set of holiday date strings for O(1) lookup
  const holidaySet = new Set<string>(
    holidays.map((h) => {
      const d = new Date(h);
      d.setHours(0, 0, 0, 0);
      return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
    }),
  );

  let workingDays = 0;
  const current = new Date(start);

  while (current <= end) {
    const dayOfWeek = current.getDay(); // 0 = Sun, 6 = Sat
    const dateKey = current.toISOString().slice(0, 10);

    if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidaySet.has(dateKey)) {
      workingDays++;
    }

    current.setDate(current.getDate() + 1);
  }

  return workingDays;
}
