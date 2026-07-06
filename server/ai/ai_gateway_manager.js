const { AiProviderStore, normalizePurpose } = require("./ai_provider_store.js");
const { createChatCompletion } = require("./openai_compatible_client.js");
const {
  PlaceholderImageProvider,
  OpenAIImageProvider,
  ComfyUIProvider
} = require("./image_providers.js");

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
    this.imageProviders = {
      openai: () => new OpenAIImageProvider(this.getConfiguredImageProviderOptions("openai")),
      comfyui: () => new ComfyUIProvider(this.getConfiguredImageProviderOptions("comfyui")),
      placeholder: () => new PlaceholderImageProvider()
    };
    this.enableUsageLogs = options.enableUsageLogs != null ? options.enableUsageLogs : parseBooleanEnv(process.env.AI_GATEWAY_ENABLE_USAGE_LOGS);
  }

  getGatewayConfig() {
    return this.server && this.server.config && this.server.config.ai_gateway ? this.server.config.ai_gateway : {};
  }

  getConfiguredImageProviderOptions(providerName) {
    const config = this.getGatewayConfig();
    const imageProviders = config.imageProviders || config.image_providers || {};
    const selected = imageProviders[providerName] || config[providerName] || {};
    return selected && typeof selected === "object" ? selected : {};
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

    const configuredGateway = this.server && this.server.config && this.server.config.ai_gateway ? this.server.config.ai_gateway : null;
    const configuredId = configuredGateway && configuredGateway.providerProfileId != null && String(configuredGateway.providerProfileId).length > 0 ? String(configuredGateway.providerProfileId) : null;
    if (configuredId) {
      const configured = this.store.getRuntimeById(configuredId);
      if (!configured) {
        throw safeError("Requested provider profile not found");
      }
      if (configured.enabled === false) {
        throw safeError("Requested provider profile is disabled");
      }
      if (normalizePurpose(configured.purpose) !== normalizePurpose(purpose) && normalizePurpose(configured.purpose) !== "both") {
        throw safeError("Requested provider profile is not available for this purpose");
      }
      return configured;
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

  resolveImageProviderProfile(input = {}, purpose = "image") {
    const requestedId = input.imageProviderProfileId != null && String(input.imageProviderProfileId).length > 0 ? String(input.imageProviderProfileId) : null;
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

    const configuredGateway = this.getGatewayConfig();
    const configuredId = configuredGateway.imageProviderProfileId != null && String(configuredGateway.imageProviderProfileId).length > 0
      ? String(configuredGateway.imageProviderProfileId)
      : null;
    if (configuredId) {
      const configured = this.store.getRuntimeById(configuredId);
      if (!configured) {
        throw safeError("Requested provider profile not found");
      }
      if (configured.enabled === false) {
        throw safeError("Requested provider profile is disabled");
      }
      if (normalizePurpose(configured.purpose) !== normalizePurpose(purpose) && normalizePurpose(configured.purpose) !== "both") {
        throw safeError("Requested provider profile is not available for this purpose");
      }
      return configured;
    }

    return null;
  }

  getImageProvider(input = {}) {
    const providerName = input.imageProvider != null && String(input.imageProvider).length > 0 ? String(input.imageProvider) : null;
    if (providerName === "placeholder") {
      return this.imageProviders.placeholder();
    }
    const profile = this.resolveImageProviderProfile(input, "image");

    if (profile) {
      if (profile.type === "comfyui") {
        return new ComfyUIProvider({
          baseUrl: profile.baseUrl,
          workflow: profile.workflow,
          clientId: profile.clientId
        });
      }
      if (profile.type === "placeholder") {
        return new PlaceholderImageProvider();
      }
      return new OpenAIImageProvider({
        apiKey: profile.apiKey,
        model: profile.modelId,
        baseUrl: profile.baseUrl
      });
    }

    if (providerName && this.imageProviders[providerName]) {
      return this.imageProviders[providerName]();
    }

    const configuredGateway = this.getGatewayConfig();
    const configuredName = typeof configuredGateway.imageProvider === "string" ? configuredGateway.imageProvider : "placeholder";
    if (this.imageProviders[configuredName]) {
      return this.imageProviders[configuredName]();
    }

    return this.imageProviders.placeholder();
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
