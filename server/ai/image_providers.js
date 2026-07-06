const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const Jimp = require("jimp");

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

function requestBuffer(urlString) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const transport = url.protocol === "http:" ? http : https;
    const req = transport.request(url, { method: "GET" }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Image download failed (${res.statusCode})`));
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function bufferFromBase64(value) {
  return Buffer.from(String(value || ""), "base64");
}

function clampDimension(value, fallback, min = 16, max = 2048) {
  const n = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

function hashSeed(value) {
  return crypto.createHash("sha1").update(String(value || "")).digest();
}

async function makePlaceholderImage(width, height, prompt, transparentBackground = false) {
  const seed = hashSeed(prompt);
  const baseR = 50 + (seed[0] % 160);
  const baseG = 50 + (seed[1] % 160);
  const baseB = 50 + (seed[2] % 160);
  const bgAlpha = transparentBackground ? 0 : 255;
  const bg = Jimp.rgbaToInt(baseR, baseG, baseB, bgAlpha);
  const img = await new Promise((resolve, reject) => {
    new Jimp(Math.max(1, width), Math.max(1, height), bg, (err, image) => {
      if (err) {
        reject(err);
      } else {
        resolve(image);
      }
    });
  });

  const accent = Jimp.rgbaToInt(255 - baseR, 255 - baseG, 255 - baseB, transparentBackground ? 220 : 255);
  const accent2 = Jimp.rgbaToInt(
    Math.min(255, baseR + 40),
    Math.min(255, baseG + 40),
    Math.min(255, baseB + 40),
    transparentBackground ? 180 : 255
  );
  const margin = Math.max(1, Math.floor(Math.min(width, height) * 0.12));
  for (let x = margin; x < width - margin; x += 1) {
    img.setPixelColor(accent, x, margin);
    img.setPixelColor(accent, x, height - margin - 1);
  }
  for (let y = margin; y < height - margin; y += 1) {
    img.setPixelColor(accent, margin, y);
    img.setPixelColor(accent, width - margin - 1, y);
  }
  const shape = Math.max(2, Math.floor(Math.min(width, height) / 4));
  const startX = Math.max(1, Math.floor((width - shape) / 2));
  const startY = Math.max(1, Math.floor((height - shape) / 2));
  for (let x = startX; x < Math.min(width - 1, startX + shape); x += 1) {
    for (let y = startY; y < Math.min(height - 1, startY + shape); y += 1) {
      img.setPixelColor(accent2, x, y);
    }
  }
  return new Promise((resolve, reject) => {
    img.getBuffer(Jimp.MIME_PNG, (err, buffer) => {
      if (err) {
        reject(err);
      } else {
        resolve(buffer);
      }
    });
  });
}

class PlaceholderImageProvider {
  isConfigured() {
    return true;
  }

  async generateImage(options) {
    const width = clampDimension(options.width, 512);
    const height = clampDimension(options.height, 512);
    const buffer = await makePlaceholderImage(width, height, options.prompt, options.transparentBackground === true);
    return {
      buffer,
      mimeType: "image/png"
    };
  }
}

class OpenAIImageProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || "";
    this.model = config.model || process.env.OPENAI_IMAGE_MODEL || process.env.OPENAI_MODEL || "gpt-image-2";
    this.baseUrl = (config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  }

  isConfigured() {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  async generateImage(options) {
    if (!this.isConfigured()) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    const payload = {
      model: this.model,
      prompt: options.prompt,
      size: "1024x1024",
      n: 1,
      response_format: "b64_json"
    };

    if (options.transparentBackground) {
      payload.background = "transparent";
    }

    if (options.quality != null) {
      payload.quality = options.quality;
    }

    const response = await requestJson(
      `${this.baseUrl}/images/generations`,
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
      throw new Error(`OpenAI image request failed (${response.statusCode}): ${message}`);
    }

    const item = response.body && Array.isArray(response.body.data) ? response.body.data[0] : null;
    if (!item) {
      throw new Error("OpenAI image response did not contain image data");
    }

    if (typeof item.b64_json === "string" && item.b64_json.length > 0) {
      return {
        buffer: bufferFromBase64(item.b64_json),
        mimeType: "image/png"
      };
    }

    if (typeof item.url === "string" && item.url.length > 0) {
      return {
        buffer: await requestBuffer(item.url),
        mimeType: "image/png"
      };
    }

    throw new Error("OpenAI image response did not include a usable asset");
  }
}

class ComfyUIProvider {
  constructor(config = {}) {
    this.baseUrl = (config.baseUrl || process.env.COMFYUI_BASE_URL || "").replace(/\/$/, "");
    this.workflow = config.workflow || process.env.COMFYUI_WORKFLOW || null;
    this.clientId = config.clientId || process.env.COMFYUI_CLIENT_ID || crypto.randomBytes(8).toString("hex");
  }

  isConfigured() {
    return typeof this.baseUrl === "string" && this.baseUrl.length > 0 && this.workflow != null;
  }

  normalizeWorkflow() {
    if (typeof this.workflow === "string") {
      return JSON.parse(this.workflow);
    }
    return this.workflow;
  }

  async pollHistory(promptId) {
    const start = Date.now();
    while (Date.now() - start < 180000) {
      const response = await requestJson(`${this.baseUrl}/history/${promptId}`, { method: "GET" });
      if (response.statusCode >= 200 && response.statusCode < 300 && response.body && response.body[promptId]) {
        return response.body[promptId];
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    throw new Error("ComfyUI image generation timed out");
  }

  async generateImage(options) {
    if (!this.isConfigured()) {
      throw new Error("ComfyUI provider is not configured");
    }

    const workflow = this.normalizeWorkflow();
    const prompt = typeof workflow === "object" && workflow != null ? JSON.parse(JSON.stringify(workflow)) : null;
    if (prompt == null) {
      throw new Error("ComfyUI workflow is invalid");
    }

    const response = await requestJson(
      `${this.baseUrl}/prompt`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      },
      JSON.stringify({
        client_id: this.clientId,
        prompt
      })
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const message = response.body && response.body.error ? response.body.error : response.rawBody;
      throw new Error(`ComfyUI request failed (${response.statusCode}): ${message}`);
    }

    const promptId = response.body && (response.body.prompt_id || response.body.id || response.body.promptId);
    if (!promptId) {
      throw new Error("ComfyUI response did not include a prompt id");
    }

    const history = await this.pollHistory(promptId);
    const outputNodes = Object.values(history.outputs || {});
    for (const node of outputNodes) {
      const images = Array.isArray(node.images) ? node.images : [];
      for (const image of images) {
        const query = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder || "",
          type: image.type || "output"
        });
        const result = await requestBuffer(`${this.baseUrl}/view?${query.toString()}`);
        return {
          buffer: result,
          mimeType: "image/png"
        };
      }
    }

    throw new Error("ComfyUI did not return any generated image");
  }
}

module.exports = {
  PlaceholderImageProvider,
  OpenAIImageProvider,
  ComfyUIProvider
};
