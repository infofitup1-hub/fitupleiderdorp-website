import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// These tests statically assert the security invariants of the SQL schema so a
// regression (e.g. someone disabling RLS or dropping a unique constraint) fails
// CI. Full integration RLS testing is described in the README (run against a
// local Supabase stack).

const schema = readFileSync(
  resolve(__dirname, "../supabase/migrations/0001_init.sql"),
  "utf8",
).toLowerCase();

const storage = readFileSync(
  resolve(__dirname, "../supabase/migrations/0002_storage.sql"),
  "utf8",
).toLowerCase();

describe("RLS is enabled on every table", () => {
  it.each(["profiles", "gmail_connections", "import_runs", "invoices"])(
    "enables RLS on %s",
    (table) => {
      expect(schema).toContain(`alter table public.${table} enable row level security`);
    },
  );
});

describe("Ownership policies scope rows to auth.uid()", () => {
  it("invoices are readable only by their owner", () => {
    expect(schema).toMatch(/create policy invoices_select_own[\s\S]*auth\.uid\(\) = user_id/);
  });
  it("gmail_connections are owner-scoped for all operations", () => {
    expect(schema).toMatch(/create policy gmail_connections_all_own[\s\S]*auth\.uid\(\) = user_id/);
  });
  it("import_runs are readable only by their owner", () => {
    expect(schema).toMatch(/create policy import_runs_select_own[\s\S]*auth\.uid\(\) = user_id/);
  });
  it("does NOT grant browser (authenticated) insert on invoices/import_runs", () => {
    expect(schema).not.toMatch(/create policy[^;]*on public\.invoices\s+for insert/);
    expect(schema).not.toMatch(/create policy[^;]*on public\.import_runs\s+for insert/);
  });
});

describe("Unique constraints for idempotent import", () => {
  it("enforces one PDF per user via (user_id, sha256_hash)", () => {
    expect(schema).toContain("unique (user_id, sha256_hash)");
  });
  it("enforces one row per attachment via (gmail_connection_id, gmail_message_id, attachment_id)", () => {
    expect(schema).toContain("unique (gmail_connection_id, gmail_message_id, attachment_id)");
  });
});

describe("Storage bucket is private and owner-scoped", () => {
  it("creates a private bucket", () => {
    expect(storage).toContain("'invoices', 'invoices', false");
  });
  it("scopes storage reads to the owner's folder prefix", () => {
    expect(storage).toMatch(/invoices read own[\s\S]*foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  });
});
