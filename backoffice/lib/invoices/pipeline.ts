import type { AttachmentOutcome, ImportSummary } from "@/types";
import { decideAttachment } from "./filters";
import { sha256Hex, DuplicateTracker } from "./hash";
import {
  buildStoredFilename,
  ensureUniqueFilename,
} from "./filename";

// A single attachment candidate discovered in a mailbox.
export interface Candidate {
  gmailMessageId: string;
  attachmentId: string;
  subject: string | null;
  senderName: string | null;
  senderEmail: string | null;
  emailDate: Date | null;
  originalFilename: string;
  mimeType: string;
}

// The record we hand to the persistence layer for a successfully stored file.
export interface StoredRecord {
  candidate: Candidate;
  storedFilename: string;
  storagePath: string;
  sha256Hash: string;
  fileSize: number;
}

export interface PipelineDeps {
  // Download the raw PDF bytes for a candidate.
  downloadBytes: (candidate: Candidate) => Promise<Buffer>;
  // Upload bytes to storage at the given path. Returns the final path used.
  uploadFile: (path: string, bytes: Buffer, contentType: string) => Promise<void>;
  // Persist an invoice row. Should be idempotent-friendly (unique constraints).
  persistStored: (record: StoredRecord) => Promise<void>;
  // Record a skipped attachment (optional bookkeeping).
  persistSkipped?: (candidate: Candidate, reason: string) => Promise<void>;
  // Record a duplicate attachment (optional bookkeeping).
  persistDuplicate?: (candidate: Candidate, hash: string) => Promise<void>;
  // Build the storage path for a stored file.
  buildStoragePath: (storedFilename: string) => string;
  // Hashes already stored for this user (durable dedup across runs).
  existingHashes: Iterable<string>;
  // Filenames already used in the target folder (for conflict counters).
  existingFilenames?: Iterable<string>;
  // Optional per-event error sink for logging (never receives secrets).
  onError?: (candidate: Candidate, error: unknown) => void;
}

/**
 * Core import orchestrator. Pure with respect to I/O (all side effects are
 * injected), which makes partial-failure behaviour unit-testable.
 *
 * Guarantees:
 *  - idempotent: attachments whose hash already exists are counted as duplicates
 *    and never re-stored;
 *  - resilient: one attachment throwing does not abort the run — it is counted
 *    as an error and processing continues;
 *  - controlled ordering: attachments are processed sequentially.
 */
export async function runPipeline(
  candidates: Candidate[],
  deps: PipelineDeps,
): Promise<{ summary: ImportSummary; outcomes: AttachmentOutcome[] }> {
  const summary: ImportSummary = {
    new_files: 0,
    duplicate_files: 0,
    skipped_files: 0,
    error_count: 0,
  };
  const outcomes: AttachmentOutcome[] = [];

  const dupes = new DuplicateTracker(deps.existingHashes);
  const usedNames = new Set<string>(deps.existingFilenames ?? []);

  for (const candidate of candidates) {
    try {
      // 1. Filter: is this a likely business invoice?
      const decision = decideAttachment({
        subject: candidate.subject,
        filename: candidate.originalFilename,
        senderEmail: candidate.senderEmail,
        senderName: candidate.senderName,
        mimeType: candidate.mimeType,
      });
      if (!decision.keep) {
        summary.skipped_files += 1;
        outcomes.push({ status: "skipped", skipReason: decision.skipReason });
        await deps.persistSkipped?.(candidate, decision.skipReason ?? "skipped");
        continue;
      }

      // 2. Download bytes + hash.
      const bytes = await deps.downloadBytes(candidate);
      const hash = sha256Hex(bytes);

      // 3. Duplicate detection (within-run + across-run).
      if (dupes.has(hash)) {
        summary.duplicate_files += 1;
        outcomes.push({ status: "duplicate" });
        await deps.persistDuplicate?.(candidate, hash);
        continue;
      }
      dupes.add(hash);

      // 4. Build a unique, Windows/web-safe filename + path.
      const desired = buildStoredFilename({
        emailDate: candidate.emailDate,
        senderName: candidate.senderName,
        senderEmail: candidate.senderEmail,
        originalFilename: candidate.originalFilename,
      });
      const storedFilename = ensureUniqueFilename(desired, usedNames);
      usedNames.add(storedFilename);
      const storagePath = deps.buildStoragePath(storedFilename);

      // 5. Upload + persist.
      await deps.uploadFile(storagePath, bytes, "application/pdf");
      await deps.persistStored({
        candidate,
        storedFilename,
        storagePath,
        sha256Hash: hash,
        fileSize: bytes.length,
      });

      summary.new_files += 1;
      outcomes.push({ status: "stored" });
    } catch (err) {
      // One failure must not stop the whole import.
      summary.error_count += 1;
      outcomes.push({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
      deps.onError?.(candidate, err);
    }
  }

  return { summary, outcomes };
}
