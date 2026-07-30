import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { getOAuthEnv } from "./oauth";
import { decryptToken, encryptToken } from "@/lib/auth/crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { GmailConnection } from "@/types";

/**
 * Builds an OAuth2 client seeded with a connection's stored (decrypted) tokens.
 * The google-auth-library automatically refreshes the access token using the
 * refresh token when it is expired — so we reuse the existing grant instead of
 * asking the user to re-authorize (fixing the "always re-authorizing" bug).
 */
export function oauthClientForConnection(conn: GmailConnection): OAuth2Client {
  const { clientId, clientSecret, redirectUri } = getOAuthEnv();
  const client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  client.setCredentials({
    access_token: conn.encrypted_access_token
      ? decryptToken(conn.encrypted_access_token)
      : undefined,
    refresh_token: conn.encrypted_refresh_token
      ? decryptToken(conn.encrypted_refresh_token)
      : undefined,
    expiry_date: conn.token_expiry
      ? new Date(conn.token_expiry).getTime()
      : undefined,
  });
  return client;
}

/**
 * Ensures a valid access token, refreshing via the refresh token if needed, and
 * persists any refreshed access token back to the database (encrypted). Returns
 * the ready-to-use OAuth2 client. Throws if no refresh token is available.
 */
export async function getReadyClient(
  conn: GmailConnection,
): Promise<OAuth2Client> {
  const client = oauthClientForConnection(conn);

  if (!conn.encrypted_refresh_token) {
    throw new Error("no_refresh_token");
  }

  const expiry = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  const needsRefresh = !conn.encrypted_access_token || expiry - Date.now() < 60_000;

  if (needsRefresh) {
    const { credentials } = await client.refreshAccessToken();
    client.setCredentials(credentials);
    // Persist the fresh access token (and rotated refresh token, if any).
    const admin = createAdminClient();
    const update: Record<string, unknown> = {
      encrypted_access_token: credentials.access_token
        ? encryptToken(credentials.access_token)
        : conn.encrypted_access_token,
      token_expiry: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : conn.token_expiry,
      status: "connected",
      updated_at: new Date().toISOString(),
    };
    if (credentials.refresh_token) {
      update.encrypted_refresh_token = encryptToken(credentials.refresh_token);
    }
    await admin.from("gmail_connections").update(update).eq("id", conn.id);
  }

  return client;
}

export function gmailFor(client: OAuth2Client) {
  return google.gmail({ version: "v1", auth: client });
}

/** Reads the authenticated mailbox e-mail address (Gmail profile). */
export async function getProfileEmail(client: OAuth2Client): Promise<string> {
  const gmail = gmailFor(client);
  const profile = await gmail.users.getProfile({ userId: "me" });
  const address = profile.data.emailAddress;
  if (!address) throw new Error("Could not read Gmail profile email address.");
  return address;
}
