import { describe, it, expect } from "vitest";
import { decideAttachment, normalize } from "@/lib/invoices/filters";

const pdf = { mimeType: "application/pdf" };

describe("normalize", () => {
  it("lowercases and strips diacritics", () => {
    expect(normalize("Fáctuur")).toBe("factuur");
  });
});

describe("decideAttachment — include rules", () => {
  it("keeps when subject contains 'factuur'", () => {
    const d = decideAttachment({
      subject: "Uw factuur van mei",
      filename: "doc.pdf",
      senderEmail: "x@y.com",
      ...pdf,
    });
    expect(d.keep).toBe(true);
    expect(d.matchedRule).toContain("subject");
  });

  it("keeps when subject contains 'invoice' / 'tax invoice' / 'billing statement'", () => {
    for (const subject of ["Your invoice", "Tax invoice #12", "Billing statement"]) {
      expect(
        decideAttachment({ subject, filename: "a.pdf", senderEmail: "x@y.com", ...pdf })
          .keep,
      ).toBe(true);
    }
  });

  it("keeps when filename contains 'termijnfactuur' even if subject is neutral", () => {
    const d = decideAttachment({
      subject: "Hallo",
      filename: "termijnfactuur-q2.pdf",
      senderEmail: "x@y.com",
      ...pdf,
    });
    expect(d.keep).toBe(true);
    expect(d.matchedRule).toContain("filename");
  });
});

describe("decideAttachment — exclusion rules win", () => {
  it("skips order confirmations even if 'invoice' also appears", () => {
    const d = decideAttachment({
      subject: "Order confirmation - your invoice inside",
      filename: "invoice.pdf",
      senderEmail: "x@y.com",
      ...pdf,
    });
    expect(d.keep).toBe(false);
    expect(d.skipReason).toContain("excluded");
  });

  it.each([
    "orderbevestiging",
    "bestelbevestiging",
    "verzendbevestiging",
    "shipping confirmation",
    "offerte",
    "quotation",
    "creditnota",
    "credit note",
  ])("skips subject containing '%s'", (kw) => {
    const d = decideAttachment({
      subject: `Onderwerp ${kw} nr 1`,
      filename: "factuur.pdf",
      senderEmail: "x@y.com",
      ...pdf,
    });
    expect(d.keep).toBe(false);
  });
});

describe("decideAttachment — PDF gate & defaults", () => {
  it("rejects non-pdf mime", () => {
    const d = decideAttachment({
      subject: "factuur",
      filename: "factuur.png",
      senderEmail: "x@y.com",
      mimeType: "image/png",
    });
    expect(d.keep).toBe(false);
    expect(d.skipReason).toBe("not_pdf");
  });

  it("skips a neutral pdf with no invoice signal", () => {
    const d = decideAttachment({
      subject: "Nieuwsbrief",
      filename: "brochure.pdf",
      senderEmail: "news@random.com",
      ...pdf,
    });
    expect(d.keep).toBe(false);
    expect(d.skipReason).toBe("no_invoice_signal");
  });
});
