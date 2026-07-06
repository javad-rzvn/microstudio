const { createAiProviderCrypto } = require("./ai_provider_crypto.js");

function nowIso() {
  return new Date().toISOString();
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeType(value) {
  const allowed = ["openai-compatible", "openai", "litellm", "ollama", "lmstudio", "vllm", "custom"];
  return allowed.includes(value) ? value : "openai-compatible";
}

function normalizePurpose(value) {
  const allowed = ["text", "image", "both"];
  return allowed.includes(value) ? value : "text";
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeWorkflow(value) {
  if (value == null || value === "") {
    return "";
  }
  if (typeof value === "string") {
    return value.trim().slice(0, 20000);
  }
  try {
    return JSON.stringify(value).slice(0, 20000);
  } catch (err) {
    return "";
  }
}

function normalizeProfileId(value) {
  if (value == null || value === "") {
    return null;
  }
  const id = parseInt(String(value), 10);
  return Number.isFinite(id) ? id : null;
}

class AiProviderStore {
  constructor(db, options = {}) {
    this.db = db;
    this.table = options.table || "ai_provider_profiles";
    this.usageTable = options.usageTable || "ai_usage_logs";
    this.crypto = options.crypto || null;
    this.allowPlaintextFallback = options.allowPlaintextFallback !== false;
  }

  getCrypto() {
    if (this.crypto == null) {
      this.crypto = createAiProviderCrypto({
        allowPlaintextFallback: this.allowPlaintextFallback
      });
    }
    return this.crypto;
  }

  getRecord(id) {
    const normalizedId = normalizeProfileId(id);
    if (normalizedId == null) {
      return null;
    }
    return this.db.get(this.table, normalizedId) || null;
  }

  listRecords() {
    return this.db.list(this.table);
  }

  toStoredProfile(input, existing = {}) {
    const apiKey = Object.prototype.hasOwnProperty.call(input, "apiKey") ? input.apiKey : undefined;
    const stored = {
      name: typeof input.name === "string" ? input.name.trim().slice(0, 120) : existing.name || "AI Provider",
      type: normalizeType(typeof input.type === "string" ? input.type : existing.type),
      purpose: normalizePurpose(typeof input.purpose === "string" ? input.purpose : existing.purpose),
      baseUrl: normalizeBaseUrl(typeof input.baseUrl === "string" ? input.baseUrl : existing.baseUrl),
      modelId: typeof input.modelId === "string" ? input.modelId.trim().slice(0, 120) : (existing.modelId || ""),
      temperature: parseNumber(input.temperature, existing.temperature != null ? existing.temperature : 0.3),
      maxTokens: parseNumber(input.maxTokens, existing.maxTokens != null ? existing.maxTokens : 4000),
      timeoutMs: parseNumber(input.timeoutMs, existing.timeoutMs != null ? existing.timeoutMs : 60000),
      enabled: input.enabled != null ? !!input.enabled : existing.enabled !== false,
      isDefault: input.isDefault != null ? !!input.isDefault : existing.isDefault === true,
      workflow: Object.prototype.hasOwnProperty.call(input, "workflow") ? normalizeWorkflow(input.workflow) : normalizeWorkflow(existing.workflow),
      clientId: typeof input.clientId === "string" ? input.clientId.trim().slice(0, 120) : (existing.clientId || ""),
      updatedAt: nowIso()
    };

    if (!stored.baseUrl) {
      throw new Error("baseUrl is required");
    }
    if (!stored.modelId) {
      throw new Error("modelId is required");
    }

    if (apiKey !== undefined) {
      if (apiKey === "") {
        stored.apiKeyEncrypted = "";
      } else {
        stored.apiKeyEncrypted = this.getCrypto().encrypt(String(apiKey));
      }
    } else if (existing.apiKeyEncrypted != null) {
      stored.apiKeyEncrypted = existing.apiKeyEncrypted;
    }

    return stored;
  }

  toPublicProfile(data, id) {
    const profile = data || {};
    return {
      id: String(id),
      name: profile.name || "AI Provider",
      type: normalizeType(profile.type),
      purpose: normalizePurpose(profile.purpose),
      baseUrl: profile.baseUrl || "",
      modelId: profile.modelId || "",
      temperature: profile.temperature != null ? profile.temperature : 0.3,
      maxTokens: profile.maxTokens != null ? profile.maxTokens : 4000,
      timeoutMs: profile.timeoutMs != null ? profile.timeoutMs : 60000,
      enabled: profile.enabled !== false,
      isDefault: profile.isDefault === true,
      hasApiKey: !!profile.apiKeyEncrypted,
      hasWorkflow: !!profile.workflow,
      createdAt: profile.createdAt || null,
      updatedAt: profile.updatedAt || null
    };
  }

  toRuntimeProfile(data, id) {
    const profile = this.toPublicProfile(data, id);
    profile.apiKey = data && data.apiKeyEncrypted ? this.getCrypto().decrypt(data.apiKeyEncrypted) : "";
    profile.workflow = data && data.workflow ? data.workflow : "";
    profile.clientId = data && data.clientId ? data.clientId : "";
    return profile;
  }

  async unsetDefaults(purpose, keepId = null) {
    const list = this.listRecords();
    for (const record of list) {
      const data = record.get();
      if (!data || String(record.id) === String(keepId)) {
        continue;
      }
      if (normalizePurpose(data.purpose) === normalizePurpose(purpose) && data.isDefault === true) {
        record.set(Object.assign({}, data, {
          isDefault: false,
          updatedAt: nowIso()
        }));
      }
    }
  }

  list(purpose = null) {
    const records = this.listRecords();
    const out = [];
    for (const record of records) {
      const data = record.get();
      if (!data || data.deleted === true) {
        continue;
      }
      if (purpose && normalizePurpose(data.purpose) !== normalizePurpose(purpose) && normalizePurpose(data.purpose) !== "both") {
        continue;
      }
      out.push(this.toPublicProfile(data, record.id));
    }
    out.sort((a, b) => {
      if (a.isDefault !== b.isDefault) {
        return a.isDefault ? -1 : 1;
      }
      return String(a.id).localeCompare(String(b.id));
    });
    return out;
  }

  listPublic(purpose = null) {
    return this.list(purpose).filter((profile) => profile.enabled !== false);
  }

  getById(id) {
    const record = this.getRecord(id);
    if (!record) {
      return null;
    }
    const data = record.get();
    if (!data || data.deleted === true) {
      return null;
    }
    return this.toPublicProfile(data, record.id);
  }

  getRuntimeById(id) {
    const record = this.getRecord(id);
    if (!record) {
      return null;
    }
    const data = record.get();
    if (!data || data.deleted === true) {
      return null;
    }
    return this.toRuntimeProfile(data, record.id);
  }

  create(input) {
    const data = this.toStoredProfile(input, {});
    data.createdAt = nowIso();
    const record = this.db.create(this.table, data);
    if (data.isDefault) {
      this.unsetDefaults(data.purpose, record.id);
    }
    return this.getById(record.id);
  }

  update(id, input) {
    const record = this.getRecord(id);
    if (!record) {
      return null;
    }
    const existing = record.get();
    if (!existing || existing.deleted === true) {
      return null;
    }
    const data = this.toStoredProfile(input, existing);
    data.createdAt = existing.createdAt || nowIso();
    record.set(Object.assign({}, existing, data, {
      updatedAt: nowIso()
    }));
    if (data.isDefault) {
      this.unsetDefaults(data.purpose, record.id);
    }
    return this.getById(record.id);
  }

  delete(id) {
    const record = this.getRecord(id);
    if (!record) {
      return false;
    }
    const existing = record.get();
    if (!existing || existing.deleted === true) {
      return false;
    }
    record.set(Object.assign({}, existing, {
      enabled: false,
      isDefault: false,
      deleted: true,
      deletedAt: nowIso(),
      updatedAt: nowIso()
    }));
    return true;
  }

  getDefault(purpose = "text") {
    const list = this.list(purpose);
    const profile = list.find((item) => item.enabled !== false && item.isDefault === true);
    return profile || null;
  }

  getRuntimeDefault(purpose = "text") {
    const list = this.listRecords();
    for (const record of list) {
      const data = record.get();
      if (!data || data.deleted === true) {
        continue;
      }
      if (data.enabled === false || data.isDefault !== true) {
        continue;
      }
      if (normalizePurpose(data.purpose) === normalizePurpose(purpose) || normalizePurpose(data.purpose) === "both") {
        return this.toRuntimeProfile(data, record.id);
      }
    }
    return null;
  }

  clearDefault(purpose = "text") {
    this.unsetDefaults(purpose, null);
  }

  setDefault(id) {
    const record = this.getRecord(id);
    if (!record) {
      return null;
    }
    const data = record.get();
    if (!data || data.deleted === true) {
      return null;
    }
    record.set(Object.assign({}, data, {
      isDefault: true,
      updatedAt: nowIso()
    }));
    this.unsetDefaults(data.purpose, record.id);
    return this.getById(record.id);
  }

  saveUsage(log) {
    return this.db.create(this.usageTable, Object.assign({
      createdAt: nowIso()
    }, log));
  }

  getEnvironmentRuntimeProfile(purpose = "text") {
    const env = process.env;
    const baseUrl = String(env.AI_TEXT_BASE_URL || env.OPENAI_BASE_URL || "").trim().replace(/\/+$/, "") || "https://api.openai.com/v1";
    const modelId = String(env.AI_TEXT_MODEL || env.OPENAI_MODEL || "").trim() || (purpose === "image" ? "gpt-image-2" : "gpt-4.1-mini");
    const apiKey = String(env.AI_TEXT_API_KEY || env.OPENAI_API_KEY || "").trim();
    const enabled = !!baseUrl && !!modelId;
    if (!enabled) {
      return null;
    }
    return {
      id: "env-default",
      name: "Environment default",
      type: "openai-compatible",
      purpose,
      baseUrl,
      apiKey,
      modelId,
      temperature: parseNumber(env.AI_TEXT_TEMPERATURE, 0.3),
      maxTokens: parseNumber(env.AI_TEXT_MAX_TOKENS, 4000),
      timeoutMs: parseNumber(env.AI_GATEWAY_REQUEST_TIMEOUT_MS, 60000),
      enabled: true,
      isDefault: true,
      hasApiKey: apiKey.length > 0
    };
  }
}

module.exports = {
  AiProviderStore,
  normalizeType,
  normalizePurpose,
  normalizeBaseUrl
};
