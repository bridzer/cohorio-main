import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

const VERSION = "v1";

function encryptionKey() {
  const raw = process.env.SHOPIFY_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "SHOPIFY_TOKEN_ENCRYPTION_KEY is required and must encode exactly 32 bytes.",
    );
  }

  const key = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== 32) {
    throw new Error(
      "SHOPIFY_TOKEN_ENCRYPTION_KEY must be 64 hex characters or a base64-encoded 32-byte key.",
    );
  }
  return key;
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, tag, ciphertext]
    .map((part) => (typeof part === "string" ? part : part.toString("base64url")))
    .join(".");
}

export function decryptSecret(payload: string) {
  const [version, ivRaw, tagRaw, ciphertextRaw] = payload.split(".");
  if (
    version !== VERSION ||
    !ivRaw ||
    !tagRaw ||
    !ciphertextRaw
  ) {
    throw new Error("Unsupported encrypted secret format.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function signValue(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signaturesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
