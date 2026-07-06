const { AiProviderStore, normalizePurpose } = require("./ai_provider_store.js");
const { createChatCompletion } = require("./openai_compatible_client.js");

function parseBooleanEnv(value) {
  return String(value || "").toLowerCase() === "true" || value === "1";
}

function now() {
  return Date.now();
}

function safeError(message) {
  const err = new Error(message);
  err.safe = true;
  return err;
}

class AiGatewayManager {
  constructor(server, options = {}) {
    this.server = server;
    this.crypto = options.crypto || null;
    this.store = options.store || new AiProviderStore(server.db, {
      crypto: this.crypto
    });
    this.enableUsageLogs = options.enableUsageLogs != null ? options.enableUsageLogs : parseBooleanEnv(process.env.AI_GATEWAY_ENABLE_USAGE_LOGS);
  }

  toPublicDto(profile) {
    if (!profile) {
      return null;
    }
    return {
      id: String(profile.id),
      name: profile.name,
      type: profile.type,
      purpose: normalizePurpose(profile.purpose),
      baseUrl: profile.baseUrl,
      modelId: profile.modelId,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
      timeoutMs: profile.timeoutMs,
      enabled: profile.enabled !== false,
      isDefault: profile.isDefault === true,
      hasApiKey: !!profile.hasApiKey,
      createdAt: profile.createdAt || null,
      updatedAt: profile.updatedAt || null
    };
  }

  listPublicProviders(purpose = "text") {
    return this.store.listPublic(purpose).map((profile) => this.toPublicDto(profile));
  }

  listAdminProviders(purpose = null) {
    return this.store.list(purpose).map((profile) => this.toPublicDto(profile));
  }

  getProvider(id) {
    return this.store.getById(id);
  }

  createProvider(input) {
    return this.toPublicDto(this.store.create(input));
  }

  updateProvider(id, input) {
    const result = this.store.update(id, input);
    return result ? this.toPublicDto(result) : null;
  }

  deleteProvider(id) {
    return this.store.delete(id);
  }

  setDefaultProvider(id) {
    const result = this.store.setDefault(id);
    return result ? this.toPublicDto(result) : null;
  }

  resolveProviderProfile(input = {}, purpose = "text") {
    const requestedId = input.providerProfileId != null && String(input.providerProfileId).length > 0 ? String(input.providerProfileId) : null;
    if (requestedId) {
      const requested = this.store.getRuntimeById(requestedId);
      if (!requested) {
        throw safeError("Requested provider profile not found");
      }
      if (requested.enabled === false) {
        throw safeError("Requested provider profile is disabled");
      }
      if (normalizePurpose(requested.purpose) !== normalizePurpose(purpose) && normalizePurpose(requested.purpose) !== "both") {
        throw safeError("Requested provider profile is not available for this purpose");
      }
      return requested;
    }

    const storedDefault = this.store.getRuntimeDefault(purpose);
    if (storedDefault) {
      return storedDefault;
    }

    const envProvider = this.store.getEnvironmentRuntimeProfile(purpose);
    if (envProvider) {
      return envProvider;
    }

    throw safeError("No AI provider configured");
  }

  async generate(input) {
    const purpose = normalizePurpose(input.purpose || "text");
    const provider = this.resolveProviderProfile(input, purpose);
    const startedAt = now();
    try {
      const result = await createChatCompletion({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        modelId: provider.modelId,
        timeoutMs: provider.timeoutMs
      }, {
        messages: input.messages,
        temperature: input.temperature,
        maxTokens: input.maxTokens,
        responseFormat: input.responseFormat
      });
      this.logUsage({
        userId: input.userId || null,
        feature: input.feature || "ai",
        providerId: provider.id,
        providerName: provider.name,
        modelId: provider.modelId,
        promptTokens: result.usage ? result.usage.promptTokens : undefined,
        completionTokens: result.usage ? result.usage.completionTokens : undefined,
        totalTokens: result.usage ? result.usage.totalTokens : undefined,
        latencyMs: now() - startedAt,
        success: true
      });
      return {
        content: result.content,
        providerId: provider.id,
        providerName: provider.name,
        modelId: provider.modelId,
        usage: result.usage || null,
        raw: result.raw
      };
    } catch (err) {
      this.logUsage({
        userId: input.userId || null,
        feature: input.feature || "ai",
        providerId: provider.id,
        providerName: provider.name,
        modelId: provider.modelId,
        latencyMs: now() - startedAt,
        success: false,
        errorMessage: String(err && err.message ? err.message : "Provider request failed").slice(0, 500)
      });
      throw safeError("AI provider request failed");
    }
  }

  async testProvider(providerId, userId = null) {
    const provider = this.store.getRuntimeById(providerId);
    if (!provider) {
      throw safeError("Provider not found");
    }
    const startedAt = now();
    const result = await createChatCompletion({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      modelId: provider.modelId,
      timeoutMs: provider.timeoutMs
    }, {
      messages: [
        {
          role: "user",
          content: "Reply with exactly: ok"
        }
      ],
      temperature: 0.0,
      maxTokens: 32
    });
    this.logUsage({
      userId,
      feature: "provider-test",
      providerId: provider.id,
      providerName: provider.name,
      modelId: provider.modelId,
      promptTokens: result.usage ? result.usage.promptTokens : undefined,
      completionTokens: result.usage ? result.usage.completionTokens : undefined,
      totalTokens: result.usage ? result.usage.totalTokens : undefined,
      latencyMs: now() - startedAt,
      success: true
    });
    return {
      ok: true,
      providerId: provider.id,
      providerName: provider.name,
      modelId: provider.modelId,
      latencyMs: now() - startedAt,
      sample: result.content
    };
  }

  logUsage(entry) {
    if (!this.enableUsageLogs) {
      return null;
    }
    return this.store.saveUsage(entry);
  }
}

module.exports = {
  AiGatewayManager
};
