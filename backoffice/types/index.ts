export * from "./database";

// Selection of which mailbox(es) to import from.
// Either the literal "all" or a specific gmail_connection id.
export type MailboxSelection = "all" | string;

// Result of deciding whether a single PDF attachment should be kept.
export interface FilterDecision {
  keep: boolean;
  // Present when keep === false. A short machine-friendly reason code.
  skipReason?: string;
  // The rule that made the "keep" decision (for debugging / transparency).
  matchedRule?: string;
}

// Per-attachment outcome recorded during an import run.
export interface AttachmentOutcome {
  status: "stored" | "duplicate" | "skipped" | "error";
  skipReason?: string;
  invoiceId?: string;
  error?: string;
}

// Aggregate totals shown to the user after an import.
export interface ImportSummary {
  new_files: number;
  duplicate_files: number;
  skipped_files: number;
  error_count: number;
}
