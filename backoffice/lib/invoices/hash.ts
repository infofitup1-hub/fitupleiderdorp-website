import { createHash } from "node:crypto";

/**
 * Computes the SHA-256 hex digest of a PDF's bytes. Two attachments with the
 * same digest are byte-identical and therefore duplicates.
 */
export function sha256Hex(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * In-memory duplicate detector used within a single import run to catch
 * duplicates that arrive in the same batch before they hit the database.
 * The database unique constraint (user_id + sha256_hash) is the durable guard.
 */
export class DuplicateTracker {
  private readonly seen: Set<string>;

  constructor(initial: Iterable<string> = []) {
    this.seen = new Set(initial);
  }

  /**
   * Returns true if the hash was already seen. Registers it either way.
   */
  isDuplicate(hash: string): boolean {
    if (this.seen.has(hash)) return true;
    this.seen.add(hash);
    return false;
  }

  has(hash: string): boolean {
    return this.seen.has(hash);
  }

  add(hash: string): void {
    this.seen.add(hash);
  }
}
