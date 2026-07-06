const crypto = require("crypto");

function hasPlaintextFallbackEnabled() {
  return process.env.NODE_ENV === "development" && String(process.env.AI_GATEWAY_ALLOW_PLAINTEXT_KEYS || "").toLowerCase() === "true";
}

function normalizeSecret(secret) {
  return String(secret || "").trim();
}

class PlaintextAiProviderCrypto {
  encrypt(value) {
    return value == null ? "" : `plain:${String(value)}`;
  }

  decrypt(value) {
    if (typeof value !== "string" || value.length === 0) {
      return "";
    }
    if (value.startsWith("plain:")) {
      return value.slice("plain:".length);
    }
    return value;
  }
}

class AesGcmAiProviderCrypto {
  constructor(secret) {
    this.secret = normalizeSecret(secret);
    if (!this.secret) {
      throw new Error("AI_GATEWAY_ENCRYPTION_SECRET is required");
    }
    this.key = crypto.scryptSync(this.secret, "microstudio-ai-gateway", 32);
  }

  encrypt(value) {
    if (value == null || String(value).length === 0) {
      return "";
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(String(value), "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
  }

  decrypt(value) {
    if (typeof value !== "string" || value.length === 0) {
      return "";
    }
    if (value.startsWith("plain:")) {
      return value.slice("plain:".length);
    }
    const parts = value.split(":");
    if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v1") {
      return value;
    }
    const iv = Buffer.from(parts[2], "base64");
    const tag = Buffer.from(parts[3], "base64");
    const payload = Buffer.from(parts[4], "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(payload),
      decipher.final()
    ]).toString("utf8");
  }
}

function createAiProviderCrypto() {
  if (hasPlaintextFallbackEnabled()) {
    return new PlaintextAiProviderCrypto();
  }
  return new AesGcmAiProviderCrypto(process.env.AI_GATEWAY_ENCRYPTION_SECRET || "");
}

module.exports = {
  PlaintextAiProviderCrypto,
  AesGcmAiProviderCrypto,
  createAiProviderCrypto
};
