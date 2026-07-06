const http = require("http");
const https = require("https");
const { URL } = require("url");

function requestJson(urlString, options, body) {
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
    if (body != null) {
      req.write(body);
    }
    req.end();
  });
}

class OpenAIProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_MODEL || "gpt-4.1-mini";
    this.baseUrl = (config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  }

  isConfigured() {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  async generate(messages, options = {}) {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const payload = {
      model: options.model || this.model,
      messages,
      temperature: options.temperature != null ? options.temperature : 0.2,
      response_format: { type: "json_object" }
    };

    if (options.maxTokens != null) {
      payload.max_tokens = options.maxTokens;
    }

    const response = await requestJson(
      `${this.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        }
      },
      JSON.stringify(payload)
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const message = response.body && response.body.error && response.body.error.message ? response.body.error.message : response.rawBody;
      throw new Error(`OpenAI request failed (${response.statusCode}): ${message}`);
    }

    const choice = response.body && response.body.choices && response.body.choices[0];
    const content = choice && choice.message ? choice.message.content : null;
    if (typeof content !== "string" || content.trim().length === 0) {
      throw new Error("OpenAI response did not contain JSON content");
    }
    return content;
  }
}

module.exports = {
  OpenAIProvider
};
