import { describe, it, expect, vi } from "vitest";
import { runPipeline, type Candidate, type PipelineDeps } from "@/lib/invoices/pipeline";
import { sha256Hex } from "@/lib/invoices/hash";

function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    gmailMessageId: "m1",
    attachmentId: "a1",
    subject: "Uw factuur",
    senderName: "KPN",
    senderEmail: "factuur@kpn.com",
    emailDate: new Date("2025-05-01T00:00:00Z"),
    originalFilename: "factuur.pdf",
    mimeType: "application/pdf",
    ...overrides,
  };
}

function baseDeps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    downloadBytes: async (c) => Buffer.from(`bytes-${c.attachmentId}`),
    uploadFile: async () => {},
    persistStored: async () => {},
    buildStoragePath: (name) => `invoices/user/2025/Q2/${name}`,
    existingHashes: [],
    ...overrides,
  };
}

describe("runPipeline", () => {
  it("stores a new invoice", async () => {
    const { summary, outcomes } = await runPipeline([candidate()], baseDeps());
    expect(summary.new_files).toBe(1);
    expect(summary.duplicate_files).toBe(0);
    expect(outcomes[0].status).toBe("stored");
  });

  it("skips non-invoice attachments", async () => {
    const c = candidate({ subject: "Nieuwsbrief", originalFilename: "brochure.pdf", senderEmail: "n@x.com" });
    const { summary, outcomes } = await runPipeline([c], baseDeps());
    expect(summary.skipped_files).toBe(1);
    expect(outcomes[0].status).toBe("skipped");
  });

  it("skips excluded attachments (order confirmation)", async () => {
    const c = candidate({ subject: "Orderbevestiging 123" });
    const { summary } = await runPipeline([c], baseDeps());
    expect(summary.skipped_files).toBe(1);
  });

  it("detects duplicates within the same run (same bytes)", async () => {
    const c1 = candidate({ attachmentId: "a1" });
    const c2 = candidate({ attachmentId: "a1", gmailMessageId: "m2" }); // same bytes -> same hash
    const { summary } = await runPipeline([c1, c2], baseDeps());
    expect(summary.new_files).toBe(1);
    expect(summary.duplicate_files).toBe(1);
  });

  it("is idempotent across runs (existing hash => duplicate, not re-stored)", async () => {
    const c = candidate();
    const bytes = Buffer.from(`bytes-${c.attachmentId}`);
    const persistStored = vi.fn(async () => {});
    const { summary } = await runPipeline(
      [c],
      baseDeps({ existingHashes: [sha256Hex(bytes)], persistStored }),
    );
    expect(summary.new_files).toBe(0);
    expect(summary.duplicate_files).toBe(1);
    expect(persistStored).not.toHaveBeenCalled();
  });

  it("continues after a per-attachment error (partial failure)", async () => {
    const good1 = candidate({ attachmentId: "g1" });
    const bad = candidate({ attachmentId: "bad" });
    const good2 = candidate({ attachmentId: "g2" });
    const deps = baseDeps({
      downloadBytes: async (c) => {
        if (c.attachmentId === "bad") throw new Error("network boom");
        return Buffer.from(`bytes-${c.attachmentId}`);
      },
    });
    const { summary, outcomes } = await runPipeline([good1, bad, good2], deps);
    expect(summary.new_files).toBe(2);
    expect(summary.error_count).toBe(1);
    expect(outcomes.map((o) => o.status)).toEqual(["stored", "error", "stored"]);
  });

  it("appends a counter when filenames collide but bytes differ", async () => {
    // Same sender/date/name => same desired filename, but different bytes.
    const c1 = candidate({ attachmentId: "x1" });
    const c2 = candidate({ attachmentId: "x2" });
    const paths: string[] = [];
    const deps = baseDeps({
      uploadFile: async (path) => {
        paths.push(path);
      },
    });
    const { summary } = await runPipeline([c1, c2], deps);
    expect(summary.new_files).toBe(2);
    expect(paths[0]).not.toBe(paths[1]);
    expect(paths[1]).toContain("(2)");
  });
});
