import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// -----------------------------------------------------------------------------
// OAuth 2.0 state + PKCE helpers (server-side flow with offline access).
//
// The `state` value protects against CSRF: it is generated server-side, stored
// in a signed httpOnly cookie, and compared against the value Google returns.
// PKCE (code_verifier / code_challenge) hardens the authorization-code
// exchange. Both are pure/deterministic enough to unit-test.
// -----------------------------------------------------------------------------

export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
// We also request the userinfo.email scope so we can read which mailbox was
// linked (via the OAuth2 userinfo / Gmail profile endpoint).
export const OAUTH_SCOPES = [
  GMAIL_READONLY_SCOPE,
  "https://www.googleapis.com/auth/userinfo.email",
];

function base64url(input: Buffer): string {
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Cryptographically random state token. */
export function generateState(): string {
  return base64url(randomBytes(32));
}

/** Cryptographically random PKCE code verifier (43-128 chars, unreserved). */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(64)).slice(0, 96);
}

/** S256 code challenge derived from the verifier. */
export function deriveCodeChallenge(verifier: string): string {
  return base64url(createHash("sha256").update(verifier).digest());
}

/**
 * Constant-time comparison of two state strings. Returns false for any
 * missing / mismatched-length input instead of throwing.
 */
export function validateState(
  expected: string | null | undefined,
  received: string | null | undefined,
): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface OAuthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getOAuthEnv(): OAuthEnv {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth env vars missing (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI).",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Builds the Google authorization URL. `access_type=offline` + `prompt` is set
 * conditionally: we only force the consent screen (which reissues a refresh
 * token) when we do NOT already hold a valid refresh token. Otherwise we omit
 * `prompt` so Google can silently reuse the existing grant — this is what
 * prevents the "asks for authorization every time" bug.
 */
export function buildAuthUrl(params: {
  state: string;
  codeChallenge: string;
  loginHint?: string;
  forceConsent: boolean;
}): string {
  const { clientId, redirectUri } = getOAuthEnv();
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (params.loginHint) url.searchParams.set("login_hint", params.loginHint);
  // Only prompt for consent when we need a (new) refresh token.
  if (params.forceConsent) {
    url.searchParams.set("prompt", "consent");
  }
  return url.toString();
}
