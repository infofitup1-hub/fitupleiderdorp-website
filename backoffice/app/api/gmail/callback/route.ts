import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getOAuthEnv,
  validateState,
  OAUTH_SCOPES,
} from "@/lib/gmail/oauth";
import { getProfileEmail } from "@/lib/gmail/client";
import { encryptToken } from "@/lib/auth/crypto";

export const dynamic = "force-dynamic";

function settingsRedirect(request: NextRequest, params: Record<string, string>) {
  const url = new URL("/instellingen", request.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

// GET /api/gmail/callback?code=...&state=...
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const cookieStore = cookies();
  const expectedState = cookieStore.get("g_oauth_state")?.value;
  const verifier = cookieStore.get("g_oauth_verifier")?.value;

  // Always clear the transient cookies.
  cookieStore.delete("g_oauth_state");
  cookieStore.delete("g_oauth_verifier");
  cookieStore.delete("g_oauth_hint");

  const url = request.nextUrl;
  const err = url.searchParams.get("error");
  if (err) {
    return settingsRedirect(request, { gmail: "error", reason: err });
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  // CSRF protection: constant-time state comparison.
  if (!validateState(expectedState, state)) {
    return settingsRedirect(request, { gmail: "error", reason: "state_mismatch" });
  }
  if (!code || !verifier) {
    return settingsRedirect(request, { gmail: "error", reason: "missing_code" });
  }

  try {
    const { clientId, clientSecret, redirectUri } = getOAuthEnv();
    const oauth2 = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    // Exchange the authorization code (with PKCE verifier) for tokens.
    const { tokens } = await oauth2.getToken({
      code,
      codeVerifier: verifier,
    });
    oauth2.setCredentials(tokens);

    // Read which mailbox was actually linked.
    const emailAddress = await getProfileEmail(oauth2);

    const admin = createAdminClient();

    // Preserve an existing refresh token if Google did not return a new one
    // (it only returns refresh_token on the first consent). This is key to
    // reusing the grant instead of re-authorizing every time.
    let encryptedRefresh: string | null = tokens.refresh_token
      ? encryptToken(tokens.refresh_token)
      : null;
    if (!encryptedRefresh) {
      const { data: existing } = await admin
        .from("gmail_connections")
        .select("encrypted_refresh_token")
        .eq("user_id", user.id)
        .eq("email_address", emailAddress)
        .maybeSingle();
      encryptedRefresh = existing?.encrypted_refresh_token ?? null;
    }

    const row = {
      user_id: user.id,
      email_address: emailAddress,
      encrypted_access_token: tokens.access_token
        ? encryptToken(tokens.access_token)
        : null,
      encrypted_refresh_token: encryptedRefresh,
      token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      scopes: OAUTH_SCOPES,
      status: "connected" as const,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertErr } = await admin
      .from("gmail_connections")
      .upsert(row, { onConflict: "user_id,email_address" });
    if (upsertErr) {
      throw new Error(upsertErr.message);
    }

    return settingsRedirect(request, { gmail: "connected", mailbox: emailAddress });
  } catch (e) {
    // Never log the token payload — only a safe message.
    // eslint-disable-next-line no-console
    console.error(
      `[gmail-callback] token exchange failed: ${
        e instanceof Error ? e.message : "unknown"
      }`,
    );
    return settingsRedirect(request, { gmail: "error", reason: "exchange_failed" });
  }
}
