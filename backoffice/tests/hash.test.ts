import { describe, it, expect } from "vitest";
import { sha256Hex, DuplicateTracker } from "@/lib/invoices/hash";

describe("sha256Hex", () => {
  it("computes the known SHA-256 of an empty buffer", () => {
    expect(sha256Hex(Buffer.from(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("computes the known SHA-256 of 'abc'", () => {
    expect(sha256Hex(Buffer.from("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("produces different digests for different bytes", () => {
    expect(sha256Hex(Buffer.from("a"))).not.toBe(sha256Hex(Buffer.from("b")));
  });

  it("is stable for identical bytes (duplicate detection)", () => {
    const a = sha256Hex(Buffer.from("same-invoice-bytes"));
    const b = sha256Hex(Buffer.from("same-invoice-bytes"));
    expect(a).toBe(b);
  });
});

describe("DuplicateTracker", () => {
  it("flags a repeated hash as duplicate", () => {
    const t = new DuplicateTracker();
    expect(t.isDuplicate("h1")).toBe(false);
    expect(t.isDuplicate("h1")).toBe(true);
    expect(t.isDuplicate("h2")).toBe(false);
  });

  it("seeds from existing hashes (already-stored invoices)", () => {
    const t = new DuplicateTracker(["existing"]);
    expect(t.isDuplicate("existing")).toBe(true);
  });
});
