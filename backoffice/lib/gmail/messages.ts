import type { gmail_v1 } from "googleapis";
import { toGmailDate, type DateRange } from "@/lib/invoices/quarter";

export interface ParsedSender {
  name: string | null;
  email: string | null;
}

export interface AttachmentRef {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface ParsedMessage {
  messageId: string;
  subject: string | null;
  sender: ParsedSender;
  date: Date | null;
  attachments: AttachmentRef[];
}

/**
 * Builds the Gmail search query for a quarter: attachments only, PDFs, and
 * bounded by the quarter's date range (before: is exclusive, matching the
 * exclusive endExclusive boundary).
 */
export function buildGmailQuery(range: DateRange): string {
  const after = toGmailDate(range.start);
  const before = toGmailDate(range.endExclusive);
  return `has:attachment filename:pdf after:${after} before:${before}`;
}

/** Parses an RFC 5322 From header into name + email. */
export function parseFrom(from: string | null | undefined): ParsedSender {
  if (!from) return { name: null, email: null };
  const match = from.match(/^\s*(?:"?([^"]*)"?\s)?<?([^<>@\s]+@[^<>\s]+)>?/);
  if (match) {
    const name = (match[1] || "").trim() || null;
    const email = (match[2] || "").trim() || null;
    return { name, email };
  }
  // Bare address fallback.
  if (from.includes("@")) return { name: null, email: from.trim() };
  return { name: from.trim() || null, email: null };
}

function headerValue(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const h = headers.find((x) => x.name?.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}

/** Recursively collects PDF attachment references from a message payload. */
export function collectAttachments(
  part: gmail_v1.Schema$MessagePart | undefined,
  acc: AttachmentRef[] = [],
): AttachmentRef[] {
  if (!part) return acc;
  const body = part.body;
  const filename = part.filename ?? "";
  const mimeType = part.mimeType ?? "";
  if (body?.attachmentId && filename) {
    acc.push({
      attachmentId: body.attachmentId,
      filename,
      mimeType,
      size: body.size ?? 0,
    });
  }
  if (part.parts) {
    for (const child of part.parts) collectAttachments(child, acc);
  }
  return acc;
}

/** Parses a full Gmail message resource into the fields we care about. */
export function parseMessage(
  msg: gmail_v1.Schema$Message,
): ParsedMessage {
  const headers = msg.payload?.headers;
  const subject = headerValue(headers, "Subject");
  const from = headerValue(headers, "From");
  const sender = parseFrom(from);
  // internalDate is epoch millis as a string; fall back to the Date header.
  let date: Date | null = null;
  if (msg.internalDate) {
    const t = Number(msg.internalDate);
    if (!Number.isNaN(t)) date = new Date(t);
  }
  if (!date) {
    const dateHeader = headerValue(headers, "Date");
    if (dateHeader) {
      const parsed = new Date(dateHeader);
      if (!Number.isNaN(parsed.getTime())) date = parsed;
    }
  }
  const attachments = collectAttachments(msg.payload).filter((a) => {
    const isPdf =
      a.mimeType.toLowerCase().includes("pdf") ||
      a.filename.toLowerCase().endsWith(".pdf");
    return isPdf;
  });

  return {
    messageId: msg.id ?? "",
    subject,
    sender,
    date,
    attachments,
  };
}

/** Base64url -> Buffer for Gmail attachment data. */
export function decodeAttachmentData(data: string): Buffer {
  return Buffer.from(data, "base64");
}
