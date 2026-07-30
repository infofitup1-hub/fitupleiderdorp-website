import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import {
  buildAuthUrl,
  generateCodeVerifier,
  generateState,
  deriveCodeChallenge,
} from "@/lib/gmail/oauth";

export const dynamic = "force-dynamic";

// GET /api/gmail/connect?loginHint=...&reconnect=1
// Starts the server-side OAuth flow. State + PKCE verifier are stored in
// short-lived httpOnly cookies. We only force the consent screen when we do not
// already hold a valid refresh token for this user (prevents re-prompting).
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const loginHint = request.nextUrl.searchParams.get("loginHint") ?? undefined;
  const reconnect = request.nextUrl.searchParams.get("reconnect") === "1";

  // Decide whether we must force consent (to obtain a refresh token).
  let forceConsent = true;
  if (loginHint && !reconnect) {
    const { data: existing } = await supabase
      .from("gmail_connections")
      .select("id, encrypted_refresh_token, status")
      .eq("user_id", user.id)
      .eq("email_address", loginHint)
      .maybeSingle();
    // If we already have a refresh token and the connection is healthy, we can
    // let Google reuse the grant silently.
    if (
      existing?.encrypted_refresh_token &&
      existing.status === "connected"
    ) {
      forceConsent = false;
    }
  }

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);

  const cookieStore = cookies();
  const secure = process.env.NODE_ENV === "production";
  const cookieOpts = {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 minutes
  };
  cookieStore.set("g_oauth_state", state, cookieOpts);
  cookieStore.set("g_oauth_verifier", codeVerifier, cookieOpts);
  if (loginHint) cookieStore.set("g_oauth_hint", loginHint, cookieOpts);

  // Requested scopes are read-only only (see OAUTH_SCOPES in lib/gmail/oauth).
  const url = buildAuthUrl({
    state,
    codeChallenge,
    loginHint,
    forceConsent,
  });

  return NextResponse.redirect(url);
}
