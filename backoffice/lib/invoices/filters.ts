import type { FilterDecision } from "@/types";
import {
  EXCLUDE_KEYWORDS,
  FILENAME_INCLUDE_KEYWORDS,
  SUBJECT_INCLUDE_KEYWORDS,
  TRUSTED_SUPPLIERS,
} from "./suppliers";

export interface FilterInput {
  subject: string | null | undefined;
  filename: string | null | undefined;
  senderEmail: string | null | undefined;
  senderName?: string | null | undefined;
  mimeType?: string | null | undefined;
}

/**
 * Normalises a string for keyword matching:
 * lower-cases and strips diacritics so "factuur" matches "Factuur"/"fáctuur".
 */
export function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritical marks
    .toLowerCase()
    .trim();
}

function containsAny(haystack: string, needles: string[]): string | null {
  for (const needle of needles) {
    const n = normalize(needle);
    if (n && haystack.includes(n)) return needle;
  }
  return null;
}

/**
 * True when the sender matches the configurable trusted-supplier list.
 * Matches against both the e-mail address and the display name.
 */
export function isTrustedSupplier(
  senderEmail: string | null | undefined,
  senderName?: string | null | undefined,
): boolean {
  const email = normalize(senderEmail);
  const name = normalize(senderName);
  for (const supplier of TRUSTED_SUPPLIERS) {
    const s = normalize(supplier);
    if (!s) continue;
    if (email.includes(s) || name.includes(s)) return true;
  }
  return false;
}

/**
 * Decides whether a PDF attachment should be kept as a likely business invoice.
 *
 * Rules (in order):
 *  1. Must be a PDF (by mime type when provided, otherwise by extension).
 *  2. Exclusion keywords in subject/filename => skip (wins over any include).
 *  3. Keep when ANY of:
 *       - subject contains an invoice keyword;
 *       - filename contains an invoice keyword;
 *       - sender is a trusted supplier.
 *  4. Otherwise skip.
 */
export function decideAttachment(input: FilterInput): FilterDecision {
  const subject = normalize(input.subject);
  const filename = normalize(input.filename);
  const mime = normalize(input.mimeType);

  // 1. PDF gate.
  const looksPdf =
    mime === "application/pdf" ||
    (!mime && filename.endsWith(".pdf")) ||
    (mime.length > 0 && mime.includes("pdf")) ||
    filename.endsWith(".pdf");
  if (!looksPdf) {
    return { keep: false, skipReason: "not_pdf" };
  }

  // 2. Exclusions win.
  const excludedBySubject = containsAny(subject, EXCLUDE_KEYWORDS);
  if (excludedBySubject) {
    return { keep: false, skipReason: `excluded_subject:${excludedBySubject}` };
  }
  const excludedByFilename = containsAny(filename, EXCLUDE_KEYWORDS);
  if (excludedByFilename) {
    return { keep: false, skipReason: `excluded_filename:${excludedByFilename}` };
  }

  // 3. Include rules.
  const subjectMatch = containsAny(subject, SUBJECT_INCLUDE_KEYWORDS);
  if (subjectMatch) {
    return { keep: true, matchedRule: `subject:${subjectMatch}` };
  }
  const filenameMatch = containsAny(filename, FILENAME_INCLUDE_KEYWORDS);
  if (filenameMatch) {
    return { keep: true, matchedRule: `filename:${filenameMatch}` };
  }
  if (isTrustedSupplier(input.senderEmail, input.senderName)) {
    return { keep: true, matchedRule: "trusted_supplier" };
  }

  // 4. Default: not recognised as an invoice.
  return { keep: false, skipReason: "no_invoice_signal" };
}
