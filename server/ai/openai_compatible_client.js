const http = require("http");
const https = require("https");
const { URL } = require("url");

function requestJson(urlString, options, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === "http:" ? http : https;
    const req = transport.request(
      url,
      {
        method: options.method || "GET",
        headers: options.headers || {}
      },
      (res) => {
        let chunks = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          chunks += chunk;
        });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = chunks.length > 0 ? JSON.parse(chunks) : null;
          } catch (err) {
            return reject(new Error(`Invalid JSON from provider: ${err.message}`));
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: parsed,
            rawBody: chunks
          });
        });
      }
    );

    req.on("error", reject);
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`Provider request timed out after ${timeoutMs}ms`));
      });
    }
    if (body != null) {
      req.write(body);
    }
    req.end();
  });
}

async function createChatCompletion(provider, request) {
  const baseUrl = String(provider.baseUrl || "").replace(/\/+$/, "");
  if (!baseUrl) {
    throw new Error("Provider baseUrl is required");
  }
  if (!provider.modelId) {
    throw new Error("Provider modelId is required");
  }

  const payload = {
    model: provider.modelId,
    messages: Array.isArray(request.messages) ? request.messages : [],
    temperature: request.temperature != null ? request.temperature : 0.3,
    max_tokens: request.maxTokens != null ? request.maxTokens : 4000
  };

  if (request.responseFormat === "json") {
    payload.response_format = { type: "json_object" };
  }

  const headers = {
    "Content-Type": "application/json"
  };
  if (provider.apiKey != null && String(provider.apiKey).length > 0) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  const response = await requestJson(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers
    },
    JSON.stringify(payload),
    provider.timeoutMs
  );

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const message = response.body && response.body.error && response.body.error.message ? response.body.error.message : response.rawBody;
    throw new Error(`Provider error ${response.statusCode}: ${String(message || "").slice(0, 1000)}`);
  }

  const choice = response.body && response.body.choices && response.body.choices[0];
  const content = choice && choice.message ? choice.message.content : null;
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new Error("Provider response did not contain choices[0].message.content");
  }

  return {
    content,
    raw: response.body,
    usage: {
      promptTokens: response.body && response.body.usage ? response.body.usage.prompt_tokens : undefined,
      completionTokens: response.body && response.body.usage ? response.body.usage.completion_tokens : undefined,
      totalTokens: response.body && response.body.usage ? response.body.usage.total_tokens : undefined
    }
  };
}

module.exports = {
  createChatCompletion
};
