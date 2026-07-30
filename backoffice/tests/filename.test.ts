import { describe, it, expect } from "vitest";
import {
  sanitizeSegment,
  buildStoredFilename,
  ensureUniqueFilename,
  formatDatePart,
  formatSenderPart,
} from "@/lib/invoices/filename";

describe("sanitizeSegment", () => {
  it("removes Windows-forbidden characters", () => {
    expect(sanitizeSegment('a<b>c:d"e/f\\g|h?i*j')).toBe("a b c d e f g h i j");
  });

  it("collapses double spaces", () => {
    expect(sanitizeSegment("foo    bar")).toBe("foo bar");
  });

  it("trims leading/trailing dots and spaces", () => {
    expect(sanitizeSegment("  ..name..  ")).toBe("name");
  });

  it("keeps hyphens and unicode letters", () => {
    expect(sanitizeSegment("Café-Restaurant")).toBe("Café-Restaurant");
  });
});

describe("formatDatePart", () => {
  it("formats a valid date in UTC", () => {
    expect(formatDatePart(new Date("2025-04-09T22:00:00.000Z"))).toBe(
      "2025-04-09",
    );
  });
  it("falls back for missing/invalid date", () => {
    expect(formatDatePart(null)).toBe("onbekende-datum");
    expect(formatDatePart(new Date("not-a-date"))).toBe("onbekende-datum");
  });
});

describe("formatSenderPart", () => {
  it("prefers name over email (trailing dot stripped for Windows safety)", () => {
    expect(formatSenderPart("Mollie B.V.", "noreply@mollie.com")).toBe(
      "Mollie B.V",
    );
  });
  it("falls back to email then placeholder", () => {
    expect(formatSenderPart(null, "billing@x.com")).toBe("billing@x.com");
    expect(formatSenderPart(null, null)).toBe("onbekende-afzender");
  });
});

describe("buildStoredFilename", () => {
  it("produces the YYYY-MM-DD - afzender - naam.pdf format", () => {
    const name = buildStoredFilename({
      emailDate: new Date("2025-05-12T08:00:00.000Z"),
      senderName: "KPN",
      senderEmail: "factuur@kpn.com",
      originalFilename: "invoice_2025_05.pdf",
    });
    expect(name).toBe("2025-05-12 - KPN - invoice_2025_05.pdf");
  });

  it("always forces a .pdf extension", () => {
    const name = buildStoredFilename({
      emailDate: new Date("2025-05-12T08:00:00.000Z"),
      senderName: "Acme",
      senderEmail: "a@acme.com",
      originalFilename: "document",
    });
    expect(name.endsWith(".pdf")).toBe(true);
  });

  it("sanitises forbidden characters coming from the original filename", () => {
    const name = buildStoredFilename({
      emailDate: new Date("2025-05-12T08:00:00.000Z"),
      senderName: "Acme/Corp",
      senderEmail: "a@acme.com",
      originalFilename: "fac:tuur*?.pdf",
    });
    expect(name).not.toMatch(/[<>:"/\\|?*]/);
    expect(name).toBe("2025-05-12 - Acme Corp - fac tuur.pdf");
  });

  it("limits overall length", () => {
    const long = "x".repeat(500);
    const name = buildStoredFilename({
      emailDate: new Date("2025-05-12T08:00:00.000Z"),
      senderName: "Acme",
      senderEmail: "a@acme.com",
      originalFilename: `${long}.pdf`,
    });
    expect(name.length).toBeLessThanOrEqual(185);
    expect(name.endsWith(".pdf")).toBe(true);
  });
});

describe("ensureUniqueFilename", () => {
  it("returns the same name when there is no conflict", () => {
    expect(ensureUniqueFilename("a.pdf", [])).toBe("a.pdf");
  });

  it("appends a counter on conflict", () => {
    expect(ensureUniqueFilename("a.pdf", ["a.pdf"])).toBe("a (2).pdf");
  });

  it("skips already-taken counters", () => {
    expect(ensureUniqueFilename("a.pdf", ["a.pdf", "a (2).pdf"])).toBe(
      "a (3).pdf",
    );
  });
});
