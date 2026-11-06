import crypto from "crypto";

/**
 * Derives a secure scrypt hash of a secret credential (recovery key or password).
 * Output format: <salt_hex>:<hash_hex>
 */
export async function hashSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

/**
 * Constant-time verification of a plaintext secret against a stored scrypt hash.
 */
export async function verifySecret(secret: string, combinedHash: string): Promise<boolean> {
  const [salt, keyHex] = combinedHash.split(":");
  if (!salt || !keyHex) return false;

  return new Promise((resolve) => {
    crypto.scrypt(secret, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return resolve(false);
      const expectedBuffer = Buffer.from(keyHex, "hex");
      if (expectedBuffer.length !== derivedKey.length) return resolve(false);
      resolve(crypto.timingSafeEqual(expectedBuffer, derivedKey));
    });
  });
}

/**
 * Generates an opaque, high-entropy recovery key with an indexed lookup token.
 * Format: REC-<tokenId_8chars>-<secret_24chars>
 * e.g., REC-A7K2M9X4-b2F8...
 */
export function generateRecoveryKey(): { recoveryKey: string; recoveryTokenId: string } {
  const recoveryTokenId = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 hex chars
  const secretPart = crypto.randomBytes(18).toString("base64url");
  const recoveryKey = `REC-${recoveryTokenId}-${secretPart}`;

  return { recoveryKey, recoveryTokenId };
}

/**
 * Parses and validates the format of an entered recovery key.
 */
export function parseRecoveryKey(key: string): { recoveryTokenId: string; secret: string } | null {
  const trimmed = key.trim();
  const match = trimmed.match(/^REC-([A-F0-9]{8})-([A-Za-z0-9_-]{20,32})$/i);
  if (!match) return null;

  return {
    recoveryTokenId: match[1].toUpperCase(),
    secret: trimmed,
  };
}
