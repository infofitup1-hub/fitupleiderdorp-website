import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";

// AES-256-GCM authenticated encryption for Google OAuth tokens at rest.
// The key comes from TOKEN_ENCRYPTION_KEY (base64, 32 bytes). We never log
// plaintext tokens or the key.

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }
  let key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    // Accept any input by deriving a stable 32-byte key via SHA-256, but a
    // proper 32-byte base64 key is strongly recommended.
    key = createHash("sha256").update(raw).digest();
  }
  return key;
}

/**
 * Encrypts a plaintext token. Output layout (base64):
 *   iv (12) || authTag (16) || ciphertext
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypts a token produced by {@link encryptToken}. Throws if the ciphertext
 * has been tampered with (GCM auth tag mismatch).
 */
export function decryptToken(payload: string): string {
  const key = getKey();
  const buf = Buffer.from(payload, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

// Nullable helpers used when a token may be absent.
export function encryptNullable(value: string | null | undefined): string | null {
  return value ? encryptToken(value) : null;
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value ? decryptToken(value) : null;
}
