// Quarter boundary helpers. All boundaries are computed in UTC so that an
// import produces identical results regardless of the server timezone.

export interface DateRange {
  // Inclusive start of the quarter (00:00:00.000 UTC on the first day).
  start: Date;
  // Exclusive end of the quarter (00:00:00.000 UTC on the first day of the
  // following quarter). Using an exclusive end avoids off-by-one errors on
  // the final millisecond of the quarter.
  endExclusive: Date;
}

const QUARTER_START_MONTH: Record<number, number> = {
  1: 0, // January
  2: 3, // April
  3: 6, // July
  4: 9, // October
};

export function isValidYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

export function isValidQuarter(quarter: number): boolean {
  return quarter === 1 || quarter === 2 || quarter === 3 || quarter === 4;
}

/**
 * Returns the [start, endExclusive) UTC range for the given year/quarter.
 * Throws on invalid input so callers never operate on a bogus range.
 */
export function getQuarterRange(year: number, quarter: number): DateRange {
  if (!isValidYear(year)) {
    throw new RangeError(`Invalid year: ${year}`);
  }
  if (!isValidQuarter(quarter)) {
    throw new RangeError(`Invalid quarter: ${quarter}`);
  }

  const startMonth = QUARTER_START_MONTH[quarter];
  const start = new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0));
  // Adding 3 months rolls the year over automatically for Q4.
  const endExclusive = new Date(Date.UTC(year, startMonth + 3, 1, 0, 0, 0, 0));

  return { start, endExclusive };
}

/**
 * Gmail's `after:` / `before:` operators take a date (interpreted in the
 * account's timezone) and are day-granular. We format as YYYY/MM/DD and use
 * `before:` on the first day of the next quarter (exclusive), matching the
 * exclusive endExclusive semantics above.
 */
export function toGmailDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}/${m}/${day}`;
}

/**
 * True when the given instant falls inside the quarter's [start, endExclusive).
 */
export function isWithinQuarter(
  date: Date,
  year: number,
  quarter: number,
): boolean {
  const { start, endExclusive } = getQuarterRange(year, quarter);
  const t = date.getTime();
  return t >= start.getTime() && t < endExclusive.getTime();
}
