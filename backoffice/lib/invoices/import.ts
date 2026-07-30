import type { SupabaseClient } from "@supabase/supabase-js";
import { getReadyClient, gmailFor } from "@/lib/gmail/client";
import {
  buildGmailQuery,
  parseMessage,
  decodeAttachmentData,
} from "@/lib/gmail/messages";
import { getQuarterRange } from "./quarter";
import { runPipeline, type Candidate, type StoredRecord } from "./pipeline";
import { STORAGE_BUCKET } from "@/lib/supabase/admin";
import type { GmailConnection, ImportSummary } from "@/types";

export interface RunImportParams {
  admin: SupabaseClient;
  userId: string;
  year: number;
  quarter: number;
  connections: GmailConnection[]; // the mailbox(es) to process
}

const EMPTY: ImportSummary = {
  new_files: 0,
  duplicate_files: 0,
  skipped_files: 0,
  error_count: 0,
};

function addSummary(a: ImportSummary, b: ImportSummary): ImportSummary {
  return {
    new_files: a.new_files + b.new_files,
    duplicate_files: a.duplicate_files + b.duplicate_files,
    skipped_files: a.skipped_files + b.skipped_files,
    error_count: a.error_count + b.error_count,
  };
}

/**
 * Lists all message ids matching the quarter query for a connection,
 * following pagination.
 */
async function listMessageIds(
  gmail: ReturnType<typeof gmailFor>,
  query: string,
): Promise<string[]> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 100,
      pageToken,
    });
    for (const m of res.data.messages ?? []) {
      if (m.id) ids.push(m.id);
    }
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return ids;
}

/**
 * Processes a single mailbox connection: discovers candidate PDF attachments,
 * then runs them through the shared pipeline. Errors within one connection are
 * contained so other mailboxes still run.
 */
async function importConnection(
  admin: SupabaseClient,
  userId: string,
  year: number,
  quarter: number,
  conn: GmailConnection,
): Promise<ImportSummary> {
  const client = await getReadyClient(conn);
  const gmail = gmailFor(client);
  const range = getQuarterRange(year, quarter);
  const query = buildGmailQuery(range);

  const messageIds = await listMessageIds(gmail, query);

  // Build candidate list from full message metadata.
  const candidates: Candidate[] = [];
  for (const id of messageIds) {
    const full = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    const parsed = parseMessage(full.data);
    // Guard: only keep messages actually within the quarter (Gmail date is
    // day-granular and timezone-dependent; we re-check precisely).
    if (
      parsed.date &&
      (parsed.date < range.start || parsed.date >= range.endExclusive)
    ) {
      continue;
    }
    for (const att of parsed.attachments) {
      candidates.push({
        gmailMessageId: parsed.messageId,
        attachmentId: att.attachmentId,
        subject: parsed.subject,
        senderName: parsed.sender.name,
        senderEmail: parsed.sender.email,
        emailDate: parsed.date,
        originalFilename: att.filename,
        mimeType: att.mimeType,
      });
    }
  }

  // Pre-load existing hashes for this user (durable dedup) and filenames for
  // this quarter folder (conflict counters).
  const { data: existing } = await admin
    .from("invoices")
    .select("sha256_hash, stored_filename, storage_path")
    .eq("user_id", userId);
  const existingHashes = (existing ?? [])
    .map((r) => r.sha256_hash as string)
    .filter(Boolean);
  const folderPrefix = `${userId}/${year}/Q${quarter}/`;
  const existingFilenames = (existing ?? [])
    .filter((r) => (r.storage_path as string)?.startsWith(folderPrefix))
    .map((r) => r.stored_filename as string)
    .filter(Boolean);

  const { summary } = await runPipeline(candidates, {
    existingHashes,
    existingFilenames,
    buildStoragePath: (name) => `${userId}/${year}/Q${quarter}/${name}`,
    downloadBytes: async (c) => {
      const res = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: c.gmailMessageId,
        id: c.attachmentId,
      });
      const data = res.data.data;
      if (!data) throw new Error("empty_attachment_data");
      return decodeAttachmentData(data);
    },
    uploadFile: async (path, bytes, contentType) => {
      const { error } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(path, bytes, { contentType, upsert: false });
      if (error && !/exists/i.test(error.message)) {
        throw new Error(`storage_upload_failed: ${error.message}`);
      }
    },
    persistStored: async (record: StoredRecord) => {
      const { candidate } = record;
      const { error } = await admin.from("invoices").insert({
        user_id: userId,
        gmail_connection_id: conn.id,
        gmail_message_id: candidate.gmailMessageId,
        attachment_id: candidate.attachmentId,
        email_subject: candidate.subject,
        sender_name: candidate.senderName,
        sender_email: candidate.senderEmail,
        email_date: candidate.emailDate?.toISOString() ?? null,
        original_filename: candidate.originalFilename,
        stored_filename: record.storedFilename,
        storage_path: record.storagePath,
        sha256_hash: record.sha256Hash,
        mime_type: candidate.mimeType || "application/pdf",
        file_size: record.fileSize,
        status: "stored",
      });
      // Unique-constraint violation => a concurrent/previous run already
      // stored it. Treat as non-fatal (idempotent).
      if (error && error.code !== "23505") {
        throw new Error(`invoice_insert_failed: ${error.message}`);
      }
    },
    onError: (candidate, err) => {
      // Never log tokens/secrets — only safe identifiers.
      // eslint-disable-next-line no-console
      console.error(
        `[import] message=${candidate.gmailMessageId} attachment=${candidate.attachmentId} error=${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    },
  });

  return summary;
}

/**
 * Runs an import across one or more mailboxes, recording an import_runs row and
 * returning the aggregate summary. Mailboxes are processed sequentially; a
 * failing mailbox is recorded as errors but does not stop the others.
 */
export async function runImport(
  params: RunImportParams,
): Promise<{ importRunId: string; summary: ImportSummary }> {
  const { admin, userId, year, quarter, connections } = params;

  const mailboxSelection =
    connections.length === 1 ? connections[0].email_address : "all";

  const { data: runRow, error: runErr } = await admin
    .from("import_runs")
    .insert({
      user_id: userId,
      year,
      quarter,
      mailbox_selection: mailboxSelection,
      status: "running",
    })
    .select("id")
    .single();
  if (runErr || !runRow) {
    throw new Error(`import_run_create_failed: ${runErr?.message}`);
  }
  const importRunId = runRow.id as string;

  let total: ImportSummary = { ...EMPTY };
  for (const conn of connections) {
    try {
      const summary = await importConnection(admin, userId, year, quarter, conn);
      total = addSummary(total, summary);
    } catch (err) {
      // Whole-mailbox failure (e.g. token invalid): count as one error and
      // mark the connection so the UI can prompt a reconnect.
      total = addSummary(total, { ...EMPTY, error_count: 1 });
      await admin
        .from("gmail_connections")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("id", conn.id);
      // eslint-disable-next-line no-console
      console.error(
        `[import] mailbox=${conn.email_address} failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  await admin
    .from("import_runs")
    .update({
      finished_at: new Date().toISOString(),
      new_files: total.new_files,
      duplicate_files: total.duplicate_files,
      skipped_files: total.skipped_files,
      error_count: total.error_count,
      status: "completed",
    })
    .eq("id", importRunId);

  return { importRunId, summary: total };
}
