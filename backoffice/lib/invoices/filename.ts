// Windows- and web-safe filename construction for stored invoice PDFs.
//
// Target format:  YYYY-MM-DD - afzender - originele-bestandsnaam.pdf

// Characters forbidden on Windows (< > : " / \ | ? *) plus ASCII control chars.
// Hyphens and spaces are allowed; double spaces are collapsed separately.
const CONTROL_CHARS = String.fromCharCode(
  ...Array.from({ length: 32 }, (_, i) => i),
);
const FORBIDDEN = new RegExp(`[<>:"/\\\\|?*${CONTROL_CHARS}]`, "g");

// Names Windows reserves regardless of extension.
const RESERVED = new Set([
  "con", "prn", "aux", "nul",
  "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8", "com9",
  "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
]);

const MAX_BASENAME_LENGTH = 180; // leave headroom for extension + counter

/**
 * Cleans a single path segment (not the full filename with extension):
 * removes forbidden chars, collapses whitespace, trims leading/trailing
 * dots and spaces (Windows strips trailing dots/spaces silently).
 */
export function sanitizeSegment(value: string): string {
  const cleaned = (value ?? "")
    .replace(FORBIDDEN, " ")
    .replace(/\s+/g, " ") // collapse double spaces
    .replace(/^[.\s]+|[.\s]+$/g, "") // trim leading/trailing dots & spaces
    .trim();
  return cleaned;
}

/**
 * Formats an e-mail date as YYYY-MM-DD in UTC. Falls back to "onbekende-datum"
 * when the date is missing or invalid.
 */
export function formatDatePart(date: Date | null | undefined): string {
  if (!date || Number.isNaN(date.getTime())) return "onbekende-datum";
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Derives a human-friendly sender label from a name/email, sanitised.
 */
export function formatSenderPart(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const raw =
    (name && name.trim()) || (email && email.trim()) || "onbekende-afzender";
  const cleaned = sanitizeSegment(raw);
  return cleaned || "onbekende-afzender";
}

function splitExtension(filename: string): { base: string; ext: string } {
  const idx = filename.lastIndexOf(".");
  if (idx <= 0 || idx === filename.length - 1) {
    return { base: filename, ext: "" };
  }
  return { base: filename.slice(0, idx), ext: filename.slice(idx) };
}

export interface BuildFilenameInput {
  emailDate: Date | null | undefined;
  senderName?: string | null;
  senderEmail?: string | null;
  originalFilename: string;
}

/**
 * Builds the base stored filename (no conflict counter yet) in the format:
 *   "YYYY-MM-DD - afzender - originele-bestandsnaam.pdf"
 *
 * The result is guaranteed to be Windows/web-safe and length-limited.
 */
export function buildStoredFilename(input: BuildFilenameInput): string {
  const datePart = formatDatePart(input.emailDate ?? null);
  const senderPart = formatSenderPart(input.senderName, input.senderEmail);

  const original = input.originalFilename?.trim() || "factuur.pdf";
  let { base } = splitExtension(original);
  base = sanitizeSegment(base) || "factuur";
  // Force a .pdf extension: these are always PDF invoices.
  const ext = ".pdf";

  let full = `${datePart} - ${senderPart} - ${base}`;
  // Guard against reserved device names on the base name.
  if (RESERVED.has(full.toLowerCase())) {
    full = `_${full}`;
  }
  // Enforce max length on the base part (before extension).
  if (full.length > MAX_BASENAME_LENGTH) {
    full = full.slice(0, MAX_BASENAME_LENGTH).replace(/[.\s]+$/g, "");
  }
  return `${full}${ext}`;
}

/**
 * Given a desired filename and a set of names already used in the same folder,
 * returns a unique filename by appending " (n)" before the extension when a
 * conflict exists.
 */
export function ensureUniqueFilename(
  desired: string,
  existing: Set<string> | string[],
): string {
  const taken =
    existing instanceof Set ? existing : new Set(existing.map((n) => n));
  if (!taken.has(desired)) return desired;

  const { base, ext } = splitExtension(desired);
  let counter = 2;
  let candidate = `${base} (${counter})${ext}`;
  while (taken.has(candidate)) {
    counter += 1;
    candidate = `${base} (${counter})${ext}`;
  }
  return candidate;
}
