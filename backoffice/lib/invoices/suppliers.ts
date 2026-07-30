// -----------------------------------------------------------------------------
// Configurable invoice-detection rules.
//
// This is the SINGLE configuration file the owner edits to tune the importer.
// Everything the filter needs — trusted suppliers and keyword lists — lives
// here so no code changes are required to adjust behaviour.
// -----------------------------------------------------------------------------

/**
 * Trusted suppliers. When an e-mail comes from one of these senders, any PDF
 * attachment is treated as a likely invoice even if the subject / filename
 * keywords do not match.
 *
 * Match is case-insensitive and by substring against the sender e-mail address
 * (and, as a fallback, the sender display name). Use a full address
 * ("billing@example.com") for a precise match or a domain ("example.com") to
 * trust every sender at that domain.
 */
export const TRUSTED_SUPPLIERS: string[] = [
  // --- Examples — replace with your real suppliers ---------------------------
  // "noreply@mollie.com",
  // "invoice@google.com",
  // "billing@vimexx.nl",
  // "factuur@kpn.com",
  // "eboekhouden.nl",
];

/**
 * Keywords that mark an e-mail SUBJECT as a likely invoice.
 * Matched case-insensitively, accent-insensitively, as substrings.
 */
export const SUBJECT_INCLUDE_KEYWORDS: string[] = [
  "factuur",
  "invoice",
  "receipt",
  "termijnfactuur",
  "tax invoice",
  "billing statement",
];

/**
 * Keywords that mark an attachment FILENAME as a likely invoice.
 */
export const FILENAME_INCLUDE_KEYWORDS: string[] = [
  "factuur",
  "invoice",
  "receipt",
  "termijnfactuur",
];

/**
 * Exclusion keywords. When the SUBJECT or FILENAME contains any of these, the
 * attachment is skipped even if an include rule matched — these clearly are not
 * business invoices (order/shipping confirmations, quotes, credit notes).
 */
export const EXCLUDE_KEYWORDS: string[] = [
  "orderbevestiging",
  "order confirmation",
  "bestelbevestiging",
  "verzendbevestiging",
  "shipping confirmation",
  "offerte",
  "quotation",
  "creditnota",
  "credit note",
];
