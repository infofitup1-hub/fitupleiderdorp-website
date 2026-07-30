import { describe, it, expect } from "vitest";
import {
  getQuarterRange,
  isWithinQuarter,
  isValidQuarter,
  isValidYear,
  toGmailDate,
} from "@/lib/invoices/quarter";

describe("getQuarterRange", () => {
  it("Q1 spans Jan 1 -> Apr 1 (exclusive)", () => {
    const { start, endExclusive } = getQuarterRange(2025, 1);
    expect(start.toISOString()).toBe("2025-01-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2025-04-01T00:00:00.000Z");
  });

  it("Q2 spans Apr 1 -> Jul 1", () => {
    const { start, endExclusive } = getQuarterRange(2025, 2);
    expect(start.toISOString()).toBe("2025-04-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2025-07-01T00:00:00.000Z");
  });

  it("Q3 spans Jul 1 -> Oct 1", () => {
    const { start, endExclusive } = getQuarterRange(2025, 3);
    expect(start.toISOString()).toBe("2025-07-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2025-10-01T00:00:00.000Z");
  });

  it("Q4 rolls over into the next year (Oct 1 -> Jan 1)", () => {
    const { start, endExclusive } = getQuarterRange(2025, 4);
    expect(start.toISOString()).toBe("2025-10-01T00:00:00.000Z");
    expect(endExclusive.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("throws on invalid quarter/year", () => {
    expect(() => getQuarterRange(2025, 0)).toThrow();
    expect(() => getQuarterRange(2025, 5)).toThrow();
    expect(() => getQuarterRange(1999, 1)).toThrow();
  });
});

describe("isWithinQuarter (boundary handling)", () => {
  it("includes the first millisecond of the quarter", () => {
    expect(isWithinQuarter(new Date("2025-01-01T00:00:00.000Z"), 2025, 1)).toBe(
      true,
    );
  });

  it("includes the last millisecond of the quarter", () => {
    expect(isWithinQuarter(new Date("2025-03-31T23:59:59.999Z"), 2025, 1)).toBe(
      true,
    );
  });

  it("excludes the first millisecond of the next quarter", () => {
    expect(isWithinQuarter(new Date("2025-04-01T00:00:00.000Z"), 2025, 1)).toBe(
      false,
    );
  });

  it("excludes the last millisecond of the previous quarter", () => {
    expect(isWithinQuarter(new Date("2024-12-31T23:59:59.999Z"), 2025, 1)).toBe(
      false,
    );
  });
});

describe("toGmailDate", () => {
  it("formats as YYYY/MM/DD in UTC", () => {
    expect(toGmailDate(new Date("2025-04-01T00:00:00.000Z"))).toBe("2025/04/01");
    expect(toGmailDate(new Date("2025-12-09T10:00:00.000Z"))).toBe("2025/12/09");
  });
});

describe("validators", () => {
  it("isValidQuarter", () => {
    expect(isValidQuarter(1)).toBe(true);
    expect(isValidQuarter(4)).toBe(true);
    expect(isValidQuarter(0)).toBe(false);
    expect(isValidQuarter(5)).toBe(false);
  });
  it("isValidYear", () => {
    expect(isValidYear(2025)).toBe(true);
    expect(isValidYear(1999)).toBe(false);
    expect(isValidYear(2101)).toBe(false);
  });
});
