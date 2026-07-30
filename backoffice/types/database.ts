// Database row types mirroring the Supabase schema (see supabase/migrations).
// These are hand-maintained; you can regenerate them with the Supabase CLI:
//   supabase gen types typescript --project-id <ref> > types/database.ts

export type InvoiceStatus = "stored" | "duplicate" | "skipped" | "error";
export type ImportStatus = "running" | "completed" | "failed";
export type ConnectionStatus = "connected" | "disconnected" | "error";

export interface Profile {
  id: string;
  full_name: string | null;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface GmailConnection {
  id: string;
  user_id: string;
  email_address: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  token_expiry: string | null;
  scopes: string[];
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
}

export interface ImportRun {
  id: string;
  user_id: string;
  year: number;
  quarter: number;
  mailbox_selection: string;
  started_at: string;
  finished_at: string | null;
  new_files: number;
  duplicate_files: number;
  skipped_files: number;
  error_count: number;
  status: ImportStatus;
}

export interface Invoice {
  id: string;
  user_id: string;
  gmail_connection_id: string;
  gmail_message_id: string;
  attachment_id: string;
  email_subject: string | null;
  sender_name: string | null;
  sender_email: string | null;
  email_date: string | null;
  original_filename: string;
  stored_filename: string;
  storage_path: string;
  sha256_hash: string;
  mime_type: string;
  file_size: number;
  status: InvoiceStatus;
  skip_reason: string | null;
  created_at: string;
}
