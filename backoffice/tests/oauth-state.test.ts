import { describe, it, expect } from "vitest";
import {
  generateState,
  generateCodeVerifier,
  deriveCodeChallenge,
  validateState,
  buildAuthUrl,
} from "@/lib/gmail/oauth";

describe("OAuth state validation", () => {
  it("accepts identical state values", () => {
    const s = generateState();
    expect(validateState(s, s)).toBe(true);
  });

  it("rejects mismatched state", () => {
    expect(validateState(generateState(), generateState())).toBe(false);
  });

  it("rejects missing values", () => {
    expect(validateState(null, "x")).toBe(false);
    expect(validateState("x", undefined)).toBe(false);
    expect(validateState(null, null)).toBe(false);
  });

  it("rejects a length mismatch without throwing", () => {
    expect(validateState("abc", "abcd")).toBe(false);
  });

  it("generates URL-safe, non-trivial state", () => {
    const s = generateState();
    expect(s).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(s.length).toBeGreaterThan(20);
  });
});

describe("PKCE", () => {
  it("derives a deterministic S256 challenge", () => {
    const verifier = "test-verifier-value";
    expect(deriveCodeChallenge(verifier)).toBe(deriveCodeChallenge(verifier));
  });

  it("produces a URL-safe verifier of valid length", () => {
    const v = generateCodeVerifier();
    expect(v).toMatch(/^[A-Za-z0-9\-_]+$/);
    expect(v.length).toBeGreaterThanOrEqual(43);
    expect(v.length).toBeLessThanOrEqual(128);
  });

  it("challenge differs from verifier", () => {
    const v = generateCodeVerifier();
    expect(deriveCodeChallenge(v)).not.toBe(v);
  });
});

describe("buildAuthUrl", () => {
  const env = {
    GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REDIRECT_URI: "http://localhost:3000/api/gmail/callback",
  };
  const orig = { ...process.env };
  function withEnv(fn: () => void) {
    Object.assign(process.env, env);
    try {
      fn();
    } finally {
      process.env = { ...orig };
    }
  }

  it("requests offline access and gmail.readonly scope", () => {
    withEnv(() => {
      const url = new URL(
        buildAuthUrl({
          state: "st",
          codeChallenge: "cc",
          forceConsent: true,
        }),
      );
      expect(url.searchParams.get("access_type")).toBe("offline");
      expect(url.searchParams.get("scope")).toContain("gmail.readonly");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("prompt")).toBe("consent");
    });
  });

  it("omits prompt=consent when a valid refresh token exists (reuse)", () => {
    withEnv(() => {
      const url = new URL(
        buildAuthUrl({ state: "st", codeChallenge: "cc", forceConsent: false }),
      );
      expect(url.searchParams.get("prompt")).toBeNull();
    });
  });
});
