const crypto = require("crypto");
const Jimp = require("jimp");
const { OpenAIProvider } = require("./provider_openai.js");
const { AiGatewayManager } = require("./ai_gateway_manager.js");
const {
  PlaceholderImageProvider,
  OpenAIImageProvider,
  ComfyUIProvider
} = require("./image_providers.js");

const ALLOWED_ROOTS = new Set(["source", "js", "ms", "sprites", "maps", "assets", "sounds", "music", "doc", "backgrounds", "ui"]);
const ALLOWED_EXTENSIONS = new Set(["js", "ms", "json", "md", "txt"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set(["png", "webp"]);
const ALLOWED_IMAGE_PROVIDERS = new Set(["openai", "comfyui", "placeholder"]);
const ALLOWED_IMAGE_STYLES = new Set(["pixel-art", "cartoon", "flat-vector", "simple-shapes", "hand-drawn", "fantasy", "sci-fi"]);
const ALLOWED_IMAGE_TYPES = new Set(["sprite", "background", "collectible", "obstacle", "goal", "ui", "button", "icon", "thumbnail", "title-screen", "tile", "texture", "tile-texture"]);
const DANGEROUS_CODE_PATTERNS = [
  /(^|[^\w])eval\s*\(/i,
  /(^|[^\w])Function\s*\(/i,
  /(^|[^\w])new\s+Function\s*\(/i,
  /document\.cookie/i,
  /\blocalStorage\s*\./i,
  /\bsessionStorage\s*\./i,
  /\bindexedDB\b/i,
  /\bfetch\s*\(/i,
  /\bXMLHttpRequest\b/i,
  /\bWebSocket\b/i,
  /\bEventSource\b/i,
  /(^|[^\w])var\s+[a-zA-Z_]/i,
  /<script\b/i,
  /<iframe\b/i,
  /document\.write\s*\(/i,
  /insertAdjacentHTML\s*\(/i,
  /\binnerHTML\s*=/i,
  /\bouterHTML\s*=/i,
  /\bnavigator\.sendBeacon\s*\(/i,
  /\bwindow\.open\s*\(/i,
  /\bimport\s*\(/i
];

const MICRO_SCRIPT_RESERVED_WORDS = new Set([
  "and", "or", "not", "if", "then", "else", "elsif", "end", "for", "to", "by",
  "while", "break", "continue", "function", "return", "local", "object", "true", "false",
  "class", "extends", "super", "new", "in", "as", "null", "undefined"
]);

const MICROSTUDIO_API_GLOBALS = new Set([
  "screen", "keyboard", "mouse", "touch", "audio", "system", "sprites", "maps", "storage",
  "asset_manager", "Matter", "init", "update", "draw"
]);

const FORBIDDEN_GENERIC_BROWSER_GAME_PATTERNS = [
  {
    pattern: /(^|[^\w.])line\s*\(/,
    message: "Use screen.drawLine(...), not line(...)."
  },
  {
    pattern: /\bscreen\.line\s*\(/,
    message: "Use screen.drawLine(...), not screen.line(...)."
  },
  {
    pattern: /(^|[^\w.])circle\s*\(/,
    message: "Use screen.drawRound(...) or screen.fillRound(...), not circle(...)."
  },
  {
    pattern: /\bscreen\.(?:draw|fill)Circle\s*\(/,
    message: "Use screen.drawRound(...) or screen.fillRound(...), not circle helpers."
  },
  {
    pattern: /(^|[^\w.])rect\s*\(/,
    message: "Use screen.drawRect(...) or screen.fillRect(...), not rect(...)."
  },
  {
    pattern: /\bfillText\s*\(/,
    message: "Use screen.drawText(...), not fillText(...)."
  },
  {
    pattern: /\bstrokeText\s*\(/,
    message: "Use screen.drawText(...), not strokeText(...)."
  },
  {
    pattern: /\bstrokeStyle\s*=/,
    message: "Use color arguments on screen drawing functions, not strokeStyle."
  },
  {
    pattern: /\bfillStyle\s*=/,
    message: "Use color arguments on screen drawing functions, not fillStyle."
  },
  {
    pattern: /\blineWidth\s*=/,
    message: "Do not rely on canvas lineWidth in microStudio generated code."
  },
  {
    pattern: /\bfont\s*=/,
    message: "Use the size argument in screen.drawText(...), not font."
  },
  {
    pattern: /\btextAlign\s*=/,
    message: "Do not use canvas textAlign; position text with screen.drawText coordinates."
  },
  {
    pattern: /\bcanvas\b/,
    message: "Do not use browser canvas in microStudio generated code."
  },
  {
    pattern: /\bctx\b|\bcontext\b/,
    message: "Do not use canvas ctx/context in microStudio generated code."
  },
  {
    pattern: /\bdocument\./,
    message: "Do not use DOM document in microStudio generated code."
  },
  {
    pattern: /\bwindow\./,
    message: "Do not use browser window in microStudio generated code."
  },
  {
    pattern: /\baddEventListener\s*\(/,
    message: "Do not use browser events; read mouse/touch/keyboard in update()."
  },
  {
    pattern: /\bonMouseDown\b/,
    message: "Do not define onMouseDown; read mouse state in update()."
  },
  {
    pattern: /\bonMouseUp\b/,
    message: "Do not define onMouseUp; read mouse state in update()."
  },
  {
    pattern: /\bonClick\b/,
    message: "Do not define onClick; read mouse state in update()."
  }
];

const MICRO_SCRIPT_FORBIDDEN_SYNTAX_PATTERNS = [
  { pattern: /\bfunction\s+[a-zA-Z_$][\w$]*\s*\(/, reason: "JavaScript function declaration" },
  { pattern: /(^|[^\w])(?:let|const|var)\s+[a-zA-Z_$]/, reason: "JavaScript variable declaration" },
  { pattern: /;\s*(?:(?:\r?\n)|$)/, reason: "JavaScript semicolon" },
  { pattern: /(^|[^=!])={3}([^=]|$)/, reason: "JavaScript strict equality" },
  { pattern: /!==/, reason: "JavaScript strict inequality" },
  { pattern: /\bnull\b/, reason: "JavaScript null" },
  { pattern: /\bundefined\b/, reason: "JavaScript undefined" },
  { pattern: /\bMath\./, reason: "JavaScript Math namespace" },
  { pattern: /&&|\|\|/, reason: "JavaScript boolean operator" },
  { pattern: /=>/, reason: "JavaScript arrow function" },
  { pattern: /\bscreen\.(?:fill|stroke|text|line)\s*\(/, reason: "JavaScript-style drawing API" },
  { pattern: /\b(onMouseDown|onMouseUp|onKeyDown|addEventListener)\s*\(/, reason: "JavaScript event handler" }
];

function validateMicroStudioRuntimeApiUsage(code) {
  const errors = [];
  for (const rule of FORBIDDEN_GENERIC_BROWSER_GAME_PATTERNS) {
    if (rule.pattern.test(code)) {
      errors.push(rule.message);
    }
  }
  return {
    ok: errors.length === 0,
    errors
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function bufferFromContent(content, encoding) {
  if (Buffer.isBuffer(content)) {
    return content;
  }
  if (encoding === "base64") {
    return Buffer.from(content || "", "base64");
  }
  return Buffer.from(content != null ? String(content) : "", "utf8");
}

function contentToString(content, encoding) {
  if (Buffer.isBuffer(content)) {
    return content.toString(encoding || "utf8");
  }
  if (encoding === "base64") {
    return Buffer.from(content || "", "base64").toString("utf8");
  }
  return content != null ? String(content) : "";
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .substring(0, 48) || "game";
}

function sanitizeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .replace(/_{2,}/g, "_")
    .substring(0, 40) || "item";
}

function sanitizeMicroScriptIdentifier(value, fallback = "item") {
  let name = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_")
    .substring(0, 40) || fallback;
  if (/^[0-9]/.test(name)) {
    name = `asset_${name}`;
  }
  if (MICRO_SCRIPT_RESERVED_WORDS.has(name) || MICROSTUDIO_API_GLOBALS.has(name)) {
    name = `${name}_asset`;
  }
  return name;
}

function normalizeAspectRatio(value) {
  switch (value) {
    case "16:9":
    case "16x9":
      return "16x9";
    case "4:3":
    case "4x3":
      return "4x3";
    case "1:1":
    case "1x1":
      return "1x1";
    case "portrait":
      return "free";
    default:
      return "free";
  }
}

function normalizeImageProvider(value) {
  return ALLOWED_IMAGE_PROVIDERS.has(value) ? value : "placeholder";
}

function normalizeImageStyle(value) {
  return ALLOWED_IMAGE_STYLES.has(value) ? value : "pixel-art";
}

function normalizeAssetResolution(value) {
  return ["32x32", "64x64", "128x128", "512x512"].includes(value) ? value : "64x64";
}

function clampImageDimension(value, fallback, min = 16, max = 2048) {
  const n = Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(min, Math.min(max, n));
}

function imageSizeForType(type, resolution) {
  const [w, h] = normalizeAssetResolution(resolution).split("x").map((n) => parseInt(n, 10));
  if (type === "background" || type === "title-screen") {
    return {
      width: Math.max(w * 4, 512),
      height: Math.max(h * 3, 512)
    };
  }
  if (type === "ui" || type === "button" || type === "icon" || type === "thumbnail") {
    return {
      width: Math.max(w * 2, 128),
      height: Math.max(h * 2, 128)
    };
  }
  if (type === "tile" || type === "texture" || type === "tile-texture") {
    return {
      width: Math.max(w * 2, 128),
      height: Math.max(h * 2, 128)
    };
  }
  return {
    width: w,
    height: h
  };
}

function normalizeImageType(value) {
  if (!ALLOWED_IMAGE_TYPES.has(value)) {
    return "sprite";
  }
  if (value === "button" || value === "icon" || value === "thumbnail") {
    return "ui";
  }
  if (value === "tile-texture") {
    return "tile";
  }
  return value;
}

function imageRootForType(type) {
  switch (normalizeImageType(type)) {
    case "background":
    case "title-screen":
      return "backgrounds";
    case "ui":
      return "ui";
    case "tile":
    case "texture":
      return "assets";
    default:
      return "sprites";
  }
}

function normalizeImageFilename(asset, type, index) {
  const root = imageRootForType(type);
  const id = sanitizeSegment(asset && (asset.id || asset.name) ? (asset.id || asset.name) : `asset-${index + 1}`);
  return `${root}/${id}.png`;
}

function mainPathForLanguage(language) {
  const config = gameLanguageConfig(language);
  return `${config.sourceRoot}/main.${config.sourceExt}`;
}

function normalizeSourcePathForLanguage(path, language) {
  const config = gameLanguageConfig(language);
  const cleaned = String(path || "")
    .replace(/\\/g, "/")
    .trim();
  const basename = cleaned
    .replace(/^source\//, "")
    .replace(/^ms\//, "")
    .replace(/^js\//, "")
    .replace(/\.[^.]+$/, "") || "main";
  const safeName = sanitizeSegment(basename);
  return `${config.sourceRoot}/${safeName}.${config.sourceExt}`;
}

function normalizeReferencePath(path, root, ext) {
  const cleanedRoot = String(root || "source")
    .replace(/\\/g, "/")
    .trim() || "source";
  const cleanedExt = String(ext || "").replace(/^\./, "").toLowerCase();
  const cleaned = String(path || "")
    .replace(/\\/g, "/")
    .trim();
  const basename = cleaned
    .replace(new RegExp(`^${cleanedRoot}/`), "")
    .replace(/^source\//, "")
    .replace(/^ms\//, "")
    .replace(/^js\//, "")
    .replace(/\.[^.]+$/, "") || "main";
  const safeName = sanitizeSegment(basename);
  if (!safeName || !cleanedExt || !ALLOWED_EXTENSIONS.has(cleanedExt)) {
    return null;
  }
  return `${cleanedRoot}/${safeName}.${cleanedExt}`;
}

function validateGeneratedCodeForLanguage(code, language) {
  const normalized = normalizeGameLanguage(language);
  if (normalized === "microScript") {
    return validateMicroScriptCode(code);
  }
  if (normalized === "microStudioJavaScript") {
    return validateMicroStudioJavaScriptCode(code);
  }
  return {
    ok: false,
    errors: [`Unsupported language: ${language}`]
  };
}

function validateMicroScriptCode(code) {
  const errors = [];
  const rules = [
    { pattern: /\bfunction\s+[a-zA-Z_$][\w$]*\s*\(/, message: "JavaScript function declaration is not valid microScript." },
    { pattern: /\b(let|const|var)\s+[a-zA-Z_$]/, message: "JavaScript variable declaration is not valid microScript." },
    { pattern: /=>/, message: "Arrow functions are not valid microScript." },
    { pattern: /===|!==/, message: "Use == and != in microScript, not === or !==." },
    { pattern: /&&|\|\|/, message: "Use and/or in microScript, not && or ||." },
    { pattern: /\bnull\b|\bundefined\b/, message: "Use 0, false, empty string, list, or object instead of null/undefined." },
    { pattern: /\bMath\./, message: "Use microScript functions like floor and random.next instead of Math.*." },
    { pattern: /;\s*($|\n)/, message: "Semicolons are not used in microScript." },
    { pattern: /\btouch\s*=\s*function\s*\(/, message: "Do not overwrite built-in touch API." },
    { pattern: /\bmouse\s*=\s*function\s*\(/, message: "Do not overwrite built-in mouse API." },
    { pattern: /\b(screen|keyboard|audio|system|sprites|maps|storage)\s*=/, message: "Do not overwrite built-in microStudio API objects." }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(code)) {
      errors.push(rule.message);
    }
  }

  const runtimeResult = validateMicroStudioRuntimeApiUsage(code);
  errors.push(...runtimeResult.errors);

  if (!/\binit\s*=\s*function\s*\(/.test(code)) {
    errors.push("Missing microScript lifecycle callback: init = function().");
  }
  if (!/\bupdate\s*=\s*function\s*\(/.test(code)) {
    errors.push("Missing microScript lifecycle callback: update = function().");
  }
  if (!/\bdraw\s*=\s*function\s*\(/.test(code)) {
    errors.push("Missing microScript lifecycle callback: draw = function().");
  }

  const reserved = new Set([
    "as", "by", "to", "end", "then", "else", "elsif", "if", "for",
    "while", "function", "return", "local", "object", "not", "and",
    "or", "break", "continue", "screen", "keyboard", "mouse", "touch",
    "audio", "system", "sprites", "maps", "storage"
  ]);
  const paramPattern = /\bfunction\s*\(([^)]*)\)/g;
  let match;
  while ((match = paramPattern.exec(code))) {
    const params = match[1]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const param of params) {
      if (reserved.has(param)) {
        errors.push(`Reserved microScript/API name used as parameter: ${param}`);
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function validateMicroStudioJavaScriptCode(code) {
  const errors = [];
  const rules = [
    { pattern: /\binit\s*=\s*function\s*\(/, message: "microScript lifecycle syntax found in JavaScript output." },
    { pattern: /\bupdate\s*=\s*function\s*\(/, message: "microScript lifecycle syntax found in JavaScript output." },
    { pattern: /\bdraw\s*=\s*function\s*\(/, message: "microScript lifecycle syntax found in JavaScript output." },
    { pattern: /^\s*end\s*$/m, message: "microScript end keyword found in JavaScript output." },
    { pattern: /\bthen\b/, message: "microScript then keyword found in JavaScript output." },
    { pattern: /\belsif\b/, message: "microScript elsif keyword found in JavaScript output." },
    { pattern: /\bobject\s*$/m, message: "microScript object block found in JavaScript output." },
    { pattern: /\bfor\s+[a-zA-Z_]\w*\s*=\s*.+\s+to\s+.+/i, message: "microScript for-to loop found in JavaScript output." },
    { pattern: /\btouch\s*=\s*function\s*\(/, message: "Do not overwrite built-in touch API." },
    { pattern: /\bmouse\s*=\s*function\s*\(/, message: "Do not overwrite built-in mouse API." },
    { pattern: /\b(screen|keyboard|audio|system|sprites|maps|storage)\s*=/, message: "Do not overwrite built-in microStudio API objects." }
  ];

  for (const rule of rules) {
    if (rule.pattern.test(code)) {
      errors.push(rule.message);
    }
  }

  const runtimeResult = validateMicroStudioRuntimeApiUsage(code);
  errors.push(...runtimeResult.errors);

  if (!/\bfunction\s+init\s*\(/.test(code)) {
    errors.push("Missing microStudio JavaScript lifecycle callback: function init().");
  }
  if (!/\bfunction\s+update\s*\(/.test(code)) {
    errors.push("Missing microStudio JavaScript lifecycle callback: function update().");
  }
  if (!/\bfunction\s+draw\s*\(/.test(code)) {
    errors.push("Missing microStudio JavaScript lifecycle callback: function draw().");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

function validateJavaScriptCode(code) {
  return validateMicroStudioJavaScriptCode(code);
}

function imagePromptPrefix(request) {
  const parts = [
    `Consistent ${request.imageStyle || "pixel-art"} game asset`,
    request.transparentSprites ? "transparent background when appropriate" : "solid background when appropriate",
    "no text",
    "no logos",
    "no copyrighted characters",
    "readable silhouette"
  ];
  return parts.join(", ");
}

function normalizeOrientation(value) {
  return value === "portrait" ? "portrait" : "landscape";
}

function shouldUseMatter(input) {
  if ((input.physics || "").toLowerCase() === "matterjs") {
    return true;
  }
  if ((input.physics || "").toLowerCase() !== "auto") {
    return false;
  }
  const text = `${input.idea || ""} ${input.difficulty || ""}`.toLowerCase();
  return /(physics|collision|collisions|gravity|rigid bodies?|constraints?|ropes?|joints?|bouncing|falling|platformer|platforming|puzzle physics|bounce|stacking|ragdoll)/.test(text);
}

function normalizeMode(value) {
  return value === "new_project" ? "new_project" : "apply_to_current_project";
}

function normalizeGameLanguage(value) {
  const raw = String(value || "microScript").trim().toLowerCase();
  if (raw === "microscript" || raw === "micro-script" || raw === "ms") {
    return "microScript";
  }
  if (raw === "javascript" || raw === "java-script" || raw === "js" || raw === "microstudio-javascript" || raw === "microstudiojavascript") {
    return "microStudioJavaScript";
  }
  return "microScript";
}

function gameLanguageConfig(language) {
  const normalized = normalizeGameLanguage(language);
  if (normalized === "microStudioJavaScript") {
    return {
      language: "microStudioJavaScript",
      projectLanguage: "javascript",
      sourceRoot: "js",
      sourceExt: "js",
      modelSourcePath: "js/main.js",
      featureName: "game-generator-microstudio-javascript"
    };
  }
  return {
    language: "microScript",
    projectLanguage: "microscript_v2",
    sourceRoot: "ms",
    sourceExt: "ms",
    modelSourcePath: "ms/main.ms",
    featureName: "game-generator-microscript"
  };
}

function languageSourcePath(language, path) {
  const config = gameLanguageConfig(language);
  return normalizeReferencePath(path, config.sourceRoot, config.sourceExt);
}

function allowedRootFromPath(path) {
  const cleaned = String(path || "").replace(/\\/g, "/").trim();
  if (!cleaned || cleaned.startsWith("/") || cleaned.includes("..") || cleaned.includes("\0")) {
    return null;
  }
  const parts = cleaned.split("/").filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const root = parts[0];
  if (!ALLOWED_ROOTS.has(root)) {
    return null;
  }
  for (const part of parts) {
    if (!part || part.startsWith(".") || part === "node_modules") {
      return null;
    }
    if (/^(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|pnpm-lock\.yml|package\.lock\.json)$/i.test(part)) {
      return null;
    }
  }
  return parts;
}

function normalizeFinalPath(root, name, ext) {
  const parts = String(name || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => sanitizeSegment(part))
    .filter(Boolean);
  const filename = parts.join("-");
  if (!filename) {
    return null;
  }
  const finalExt = String(ext || "").replace(/^\./, "").toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(finalExt)) {
    return null;
  }
  return `${root}/${filename}.${finalExt}`;
}

function uniqueByPath(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    if (!seen.has(item.path)) {
      seen.add(item.path);
      out.push(item);
    }
  }
  return out;
}

function isUnsafeCode(content) {
  if (typeof content !== "string") {
    return true;
  }
  for (const pattern of DANGEROUS_CODE_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }
  return false;
}

function hasCoreFunctions(content) {
  return /\binit\s*=\s*function\s*\(/.test(content) &&
    /\bupdate\s*=\s*function\s*\(/.test(content) &&
    /\bdraw\s*=\s*function\s*\(/.test(content);
}

function findMicroScriptSyntaxProblems(content) {
  const problems = [];
  if (typeof content !== "string") {
    return ["content is not a string"];
  }
  for (const entry of MICRO_SCRIPT_FORBIDDEN_SYNTAX_PATTERNS) {
    if (entry.pattern.test(content)) {
      problems.push(entry.reason);
    }
  }

  const apiOverwrite = content.match(/^\s*(screen|keyboard|mouse|touch|audio|system|sprites|maps|storage)\s*=/m);
  if (apiOverwrite) {
    problems.push(`overwrites built-in API global '${apiOverwrite[1]}'`);
  }

  const lifecycleOverwrite = content.match(/^\s*(init|update|draw)\s*=\s*(?!function\s*\()/m);
  if (lifecycleOverwrite) {
    problems.push(`overwrites lifecycle callback '${lifecycleOverwrite[1]}' with a non-function value`);
  }

  const functionParamPattern = /=\s*function\s*\(([^)]*)\)/g;
  let match;
  while ((match = functionParamPattern.exec(content)) !== null) {
    const params = match[1]
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const param of params) {
      if (MICRO_SCRIPT_RESERVED_WORDS.has(param) || MICROSTUDIO_API_GLOBALS.has(param)) {
        problems.push(`uses reserved/API name '${param}' as a function parameter`);
      }
    }
  }

  return Array.from(new Set(problems));
}

function buildFallbackDoc(plan, generatedFiles) {
  const controls = (plan.gameDesign && Array.isArray(plan.gameDesign.controls) && plan.gameDesign.controls.length > 0)
    ? plan.gameDesign.controls.join(", ")
    : "Arrow keys and Space";
  const title = plan.project && plan.project.title ? plan.project.title : "AI Game";
  const description = plan.project && plan.project.description ? plan.project.description : "";
  const nextSteps = Array.isArray(plan.nextSteps) ? plan.nextSteps : [];
  const lines = [
    `# ${title}`,
    "",
    description,
    "",
    "## microStudio",
    "Use the Code section to edit the game logic, the Sprites section for art, and the Maps section for levels or boards.",
    "Click Play to test changes instantly while the project is running.",
    "",
    "## Controls",
    controls,
    "",
    "## Next steps"
  ];
  for (const step of nextSteps) {
    lines.push(`- ${step}`);
  }
  if (nextSteps.length === 0) {
    lines.push("- Tweak the starter loop and regenerate.");
  }
  lines.push("", "## Generated files");
  for (const file of generatedFiles) {
    lines.push(`- ${file.path}`);
  }
  return lines.join("\n");
}

function buildGeneratedAssetManifest(imageAssets, language = "microScript") {
  const config = gameLanguageConfig(language);
  if (config.language === "microStudioJavaScript") {
    const lines = [
      "// Generated image asset manifest.",
      "// Reference these paths from your game code.",
      "const generatedImageAssets = {"
    ];
    for (const asset of (Array.isArray(imageAssets) ? imageAssets : []).slice(0, 32)) {
      const key = sanitizeSegment(asset && asset.id ? asset.id : "asset");
      lines.push(`  ${key}: ${JSON.stringify(asset.filename)},`);
    }
    lines.push("};", "");
    return lines.join("\n");
  }
  const lines = [
    "// Generated image asset manifest.",
    "// Reference these paths from your game code.",
    "generatedImageAssets = object"
  ];
  for (const asset of (Array.isArray(imageAssets) ? imageAssets : []).slice(0, 32)) {
    const key = sanitizeMicroScriptIdentifier(asset && asset.id ? asset.id : "asset");
    lines.push(`  ${key} = ${JSON.stringify(asset.filename)}`);
  }
  lines.push("end", "");
  return lines.join("\n");
}

function buildGeneratedAssetManifestFile(normalized, request) {
  const payload = {
    generatedAt: normalized.generatedAt || Date.now(),
    project: normalized.project || null,
    resolvedPhysicsMode: normalized.resolvedPhysicsMode || null,
    imageAssets: Array.isArray(normalized.imageAssets)
      ? normalized.imageAssets.map((asset) => ({
        id: asset.id,
        type: asset.type,
        filename: asset.filename,
        usedByFile: asset.usedByFile,
        width: asset.width,
        height: asset.height,
        transparentBackground: asset.transparentBackground,
        provider: asset.provider,
        style: asset.style
      }))
      : [],
    request: {
      generateImages: request.generateImages === true,
      imageProvider: request.imageProvider || "placeholder",
      imageProviderProfileId: request.imageProviderProfileId || null,
      imageStyle: request.imageStyle || "pixel-art",
      transparentSprites: request.transparentSprites !== false,
      assetResolution: request.assetResolution || "64x64"
    }
  };
  return {
    path: "doc/generated-assets.json",
    type: "doc",
    content: JSON.stringify(payload, null, 2),
    encoding: "utf8",
    sourcePath: "doc/generated-assets.json",
    preview: "Generated image asset manifest"
  };
}

function isTicTacToeRequest(request) {
  const text = `${request && request.idea ? request.idea : ""} ${request && request.gameDesign && request.gameDesign.genre ? request.gameDesign.genre : ""} ${request && request.gameDesign && request.gameDesign.coreLoop ? request.gameDesign.coreLoop : ""}`.toLowerCase();
  return /tic[-\s]?tac[-\s]?toe|noughts and crosses|three in a row|3x3|grid/.test(text);
}

function isPlatformerRequest(request) {
  const text = `${request && request.idea ? request.idea : ""} ${request && request.gameDesign && request.gameDesign.genre ? request.gameDesign.genre : ""} ${request && request.gameDesign && request.gameDesign.coreLoop ? request.gameDesign.coreLoop : ""}`.toLowerCase();
  return /platformer|platform game|side[-\s]?scroller|side[-\s]?scroll|run[-\s]?and[-\s]?jump|jump[-\s]?game|metroidvania|runner/.test(text);
}

function isShooterRequest(request) {
  const text = `${request && request.idea ? request.idea : ""} ${request && request.gameDesign && request.gameDesign.genre ? request.gameDesign.genre : ""} ${request && request.gameDesign && request.gameDesign.coreLoop ? request.gameDesign.coreLoop : ""}`.toLowerCase();
  return /shooter|shoot[-\s]?em[-\s]?up|shmup|bullet[-\s]?hell|space[-\s]?shooter|top[-\s]?down[-\s]?shooter|arena[-\s]?shooter|arcade[-\s]?shooter|blaster/.test(text);
}

function isPuzzleRequest(request) {
  const text = `${request && request.idea ? request.idea : ""} ${request && request.gameDesign && request.gameDesign.genre ? request.gameDesign.genre : ""} ${request && request.gameDesign && request.gameDesign.coreLoop ? request.gameDesign.coreLoop : ""}`.toLowerCase();
  return /puzzle|logic|brain|matching|match[-\s]?3|slide|sliding|swap|tile|sokoban|maze|memory|jigsaw|word[-\s]?game|brain[-\s]?teaser/.test(text);
}

function isRacingRequest(request) {
  const text = `${request && request.idea ? request.idea : ""} ${request && request.gameDesign && request.gameDesign.genre ? request.gameDesign.genre : ""} ${request && request.gameDesign && request.gameDesign.coreLoop ? request.gameDesign.coreLoop : ""}`.toLowerCase();
  return /racing|race|racer|driving|drive|kart|karting|formula|lap|time trial|track|circuit|road trip|car game|vehicle/.test(text);
}

function isTopDownAdventureRequest(request) {
  const text = `${request && request.idea ? request.idea : ""} ${request && request.gameDesign && request.gameDesign.genre ? request.gameDesign.genre : ""} ${request && request.gameDesign && request.gameDesign.coreLoop ? request.gameDesign.coreLoop : ""}`.toLowerCase();
  return /top[-\s]?down|overhead|overworld|dungeon|dungeon crawler|quest|exploration|rpg|zelda[-\s]?like|action[-\s]?adventure|maze|adventure game/.test(text);
}

function fallbackGenreName(request) {
  if (isTicTacToeRequest(request)) {
    return "ticTacToe";
  }
  if (isPlatformerRequest(request)) {
    return "platformer";
  }
  if (isShooterRequest(request)) {
    return "shooter";
  }
  if (isPuzzleRequest(request)) {
    return "puzzle";
  }
  if (isRacingRequest(request)) {
    return "racing";
  }
  if (isTopDownAdventureRequest(request)) {
    return "topDownAdventure";
  }
  return null;
}

function buildMicroStudioJavaScriptPuzzleFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Click a tile | R to reset");
  return `// ${title}
// ${description}
// Safe microStudio JavaScript puzzle starter.

const game = {
  tiles: [],
  blankIndex: 8,
  boardLeft: -54,
  boardTop: -54,
  tileSize: 36,
  prevMousePressed: false,
  moves: 0,
  solved: false,
  message: "Move tiles into the gap."
};

const titleText = ${title};
const controlsText = ${controlsText};

function createSolvedTiles() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 0];
}

function resetGame() {
  game.tiles = createSolvedTiles();
  game.blankIndex = 8;
  game.moves = 0;
  game.solved = false;
  game.message = "Move tiles into the gap.";

  for (let step = 0; step < 32; step += 1) {
    const neighbors = getMovableIndices(game.blankIndex);
    const pick = neighbors[Math.floor(random.next() * neighbors.length)];
    swapTiles(game.blankIndex, pick);
    game.blankIndex = pick;
  }
  game.moves = 0;
  game.solved = false;
}

function swapTiles(a, b) {
  const temp = game.tiles[a];
  game.tiles[a] = game.tiles[b];
  game.tiles[b] = temp;
}

function getMovableIndices(blankIndex) {
  const row = Math.floor(blankIndex / 3);
  const col = blankIndex % 3;
  const choices = [];
  if (row > 0) choices.push(blankIndex - 3);
  if (row < 2) choices.push(blankIndex + 3);
  if (col > 0) choices.push(blankIndex - 1);
  if (col < 2) choices.push(blankIndex + 1);
  return choices;
}

function isNeighbor(indexA, indexB) {
  const rowA = Math.floor(indexA / 3);
  const colA = indexA % 3;
  const rowB = Math.floor(indexB / 3);
  const colB = indexB % 3;
  return Math.abs(rowA - rowB) + Math.abs(colA - colB) === 1;
}

function isSolved() {
  for (let i = 0; i < 8; i += 1) {
    if (game.tiles[i] !== i + 1) {
      return false;
    }
  }
  return game.tiles[8] === 0;
}

function tryMoveAt(x, y) {
  const boardX = game.boardLeft;
  const boardY = game.boardTop;
  const size = game.tileSize * 3;
  if (x < boardX || y < boardY || x >= boardX + size || y >= boardY + size) {
    return;
  }

  const col = Math.floor((x - boardX) / game.tileSize);
  const row = Math.floor((y - boardY) / game.tileSize);
  const index = row * 3 + col;
  if (game.tiles[index] === 0) {
    return;
  }
  if (!isNeighbor(index, game.blankIndex)) {
    return;
  }

  swapTiles(index, game.blankIndex);
  game.blankIndex = index;
  game.moves += 1;
  game.solved = isSolved();
  if (game.solved) {
    game.message = "Puzzle solved.";
  }
}

function init() {
  resetGame();
}

function update() {
  if (keyboard.press.KEY_R || keyboard.press.SPACE) {
    resetGame();
    return;
  }

  if (mouse.pressed && !game.prevMousePressed && !game.solved) {
    tryMoveAt(mouse.x, mouse.y);
  }

  game.prevMousePressed = mouse.pressed;
}

function draw() {
  screen.fillRect(0, 0, screen.width, screen.height, "#08111f");
  screen.drawText(titleText, 0, -92, 8, "#dbeafe");
  screen.drawText(game.message, 0, 92, 5, "#cbd5e1");
  screen.drawText("Moves: " + game.moves, 0, -78, 5, "#94a3b8");
  screen.drawText(controlsText, 0, 78, 5, "#94a3b8");

  const boardX = game.boardLeft;
  const boardY = game.boardTop;
  const boardSize = game.tileSize * 3;
  const boardRight = boardX + boardSize;
  const boardBottom = boardY + boardSize;

  screen.drawLine(boardX, boardY, boardRight, boardY, "#475569");
  screen.drawLine(boardX, boardBottom, boardRight, boardBottom, "#475569");
  screen.drawLine(boardX, boardY, boardX, boardBottom, "#475569");
  screen.drawLine(boardRight, boardY, boardRight, boardBottom, "#475569");

  for (let i = 1; i < 3; i += 1) {
    const x = boardX + i * game.tileSize;
    const y = boardY + i * game.tileSize;
    screen.drawLine(x, boardY, x, boardBottom, "#475569");
    screen.drawLine(boardX, y, boardRight, y, "#475569");
  }

  for (let index = 0; index < game.tiles.length; index += 1) {
    const value = game.tiles[index];
    const col = index % 3;
    const row = Math.floor(index / 3);
    const cx = boardX + col * game.tileSize + game.tileSize / 2;
    const cy = boardY + row * game.tileSize + game.tileSize / 2;
    if (value === 0) {
      screen.fillRect(cx, cy, game.tileSize - 4, game.tileSize - 4, "#0f172a");
      continue;
    }
    screen.fillRound(cx, cy, game.tileSize - 4, game.tileSize - 4, "#1d4ed8");
    screen.drawText(String(value), cx, cy, 14, "#f8fafc");
  }

  if (game.solved) {
    screen.drawText("Solved", 0, -6, 10, "#86efac");
  }
}
`;
}

function buildMicroStudioJavaScriptRacingFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Arrow keys to steer | R to restart");
  return `// ${title}
// ${description}
// Safe microStudio JavaScript racing starter.

const game = {
  car: {
    x: 0,
    y: 58,
    vx: 0,
    vy: 0,
    w: 12,
    h: 20
  },
  gates: [
    { x: 0, y: -68, w: 28, h: 14, passed: false },
    { x: 66, y: 0, w: 14, h: 28, passed: false },
    { x: 0, y: 68, w: 28, h: 14, passed: false },
    { x: -66, y: 0, w: 14, h: 28, passed: false }
  ],
  nextGate: 0,
  laps: 0,
  finished: false,
  message: "Pass each gate in order."
};

const titleText = ${title};
const controlsText = ${controlsText};

function resetGame() {
  game.car.x = 0;
  game.car.y = 58;
  game.car.vx = 0;
  game.car.vy = 0;
  game.nextGate = 0;
  game.laps = 0;
  game.finished = false;
  game.message = "Pass each gate in order.";
  for (let i = 0; i < game.gates.length; i += 1) {
    game.gates[i].passed = false;
  }
}

function hit(ax, ay, aw, ah, bx, byPos, bw, bh) {
  return Math.abs(ax - bx) < (aw + bw) * 0.5 && Math.abs(ay - byPos) < (ah + bh) * 0.5;
}

function updateCar() {
  if (keyboard.LEFT) {
    game.car.vx -= 0.18;
  }
  if (keyboard.RIGHT) {
    game.car.vx += 0.18;
  }
  if (keyboard.UP) {
    game.car.vy -= 0.18;
  }
  if (keyboard.DOWN) {
    game.car.vy += 0.18;
  }

  game.car.vx *= 0.94;
  game.car.vy *= 0.94;

  const maxSpeed = 4.6;
  const speed = Math.sqrt(game.car.vx * game.car.vx + game.car.vy * game.car.vy);
  if (speed > maxSpeed) {
    const scale = maxSpeed / speed;
    game.car.vx *= scale;
    game.car.vy *= scale;
  }

  game.car.x += game.car.vx;
  game.car.y += game.car.vy;

  if (game.car.x < -92) {
    game.car.x = -92;
    game.car.vx = 0;
  }
  if (game.car.x > 92) {
    game.car.x = 92;
    game.car.vx = 0;
  }
  if (game.car.y < -84) {
    game.car.y = -84;
    game.car.vy = 0;
  }
  if (game.car.y > 84) {
    game.car.y = 84;
    game.car.vy = 0;
  }
}

function updateGates() {
  if (game.finished) {
    return;
  }

  const gate = game.gates[game.nextGate];
  if (gate && hit(game.car.x, game.car.y, game.car.w, game.car.h, gate.x, gate.y, gate.w, gate.h)) {
    gate.passed = true;
    game.nextGate += 1;
    if (game.nextGate >= game.gates.length) {
      game.laps += 1;
      game.finished = true;
      game.message = "Finish reached. Press R to race again.";
    } else {
      game.message = "Gate " + (game.nextGate + 1) + " of " + game.gates.length + ".";
    }
  }
}

function init() {
  resetGame();
}

function update() {
  if (keyboard.press.KEY_R || keyboard.press.SPACE) {
    resetGame();
    return;
  }
  if (game.finished) {
    return;
  }

  updateCar();
  updateGates();
}

function draw() {
  screen.fillRect(0, 0, screen.width, screen.height, "#07111f");
  screen.drawText(titleText, 0, -92, 8, "#dbeafe");
  screen.drawText(game.message, 0, 92, 5, "#cbd5e1");
  screen.drawText("Gates: " + (game.nextGate + 1) + " / " + game.gates.length, 0, -78, 5, "#94a3b8");
  screen.drawText(controlsText, 0, 78, 5, "#94a3b8");

  screen.drawRect(-96, -76, 192, 152, "#64748b");
  screen.drawRect(-52, -32, 104, 64, "#0f172a");
  screen.drawLine(-96, 0, -52, 0, "#334155");
  screen.drawLine(52, 0, 96, 0, "#334155");
  screen.drawLine(0, -76, 0, -32, "#334155");
  screen.drawLine(0, 32, 0, 76, "#334155");

  for (let i = 0; i < game.gates.length; i += 1) {
    const gate = game.gates[i];
    const color = gate.passed ? "#22c55e" : (i === game.nextGate ? "#fbbf24" : "#38bdf8");
    screen.fillRound(gate.x, gate.y, gate.w, gate.h, color);
  }

  screen.fillRound(game.car.x, game.car.y, game.car.w, game.car.h, "#fb7185");
  screen.drawRound(game.car.x, game.car.y, game.car.w + 1, game.car.h + 1, "#ef4444");

  if (game.finished) {
    screen.drawText("Race complete", 0, -6, 10, "#86efac");
  }
}
`;
}

function buildMicroStudioJavaScriptTopDownAdventureFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Arrow keys to move | R to restart");
  return `// ${title}
// ${description}
// Safe microStudio JavaScript top-down adventure starter.

const game = {
  player: {
    x: -72,
    y: 58,
    w: 12,
    h: 12
  },
  walls: [
    { x: 0, y: -92, w: 200, h: 10 },
    { x: 0, y: 92, w: 200, h: 10 },
    { x: -92, y: 0, w: 10, h: 200 },
    { x: 92, y: 0, w: 10, h: 200 },
    { x: -24, y: -24, w: 60, h: 10 },
    { x: 24, y: 20, w: 10, h: 56 },
    { x: -44, y: 44, w: 84, h: 10 }
  ],
  key: { x: -52, y: -48, w: 8, h: 8, collected: false },
  door: { x: 70, y: -8, w: 12, h: 28 },
  exit: { x: 76, y: 62, w: 14, h: 14 },
  hasKey: false,
  finished: false,
  message: "Find the key, open the door, reach the exit."
};

const titleText = ${title};
const controlsText = ${controlsText};

function resetGame() {
  game.player.x = -72;
  game.player.y = 58;
  game.key.collected = false;
  game.hasKey = false;
  game.finished = false;
  game.message = "Find the key, open the door, reach the exit.";
}

function hit(ax, ay, aw, ah, bx, byPos, bw, bh) {
  return Math.abs(ax - bx) < (aw + bw) * 0.5 && Math.abs(ay - byPos) < (ah + bh) * 0.5;
}

function blockedAt(x, y) {
  if (x < -88 || x > 88 || y < -88 || y > 88) {
    return true;
  }
  for (let i = 0; i < game.walls.length; i += 1) {
    const wall = game.walls[i];
    if (hit(x, y, game.player.w, game.player.h, wall.x, wall.y, wall.w, wall.h)) {
      return true;
    }
  }
  if (!game.hasKey && hit(x, y, game.player.w, game.player.h, game.door.x, game.door.y, game.door.w, game.door.h)) {
    return true;
  }
  return false;
}

function movePlayer(dx, dy) {
  let nextX = game.player.x + dx;
  if (!blockedAt(nextX, game.player.y)) {
    game.player.x = nextX;
  }
  let nextY = game.player.y + dy;
  if (!blockedAt(game.player.x, nextY)) {
    game.player.y = nextY;
  }
}

function updateInteractions() {
  if (!game.key.collected && hit(game.player.x, game.player.y, game.player.w, game.player.h, game.key.x, game.key.y, game.key.w, game.key.h)) {
    game.key.collected = true;
    game.hasKey = true;
    game.message = "Key found. Open the door.";
  }
  if (game.hasKey && hit(game.player.x, game.player.y, game.player.w, game.player.h, game.exit.x, game.exit.y, game.exit.w, game.exit.h)) {
    game.finished = true;
    game.message = "Exit found. Press R to restart.";
  }
}

function init() {
  resetGame();
}

function update() {
  if (keyboard.press.KEY_R || keyboard.press.SPACE) {
    resetGame();
    return;
  }
  if (game.finished) {
    return;
  }

  const speed = 2;
  if (keyboard.LEFT) {
    movePlayer(-speed, 0);
  }
  if (keyboard.RIGHT) {
    movePlayer(speed, 0);
  }
  if (keyboard.UP) {
    movePlayer(0, -speed);
  }
  if (keyboard.DOWN) {
    movePlayer(0, speed);
  }

  updateInteractions();
}

function draw() {
  screen.fillRect(0, 0, screen.width, screen.height, "#07111f");
  screen.drawText(titleText, 0, -92, 8, "#dbeafe");
  screen.drawText(game.message, 0, 92, 5, "#cbd5e1");
  screen.drawText("Key: " + (game.hasKey ? "found" : "missing"), 0, -78, 5, "#94a3b8");
  screen.drawText(controlsText, 0, 78, 5, "#94a3b8");

  for (let i = 0; i < game.walls.length; i += 1) {
    const wall = game.walls[i];
    screen.fillRect(wall.x, wall.y, wall.w, wall.h, "#334155");
  }

  screen.fillRect(game.door.x, game.door.y, game.door.w, game.door.h, game.hasKey ? "#22c55e" : "#f59e0b");
  screen.drawText("DOOR", game.door.x, game.door.y - 18, 5, "#e2e8f0");

  if (!game.key.collected) {
    screen.fillRound(game.key.x, game.key.y, game.key.w, game.key.h, "#fbbf24");
  }

  screen.fillRect(game.exit.x, game.exit.y, game.exit.w, game.exit.h, "#38bdf8");
  screen.drawText("EXIT", game.exit.x, game.exit.y - 16, 5, "#e2e8f0");

  screen.fillRound(game.player.x, game.player.y, game.player.w, game.player.h, "#fb7185");
  screen.drawRound(game.player.x, game.player.y, game.player.w + 1, game.player.h + 1, "#ef4444");

  if (game.finished) {
    screen.drawText("Adventure complete", 0, -6, 10, "#86efac");
  }
}
`;
}

function buildMicroStudioJavaScriptPlatformerFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Arrow keys to move | Space to jump | R to restart");
  return `// ${title}
// ${description}
// Safe microStudio JavaScript platformer starter.

const game = {
  player: {
    x: -72,
    y: 58,
    vx: 0,
    vy: 0,
    w: 12,
    h: 16,
    grounded: false
  },
  platforms: [
    { x: 0, y: 84, w: 220, h: 18 },
    { x: -60, y: 44, w: 76, h: 10 },
    { x: 18, y: 8, w: 72, h: 10 },
    { x: -84, y: -26, w: 54, h: 10 },
    { x: 8, y: -54, w: 62, h: 10 }
  ],
  coins: [
    { x: -58, y: 26, collected: false },
    { x: -6, y: -4, collected: false },
    { x: 40, y: -28, collected: false },
    { x: 76, y: -66, collected: false }
  ],
  goal: { x: 92, y: -72, w: 14, h: 32 },
  score: 0,
  gameOver: false,
  win: false,
  message: "Collect the coins and reach the goal."
};

const titleText = ${title};
const controlsText = ${controlsText};

function resetGame() {
  game.player.x = -72;
  game.player.y = 58;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.grounded = false;
  for (let i = 0; i < game.coins.length; i += 1) {
    game.coins[i].collected = false;
  }
  game.score = 0;
  game.gameOver = false;
  game.win = false;
  game.message = "Collect the coins and reach the goal.";
}

function rectsOverlap(ax, ay, aw, ah, bx, byPos, bw, bh) {
  return Math.abs(ax - bx) < (aw + bw) * 0.5 && Math.abs(ay - byPos) < (ah + bh) * 0.5;
}

function updatePlayer() {
  const previousY = game.player.y;

  if (keyboard.LEFT) {
    game.player.vx -= 0.45;
  }
  if (keyboard.RIGHT) {
    game.player.vx += 0.45;
  }
  if ((keyboard.press.SPACE || keyboard.press.UP || keyboard.press.KEY_Z) && game.player.grounded) {
    game.player.vy = -8.5;
    game.player.grounded = false;
  }

  game.player.vx *= 0.88;
  game.player.vy += 0.42;
  if (game.player.vy > 9) {
    game.player.vy = 9;
  }

  game.player.x += game.player.vx;
  game.player.y += game.player.vy;
  game.player.grounded = false;

  if (game.player.x < -104) {
    game.player.x = -104;
    game.player.vx = 0;
  }
  if (game.player.x > 104) {
    game.player.x = 104;
    game.player.vx = 0;
  }
  if (game.player.y > 104) {
    game.player.y = 104;
    game.player.vy = 0;
    game.player.grounded = true;
  }

  for (let i = 0; i < game.platforms.length; i += 1) {
    const platform = game.platforms[i];
    if (!rectsOverlap(game.player.x, game.player.y, game.player.w, game.player.h, platform.x, platform.y, platform.w, platform.h)) {
      continue;
    }
    const platformTop = platform.y - platform.h * 0.5;
    const playerBottomBeforeMove = previousY + game.player.h * 0.5;
    if (game.player.vy >= 0 && playerBottomBeforeMove <= platformTop + 6) {
      game.player.y = platformTop - game.player.h * 0.5;
      game.player.vy = 0;
      game.player.grounded = true;
    }
  }
}

function collectCoins() {
  for (let i = 0; i < game.coins.length; i += 1) {
    const coin = game.coins[i];
    if (coin.collected) {
      continue;
    }
    if (rectsOverlap(game.player.x, game.player.y, game.player.w, game.player.h, coin.x, coin.y, 10, 10)) {
      coin.collected = true;
      game.score += 1;
    }
  }
}

function updateGoalState() {
  const allCoinsCollected = game.score >= game.coins.length;
  if (allCoinsCollected && rectsOverlap(game.player.x, game.player.y, game.player.w, game.player.h, game.goal.x, game.goal.y, game.goal.w, game.goal.h)) {
    game.win = true;
    game.gameOver = true;
    game.message = "Goal reached. Press Space or R to restart.";
  } else if (allCoinsCollected) {
    game.message = "All coins collected. Reach the goal on the right.";
  }
}

function init() {
  resetGame();
}

function update() {
  if (keyboard.press.SPACE || keyboard.press.KEY_R) {
    resetGame();
    return;
  }
  if (game.gameOver) {
    return;
  }

  updatePlayer();
  collectCoins();
  updateGoalState();
}

function draw() {
  screen.fillRect(0, 0, screen.width, screen.height, "#08111f");
  screen.drawText(titleText, 0, -92, 8, "#dbeafe");
  screen.drawText(game.message, 0, 92, 5, "#cbd5e1");
  screen.drawText("Coins: " + game.score + " / " + game.coins.length, 0, -78, 5, "#94a3b8");
  screen.drawText(controlsText, 0, 78, 5, "#94a3b8");

  for (let i = 0; i < game.platforms.length; i += 1) {
    const platform = game.platforms[i];
    screen.fillRect(platform.x, platform.y, platform.w, platform.h, "#334155");
  }

  screen.fillRect(game.goal.x, game.goal.y, game.goal.w, game.goal.h, game.score >= game.coins.length ? "#22c55e" : "#64748b");
  screen.drawText("GOAL", game.goal.x, game.goal.y - 20, 5, "#e2e8f0");

  for (let i = 0; i < game.coins.length; i += 1) {
    const coin = game.coins[i];
    if (!coin.collected) {
      screen.fillRound(coin.x, coin.y, 10, 10, "#fbbf24");
    }
  }

  screen.fillRound(game.player.x, game.player.y, game.player.w, game.player.h, "#38bdf8");
  screen.drawRound(game.player.x, game.player.y, game.player.w + 1, game.player.h + 1, "#0ea5e9");

  if (game.gameOver) {
    screen.drawText(game.win ? "You win" : "Game Over", 0, -6, 10, "#fca5a5");
  }
}
`;
}

function buildMicroStudioJavaScriptShooterFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Arrow keys to move | Space to fire | R to restart");
  return `// ${title}
// ${description}
// Safe microStudio JavaScript shooter starter.

const game = {
  player: {
    x: 0,
    y: 72,
    w: 12,
    h: 12,
    fireCooldown: 0
  },
  bullets: [],
  enemies: [],
  score: 0,
  lives: 3,
  spawnTimer: 0,
  gameOver: false,
  message: "Move, shoot, survive."
};

const titleText = ${title};
const controlsText = ${controlsText};

function resetGame() {
  game.player.x = 0;
  game.player.y = 72;
  game.player.fireCooldown = 0;
  game.bullets = [];
  game.enemies = [];
  game.score = 0;
  game.lives = 3;
  game.spawnTimer = 0;
  game.gameOver = false;
  game.message = "Move, shoot, survive.";
}

function hit(ax, ay, aw, ah, bx, by, bw, bh) {
  return Math.abs(ax - bx) < (aw + bw) * 0.5 && Math.abs(ay - by) < (ah + bh) * 0.5;
}

function spawnEnemy() {
  if (game.enemies.length >= 18) {
    return;
  }
  const enemy = {
    x: random.next() * 176 - 88,
    y: -98,
    w: 12,
    h: 12,
    vx: (random.next() - 0.5) * 1.1,
    vy: 1.3 + random.next() * 1.5
  };
  game.enemies.push(enemy);
}

function fireBullet() {
  if (game.bullets.length >= 18) {
    return;
  }
  game.bullets.push({
    x: game.player.x,
    y: game.player.y - 12,
    w: 4,
    h: 8,
    vy: -5.5
  });
}

function updatePlayer() {
  if (keyboard.LEFT) {
    game.player.x -= 2.8;
  }
  if (keyboard.RIGHT) {
    game.player.x += 2.8;
  }
  if (keyboard.UP) {
    game.player.y -= 2.2;
  }
  if (keyboard.DOWN) {
    game.player.y += 2.2;
  }

  if (game.player.x < -94) {
    game.player.x = -94;
  }
  if (game.player.x > 94) {
    game.player.x = 94;
  }
  if (game.player.y < -78) {
    game.player.y = -78;
  }
  if (game.player.y > 84) {
    game.player.y = 84;
  }

  if (game.player.fireCooldown > 0) {
    game.player.fireCooldown -= 1;
  }
  if (keyboard.press.SPACE && game.player.fireCooldown <= 0) {
    fireBullet();
    game.player.fireCooldown = 8;
  }
}

function updateBullets() {
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = game.bullets[i];
    bullet.y += bullet.vy;
    if (bullet.y < -110) {
      game.bullets.splice(i, 1);
    }
  }
}

function updateEnemies() {
  game.spawnTimer -= 1;
  if (game.spawnTimer <= 0) {
    game.spawnTimer = 30;
    spawnEnemy();
  }

  for (let i = game.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = game.enemies[i];
    enemy.x += enemy.vx;
    enemy.y += enemy.vy;

    if (enemy.x < -104 || enemy.x > 104) {
      enemy.vx = -enemy.vx;
    }

    if (hit(game.player.x, game.player.y, game.player.w, game.player.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
      game.enemies.splice(i, 1);
      game.lives -= 1;
      if (game.lives <= 0) {
        game.gameOver = true;
      }
    } else if (enemy.y > 110) {
      game.enemies.splice(i, 1);
      game.lives -= 1;
      if (game.lives <= 0) {
        game.gameOver = true;
      }
    }
  }
}

function resolveBulletHits() {
  for (let i = game.bullets.length - 1; i >= 0; i -= 1) {
    const bullet = game.bullets[i];
    let removed = false;
    for (let j = game.enemies.length - 1; j >= 0; j -= 1) {
      const enemy = game.enemies[j];
      if (hit(bullet.x, bullet.y, bullet.w, bullet.h, enemy.x, enemy.y, enemy.w, enemy.h)) {
        game.enemies.splice(j, 1);
        game.bullets.splice(i, 1);
        game.score += 1;
        removed = true;
        break;
      }
    }
    if (removed) {
      continue;
    }
  }
}

function init() {
  resetGame();
}

function update() {
  if (keyboard.press.SPACE || keyboard.press.KEY_R) {
    resetGame();
    return;
  }
  if (game.gameOver) {
    return;
  }

  updatePlayer();
  updateBullets();
  updateEnemies();
  resolveBulletHits();
}

function draw() {
  screen.fillRect(0, 0, screen.width, screen.height, "#05111f");
  screen.drawText(titleText, 0, -92, 8, "#dbeafe");
  screen.drawText("Score: " + game.score + "  Lives: " + game.lives, 0, -78, 5, "#cbd5e1");
  screen.drawText(controlsText, 0, 92, 5, "#94a3b8");
  screen.drawText(game.message, 0, 78, 5, "#94a3b8");

  screen.fillRound(game.player.x, game.player.y, game.player.w, game.player.h, "#38bdf8");
  screen.drawRound(game.player.x, game.player.y, game.player.w + 1, game.player.h + 1, "#0ea5e9");

  for (let i = 0; i < game.bullets.length; i += 1) {
    const bullet = game.bullets[i];
    screen.fillRect(bullet.x, bullet.y, bullet.w, bullet.h, "#fbbf24");
  }

  for (let i = 0; i < game.enemies.length; i += 1) {
    const enemy = game.enemies[i];
    screen.fillRound(enemy.x, enemy.y, enemy.w, enemy.h, "#fb7185");
  }

  if (game.gameOver) {
    screen.drawText("Game Over", 0, -6, 10, "#fca5a5");
    screen.drawText("Press Space or R to restart", 0, 10, 6, "#f8fafc");
  }
}
`;
}

function buildMicroScriptPuzzleFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Click a tile | R to reset");
  return `// ${title}
// ${description}
// Safe microStudio microScript puzzle starter.

game = object
  tiles = []
  blankIndex = 8
  boardLeft = -54
  boardTop = -54
  tileSize = 36
  prevMousePressed = false
  moves = 0
  solved = false
  message = "Move tiles into the gap."
end

titleText = ${title}
controlsText = ${controlsText}

createSolvedTiles = function()
  return [1, 2, 3, 4, 5, 6, 7, 8, 0]
end

swapTiles = function(a, b)
  temp = game.tiles[a]
  game.tiles[a] = game.tiles[b]
  game.tiles[b] = temp
end

getMovableIndices = function(blankIndex)
  row = floor(blankIndex / 3)
  col = blankIndex % 3
  choices = []
  if row > 0 then choices.push(blankIndex - 3) end
  if row < 2 then choices.push(blankIndex + 3) end
  if col > 0 then choices.push(blankIndex - 1) end
  if col < 2 then choices.push(blankIndex + 1) end
  return choices
end

isNeighbor = function(indexA, indexB)
  rowA = floor(indexA / 3)
  colA = indexA % 3
  rowB = floor(indexB / 3)
  colB = indexB % 3
  return abs(rowA - rowB) + abs(colA - colB) == 1
end

isSolved = function()
  for i = 0 to 7
    if game.tiles[i] != i + 1 then
      return false
    end
  end
  return game.tiles[8] == 0
end

resetGame = function()
  game.tiles = createSolvedTiles()
  game.blankIndex = 8
  game.moves = 0
  game.solved = false
  game.message = "Move tiles into the gap."

  for step = 0 to 31
    neighbors = getMovableIndices(game.blankIndex)
    pick = neighbors[random.nextInt(neighbors.length)]
    swapTiles(game.blankIndex, pick)
    game.blankIndex = pick
  end

  game.moves = 0
  game.solved = false
end

tryMoveAt = function(x, y)
  boardX = game.boardLeft
  boardY = game.boardTop
  size = game.tileSize * 3
  if x < boardX or y < boardY or x >= boardX + size or y >= boardY + size then
    return
  end

  col = floor((x - boardX) / game.tileSize)
  row = floor((y - boardY) / game.tileSize)
  index = row * 3 + col
  if game.tiles[index] == 0 then
    return
  end
  if not isNeighbor(index, game.blankIndex) then
    return
  end

  swapTiles(index, game.blankIndex)
  game.blankIndex = index
  game.moves += 1
  game.solved = isSolved()
  if game.solved then
    game.message = "Puzzle solved."
  end
end

init = function()
  resetGame()
end

update = function()
  if keyboard.press.KEY_R or keyboard.press.SPACE then
    resetGame()
    return
  end

  if mouse.pressed and not game.prevMousePressed and not game.solved then
    tryMoveAt(mouse.x, mouse.y)
  end

  game.prevMousePressed = mouse.pressed
end

draw = function()
  screen.fillRect(0, 0, screen.width, screen.height, "#08111f")
  screen.drawText(titleText, 0, -92, 8, "#dbeafe")
  screen.drawText(game.message, 0, 92, 5, "#cbd5e1")
  screen.drawText("Moves: " + game.moves, 0, -78, 5, "#94a3b8")
  screen.drawText(controlsText, 0, 78, 5, "#94a3b8")

  boardX = game.boardLeft
  boardY = game.boardTop
  boardSize = game.tileSize * 3
  boardRight = boardX + boardSize
  boardBottom = boardY + boardSize

  screen.drawLine(boardX, boardY, boardRight, boardY, "#475569")
  screen.drawLine(boardX, boardBottom, boardRight, boardBottom, "#475569")
  screen.drawLine(boardX, boardY, boardX, boardBottom, "#475569")
  screen.drawLine(boardRight, boardY, boardRight, boardBottom, "#475569")

  for i = 1 to 2
    x = boardX + i * game.tileSize
    y = boardY + i * game.tileSize
    screen.drawLine(x, boardY, x, boardBottom, "#475569")
    screen.drawLine(boardX, y, boardRight, y, "#475569")
  end

  for index = 0 to game.tiles.length - 1
    value = game.tiles[index]
    col = index % 3
    row = floor(index / 3)
    cx = boardX + col * game.tileSize + game.tileSize / 2
    cy = boardY + row * game.tileSize + game.tileSize / 2
    if value == 0 then
      screen.fillRect(cx, cy, game.tileSize - 4, game.tileSize - 4, "#0f172a")
    else
      screen.fillRound(cx, cy, game.tileSize - 4, game.tileSize - 4, "#1d4ed8")
      screen.drawText(value, cx, cy, 14, "#f8fafc")
    end
  end

  if game.solved then
    screen.drawText("Solved", 0, -6, 10, "#86efac")
  end
end
`;
}

function buildMicroScriptRacingFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Arrow keys to steer | R to restart");
  return `// ${title}
// ${description}
// Safe microStudio microScript racing starter.

game = object
  car = object
    x = 0
    y = 58
    vx = 0
    vy = 0
    w = 12
    h = 20
  end
  gates = []
  nextGate = 0
  laps = 0
  finished = false
  message = "Pass each gate in order."
end

titleText = ${title}
controlsText = ${controlsText}

resetGame = function()
  game.car.x = 0
  game.car.y = 58
  game.car.vx = 0
  game.car.vy = 0
  game.nextGate = 0
  game.laps = 0
  game.finished = false
  game.message = "Pass each gate in order."

  game.gates = []
  game.gates.push(object x = 0 y = -68 w = 28 h = 14 passed = false end)
  game.gates.push(object x = 66 y = 0 w = 14 h = 28 passed = false end)
  game.gates.push(object x = 0 y = 68 w = 28 h = 14 passed = false end)
  game.gates.push(object x = -66 y = 0 w = 14 h = 28 passed = false end)
end

hit = function(ax, ay, aw, ah, bx, byPos, bw, bh)
  return abs(ax - bx) < (aw + bw) * 0.5 and abs(ay - byPos) < (ah + bh) * 0.5
end

updateCar = function()
  if keyboard.LEFT then
    game.car.vx -= 0.18
  end
  if keyboard.RIGHT then
    game.car.vx += 0.18
  end
  if keyboard.UP then
    game.car.vy -= 0.18
  end
  if keyboard.DOWN then
    game.car.vy += 0.18
  end

  game.car.vx *= 0.94
  game.car.vy *= 0.94

  if game.car.vx > 4.6 then
    game.car.vx = 4.6
  end
  if game.car.vx < -4.6 then
    game.car.vx = -4.6
  end
  if game.car.vy > 4.6 then
    game.car.vy = 4.6
  end
  if game.car.vy < -4.6 then
    game.car.vy = -4.6
  end

  game.car.x += game.car.vx
  game.car.y += game.car.vy

  if game.car.x < -92 then
    game.car.x = -92
    game.car.vx = 0
  end
  if game.car.x > 92 then
    game.car.x = 92
    game.car.vx = 0
  end
  if game.car.y < -84 then
    game.car.y = -84
    game.car.vy = 0
  end
  if game.car.y > 84 then
    game.car.y = 84
    game.car.vy = 0
  end
end

updateGates = function()
  if game.finished then
    return
  end

  gate = game.gates[game.nextGate]
  if gate and hit(game.car.x, game.car.y, game.car.w, game.car.h, gate.x, gate.y, gate.w, gate.h) then
    gate.passed = true
    game.nextGate += 1
    if game.nextGate >= game.gates.length then
      game.laps += 1
      game.finished = true
      game.message = "Finish reached. Press R to race again."
    else
      game.message = "Gate " + (game.nextGate + 1) + " of " + game.gates.length + "."
    end
  end
end

init = function()
  resetGame()
end

update = function()
  if keyboard.press.KEY_R or keyboard.press.SPACE then
    resetGame()
    return
  end
  if game.finished then
    return
  end

  updateCar()
  updateGates()
end

draw = function()
  screen.fillRect(0, 0, screen.width, screen.height, "#07111f")
  screen.drawText(titleText, 0, -92, 8, "#dbeafe")
  screen.drawText(game.message, 0, 92, 5, "#cbd5e1")
  screen.drawText("Gates: " + (game.nextGate + 1) + " / " + game.gates.length, 0, -78, 5, "#94a3b8")
  screen.drawText(controlsText, 0, 78, 5, "#94a3b8")

  screen.drawRect(-96, -76, 192, 152, "#64748b")
  screen.drawRect(-52, -32, 104, 64, "#0f172a")
  screen.drawLine(-96, 0, -52, 0, "#334155")
  screen.drawLine(52, 0, 96, 0, "#334155")
  screen.drawLine(0, -76, 0, -32, "#334155")
  screen.drawLine(0, 32, 0, 76, "#334155")

  for i = 0 to game.gates.length - 1
    gate = game.gates[i]
    if gate.passed then
      color = "#22c55e"
    elsif i == game.nextGate then
      color = "#fbbf24"
    else
      color = "#38bdf8"
    end
    screen.fillRound(gate.x, gate.y, gate.w, gate.h, color)
  end

  screen.fillRound(game.car.x, game.car.y, game.car.w, game.car.h, "#fb7185")
  screen.drawRound(game.car.x, game.car.y, game.car.w + 1, game.car.h + 1, "#ef4444")

  if game.finished then
    screen.drawText("Race complete", 0, -6, 10, "#86efac")
  end
end
`;
}

function buildMicroScriptTopDownAdventureFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Arrow keys to move | R to restart");
  return `// ${title}
// ${description}
// Safe microStudio microScript top-down adventure starter.

game = object
  player = object
    x = -72
    y = 58
    w = 12
    h = 12
  end
  walls = []
  key = object
    x = -52
    y = -48
    w = 8
    h = 8
    collected = false
  end
  door = object
    x = 70
    y = -8
    w = 12
    h = 28
  end
  exit = object
    x = 76
    y = 62
    w = 14
    h = 14
  end
  hasKey = false
  finished = false
  message = "Find the key, open the door, reach the exit."
end

titleText = ${title}
controlsText = ${controlsText}

resetGame = function()
  game.player.x = -72
  game.player.y = 58
  game.key.collected = false
  game.hasKey = false
  game.finished = false
  game.message = "Find the key, open the door, reach the exit."

  game.walls = []
  game.walls.push(object x = 0 y = -92 w = 200 h = 10 end)
  game.walls.push(object x = 0 y = 92 w = 200 h = 10 end)
  game.walls.push(object x = -92 y = 0 w = 10 h = 200 end)
  game.walls.push(object x = 92 y = 0 w = 10 h = 200 end)
  game.walls.push(object x = -24 y = -24 w = 60 h = 10 end)
  game.walls.push(object x = 24 y = 20 w = 10 h = 56 end)
  game.walls.push(object x = -44 y = 44 w = 84 h = 10 end)
end

hit = function(ax, ay, aw, ah, bx, byPos, bw, bh)
  return abs(ax - bx) < (aw + bw) * 0.5 and abs(ay - byPos) < (ah + bh) * 0.5
end

blockedAt = function(x, y)
  if x < -88 or x > 88 or y < -88 or y > 88 then
    return true
  end
  for i = 0 to game.walls.length - 1
    wall = game.walls[i]
    if hit(x, y, game.player.w, game.player.h, wall.x, wall.y, wall.w, wall.h) then
      return true
    end
  end
  if not game.hasKey and hit(x, y, game.player.w, game.player.h, game.door.x, game.door.y, game.door.w, game.door.h) then
    return true
  end
  return false
end

movePlayer = function(dx, dy)
  nextX = game.player.x + dx
  if not blockedAt(nextX, game.player.y) then
    game.player.x = nextX
  end

  nextY = game.player.y + dy
  if not blockedAt(game.player.x, nextY) then
    game.player.y = nextY
  end
end

updateInteractions = function()
  if not game.key.collected and hit(game.player.x, game.player.y, game.player.w, game.player.h, game.key.x, game.key.y, game.key.w, game.key.h) then
    game.key.collected = true
    game.hasKey = true
    game.message = "Key found. Open the door."
  end

  if game.hasKey and hit(game.player.x, game.player.y, game.player.w, game.player.h, game.exit.x, game.exit.y, game.exit.w, game.exit.h) then
    game.finished = true
    game.message = "Exit found. Press R to restart."
  end
end

init = function()
  resetGame()
end

update = function()
  if keyboard.press.KEY_R or keyboard.press.SPACE then
    resetGame()
    return
  end
  if game.finished then
    return
  end

  speed = 2
  if keyboard.LEFT then
    movePlayer(-speed, 0)
  end
  if keyboard.RIGHT then
    movePlayer(speed, 0)
  end
  if keyboard.UP then
    movePlayer(0, -speed)
  end
  if keyboard.DOWN then
    movePlayer(0, speed)
  end

  updateInteractions()
end

draw = function()
  screen.fillRect(0, 0, screen.width, screen.height, "#07111f")
  screen.drawText(titleText, 0, -92, 8, "#dbeafe")
  screen.drawText(game.message, 0, 92, 5, "#cbd5e1")
  screen.drawText("Key: " + (game.hasKey and "found" or "missing"), 0, -78, 5, "#94a3b8")
  screen.drawText(controlsText, 0, 78, 5, "#94a3b8")

  for i = 0 to game.walls.length - 1
    wall = game.walls[i]
    screen.fillRect(wall.x, wall.y, wall.w, wall.h, "#334155")
  end

  if game.hasKey then
    doorColor = "#22c55e"
  else
    doorColor = "#f59e0b"
  end
  screen.fillRect(game.door.x, game.door.y, game.door.w, game.door.h, doorColor)
  screen.drawText("DOOR", game.door.x, game.door.y - 18, 5, "#e2e8f0")

  if not game.key.collected then
    screen.fillRound(game.key.x, game.key.y, game.key.w, game.key.h, "#fbbf24")
  end

  screen.fillRect(game.exit.x, game.exit.y, game.exit.w, game.exit.h, "#38bdf8")
  screen.drawText("EXIT", game.exit.x, game.exit.y - 16, 5, "#e2e8f0")

  screen.fillRound(game.player.x, game.player.y, game.player.w, game.player.h, "#fb7185")
  screen.drawRound(game.player.x, game.player.y, game.player.w + 1, game.player.h + 1, "#ef4444")

  if game.finished then
    screen.drawText("Adventure complete", 0, -6, 10, "#86efac")
  end
end
`;
}

function buildMicroScriptPlatformerFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Arrow keys to move | Space to jump | R to restart");
  return `// ${title}
// ${description}
// Safe microStudio microScript platformer starter.

game = object
  player = object
    x = -72
    y = 58
    vx = 0
    vy = 0
    w = 12
    h = 16
    grounded = false
  end
  platforms = []
  coins = []
  goal = object
    x = 92
    y = -72
    w = 14
    h = 32
  end
  score = 0
  gameOver = false
  win = false
  message = "Collect the coins, then reach the goal."
end

titleText = ${title}
controlsText = ${controlsText}

resetGame = function()
  game.player.x = -72
  game.player.y = 58
  game.player.vx = 0
  game.player.vy = 0
  game.player.grounded = false

  game.platforms = []
  game.platforms.push(object x = 0 y = 84 w = 220 h = 18 end)
  game.platforms.push(object x = -60 y = 44 w = 76 h = 10 end)
  game.platforms.push(object x = 18 y = 8 w = 72 h = 10 end)
  game.platforms.push(object x = -84 y = -26 w = 54 h = 10 end)
  game.platforms.push(object x = 8 y = -54 w = 62 h = 10 end)

  game.coins = []
  game.coins.push(object x = -58 y = 26 collected = false end)
  game.coins.push(object x = -6 y = -4 collected = false end)
  game.coins.push(object x = 40 y = -28 collected = false end)
  game.coins.push(object x = 76 y = -66 collected = false end)

  game.score = 0
  game.gameOver = false
  game.win = false
  game.message = "Collect the coins, then reach the goal."
end

rectsOverlap = function(ax, ay, aw, ah, bx, byPos, bw, bh)
  return abs(ax - bx) < (aw + bw) * 0.5 and abs(ay - byPos) < (ah + bh) * 0.5
end

updatePlayer = function()
  previousY = game.player.y

  if keyboard.LEFT then
    game.player.vx -= 0.45
  end
  if keyboard.RIGHT then
    game.player.vx += 0.45
  end
  if (keyboard.press.SPACE or keyboard.press.UP or keyboard.press.KEY_Z) and game.player.grounded then
    game.player.vy = -8.5
    game.player.grounded = false
  end

  game.player.vx *= 0.88
  game.player.vy += 0.42
  if game.player.vy > 9 then
    game.player.vy = 9
  end

  game.player.x += game.player.vx
  game.player.y += game.player.vy
  game.player.grounded = false

  if game.player.x < -104 then
    game.player.x = -104
    game.player.vx = 0
  end
  if game.player.x > 104 then
    game.player.x = 104
    game.player.vx = 0
  end
  if game.player.y > 104 then
    game.player.y = 104
    game.player.vy = 0
    game.player.grounded = true
  end

  for i = 0 to game.platforms.length - 1
    platform = game.platforms[i]
    if rectsOverlap(game.player.x, game.player.y, game.player.w, game.player.h, platform.x, platform.y, platform.w, platform.h) then
      platformTop = platform.y - platform.h * 0.5
      playerBottomBeforeMove = previousY + game.player.h * 0.5
      if game.player.vy >= 0 and playerBottomBeforeMove <= platformTop + 6 then
        game.player.y = platformTop - game.player.h * 0.5
        game.player.vy = 0
        game.player.grounded = true
      end
    end
  end
end

collectCoins = function()
  for i = 0 to game.coins.length - 1
    coin = game.coins[i]
    if not coin.collected then
      if rectsOverlap(game.player.x, game.player.y, game.player.w, game.player.h, coin.x, coin.y, 10, 10) then
        coin.collected = true
        game.score += 1
      end
    end
  end
end

updateGoalState = function()
  allCoinsCollected = game.score >= game.coins.length
  if allCoinsCollected then
    if rectsOverlap(game.player.x, game.player.y, game.player.w, game.player.h, game.goal.x, game.goal.y, game.goal.w, game.goal.h) then
      game.win = true
      game.gameOver = true
      game.message = "Goal reached. Press Space or R to restart."
    else
      game.message = "All coins collected. Reach the goal on the right."
    end
  end
end

init = function()
  resetGame()
end

update = function()
  if keyboard.press.SPACE or keyboard.press.KEY_R then
    resetGame()
    return
  end
  if game.gameOver then
    return
  end

  updatePlayer()
  collectCoins()
  updateGoalState()
end

draw = function()
  screen.fillRect(0, 0, screen.width, screen.height, "#08111f")
  screen.drawText(titleText, 0, -92, 8, "#dbeafe")
  screen.drawText(game.message, 0, 92, 5, "#cbd5e1")
  screen.drawText("Coins: " + game.score + " / " + game.coins.length, 0, -78, 5, "#94a3b8")
  screen.drawText(controlsText, 0, 78, 5, "#94a3b8")

  for i = 0 to game.platforms.length - 1
    platform = game.platforms[i]
    screen.fillRect(platform.x, platform.y, platform.w, platform.h, "#334155")
  end

  goalColor = "#64748b"
  if game.score >= game.coins.length then
    goalColor = "#22c55e"
  end
  screen.fillRect(game.goal.x, game.goal.y, game.goal.w, game.goal.h, goalColor)
  screen.drawText("GOAL", game.goal.x, game.goal.y - 20, 5, "#e2e8f0")

  for i = 0 to game.coins.length - 1
    coin = game.coins[i]
    if not coin.collected then
      screen.fillRound(coin.x, coin.y, 10, 10, "#fbbf24")
    end
  end

  screen.fillRound(game.player.x, game.player.y, game.player.w, game.player.h, "#38bdf8")
  screen.drawRound(game.player.x, game.player.y, game.player.w + 1, game.player.h + 1, "#0ea5e9")

  if game.gameOver then
    if game.win then
      screen.drawText("You win", 0, -6, 10, "#fca5a5")
    else
      screen.drawText("Game Over", 0, -6, 10, "#fca5a5")
    end
  end
end
`;
}

function buildMicroScriptShooterFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Arrow keys to move | Space to fire | R to restart");
  return `// ${title}
// ${description}
// Safe microStudio microScript shooter starter.

game = object
  player = object
    x = 0
    y = 72
    w = 12
    h = 12
    fireCooldown = 0
  end
  bullets = []
  enemies = []
  score = 0
  lives = 3
  spawnTimer = 0
  gameOver = false
  message = "Move, shoot, survive."
end

titleText = ${title}
controlsText = ${controlsText}

resetGame = function()
  game.player.x = 0
  game.player.y = 72
  game.player.fireCooldown = 0
  game.bullets = []
  game.enemies = []
  game.score = 0
  game.lives = 3
  game.spawnTimer = 0
  game.gameOver = false
  game.message = "Move, shoot, survive."
end

hit = function(ax, ay, aw, ah, bx, byPos, bw, bh)
  return abs(ax - bx) < (aw + bw) * 0.5 and abs(ay - byPos) < (ah + bh) * 0.5
end

spawnEnemy = function()
  if game.enemies.length >= 18 then
    return
  end
  enemy = object
    x = random.next() * 176 - 88
    y = -98
    w = 12
    h = 12
    vx = (random.next() - 0.5) * 1.1
    vy = 1.3 + random.next() * 1.5
  end
  game.enemies.push(enemy)
end

fireBullet = function()
  if game.bullets.length >= 18 then
    return
  end
  game.bullets.push(object
    x = game.player.x
    y = game.player.y - 12
    w = 4
    h = 8
    vy = -5.5
  end)
end

updatePlayer = function()
  if keyboard.LEFT then
    game.player.x -= 2.8
  end
  if keyboard.RIGHT then
    game.player.x += 2.8
  end
  if keyboard.UP then
    game.player.y -= 2.2
  end
  if keyboard.DOWN then
    game.player.y += 2.2
  end

  if game.player.x < -94 then
    game.player.x = -94
  end
  if game.player.x > 94 then
    game.player.x = 94
  end
  if game.player.y < -78 then
    game.player.y = -78
  end
  if game.player.y > 84 then
    game.player.y = 84
  end

  if game.player.fireCooldown > 0 then
    game.player.fireCooldown -= 1
  end
  if keyboard.press.SPACE and game.player.fireCooldown <= 0 then
    fireBullet()
    game.player.fireCooldown = 8
  end
end

updateBullets = function()
  for i = game.bullets.length - 1 to 0 by -1
    bullet = game.bullets[i]
    bullet.y += bullet.vy
    if bullet.y < -110 then
      game.bullets.remove(i)
    end
  end
end

updateEnemies = function()
  game.spawnTimer -= 1
  if game.spawnTimer <= 0 then
    game.spawnTimer = 30
    spawnEnemy()
  end

  for i = game.enemies.length - 1 to 0 by -1
    enemy = game.enemies[i]
    enemy.x += enemy.vx
    enemy.y += enemy.vy

    if enemy.x < -104 or enemy.x > 104 then
      enemy.vx = -enemy.vx
    end

    if hit(game.player.x, game.player.y, game.player.w, game.player.h, enemy.x, enemy.y, enemy.w, enemy.h) then
      game.enemies.remove(i)
      game.lives -= 1
      if game.lives <= 0 then
        game.gameOver = true
      end
    elsif enemy.y > 110 then
      game.enemies.remove(i)
      game.lives -= 1
      if game.lives <= 0 then
        game.gameOver = true
      end
    end
  end
end

resolveBulletHits = function()
  for i = game.bullets.length - 1 to 0 by -1
    bullet = game.bullets[i]
    removed = false
    for j = game.enemies.length - 1 to 0 by -1
      enemy = game.enemies[j]
      if hit(bullet.x, bullet.y, bullet.w, bullet.h, enemy.x, enemy.y, enemy.w, enemy.h) then
        game.enemies.remove(j)
        game.bullets.remove(i)
        game.score += 1
        removed = true
        break
      end
    end
  end
end

init = function()
  resetGame()
end

update = function()
  if keyboard.press.SPACE or keyboard.press.KEY_R then
    resetGame()
    return
  end
  if game.gameOver then
    return
  end

  updatePlayer()
  updateBullets()
  updateEnemies()
  resolveBulletHits()
end

draw = function()
  screen.fillRect(0, 0, screen.width, screen.height, "#05111f")
  screen.drawText(titleText, 0, -92, 8, "#dbeafe")
  screen.drawText("Score: " + game.score + "  Lives: " + game.lives, 0, -78, 5, "#cbd5e1")
  screen.drawText(controlsText, 0, 92, 5, "#94a3b8")
  screen.drawText(game.message, 0, 78, 5, "#94a3b8")

  screen.fillRound(game.player.x, game.player.y, game.player.w, game.player.h, "#38bdf8")
  screen.drawRound(game.player.x, game.player.y, game.player.w + 1, game.player.h + 1, "#0ea5e9")

  for i = 0 to game.bullets.length - 1
    bullet = game.bullets[i]
    screen.fillRect(bullet.x, bullet.y, bullet.w, bullet.h, "#fbbf24")
  end

  for i = 0 to game.enemies.length - 1
    enemy = game.enemies[i]
    screen.fillRound(enemy.x, enemy.y, enemy.w, enemy.h, "#fb7185")
  end

  if game.gameOver then
    screen.drawText("Game Over", 0, -6, 10, "#fca5a5")
    screen.drawText("Press Space or R to restart", 0, 10, 6, "#f8fafc")
  end
end
`;
}

function buildFallbackGameCode(plan, resolvedPhysics, language = "microScript", request = null) {
  const config = gameLanguageConfig(language);
  if (config.language === "microStudioJavaScript") {
    if (isTicTacToeRequest(request)) {
      return buildMicroStudioJavaScriptTicTacToeFallbackGameCode(plan, request);
    }
    if (isPuzzleRequest(request)) {
      return buildMicroStudioJavaScriptPuzzleFallbackGameCode(plan, request);
    }
    if (isRacingRequest(request)) {
      return buildMicroStudioJavaScriptRacingFallbackGameCode(plan, request);
    }
    if (isTopDownAdventureRequest(request)) {
      return buildMicroStudioJavaScriptTopDownAdventureFallbackGameCode(plan, request);
    }
    if (isPlatformerRequest(request)) {
      return buildMicroStudioJavaScriptPlatformerFallbackGameCode(plan, request);
    }
    if (isShooterRequest(request)) {
      return buildMicroStudioJavaScriptShooterFallbackGameCode(plan, request);
    }
    return buildMicroStudioJavaScriptFallbackGameCode(plan, resolvedPhysics, request);
  }
  if (isPuzzleRequest(request)) {
    return buildMicroScriptPuzzleFallbackGameCode(plan, request);
  }
  if (isRacingRequest(request)) {
    return buildMicroScriptRacingFallbackGameCode(plan, request);
  }
  if (isTopDownAdventureRequest(request)) {
    return buildMicroScriptTopDownAdventureFallbackGameCode(plan, request);
  }
  if (isPlatformerRequest(request)) {
    return buildMicroScriptPlatformerFallbackGameCode(plan, request);
  }
  if (isShooterRequest(request)) {
    return buildMicroScriptShooterFallbackGameCode(plan, request);
  }
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlText = JSON.stringify((plan.gameDesign && Array.isArray(plan.gameDesign.controls) && plan.gameDesign.controls.length > 0)
    ? plan.gameDesign.controls.join(" | ")
    : "Arrow keys to move. Space or R to restart.");
  const useMatter = resolvedPhysics === "matterjs";
  return useMatter
    ? `// ${title}
// ${description}
// Safe microScript Matter.js starter. Keep object counts bounded for performance.

game = object
  engine = 0
  world = 0
  player = 0
  spawned = []
  spawnCounter = 0
  maxBodies = 24
end

controlsText = ${controlText}

resetGame = function()
  if game.world and game.engine then
    Matter.World.clear(game.world, false)
    Matter.Engine.clear(game.engine)
  end

  game.spawned = []
  game.spawnCounter = 0
  game.engine = Matter.Engine.create()
  game.world = game.engine.world
  game.world.gravity.y = 1

  ground = Matter.Bodies.rectangle(0, 112, 220, 20, object
    isStatic = true
  end)
  leftWall = Matter.Bodies.rectangle(-110, 0, 20, 240, object
    isStatic = true
  end)
  rightWall = Matter.Bodies.rectangle(110, 0, 20, 240, object
    isStatic = true
  end)
  topWall = Matter.Bodies.rectangle(0, -120, 220, 20, object
    isStatic = true
  end)

  Matter.World.add(game.world, [ground, leftWall, rightWall, topWall])

  game.player = Matter.Bodies.circle(-60, 40, 10, object
    frictionAir = 0.06
    restitution = 0.2
  end)
  Matter.World.add(game.world, game.player)
end

spawnOrb = function()
  if game.spawned.length >= game.maxBodies then
    oldBody = game.spawned[0]
    Matter.World.remove(game.world, oldBody)
    game.spawned.remove(0)
  end

  body = Matter.Bodies.circle(random.next() * 80 - 40, -90, 7, object
    restitution = 0.6
  end)
  game.spawned.push(body)
  Matter.World.add(game.world, body)
end

drawBody = function(body, color)
  if body.circleRadius then
    screen.fillRound(body.position.x, body.position.y, body.circleRadius, body.circleRadius, color)
  else
    bounds = body.bounds
    screen.fillRect(body.position.x, body.position.y, bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, color)
  end
end

init = function()
  resetGame()
end

update = function()
  if not game.engine then
    resetGame()
  end

  if keyboard.press.SPACE or keyboard.press.KEY_R then
    resetGame()
    return
  end

  if keyboard.LEFT then
    Matter.Body.applyForce(game.player, game.player.position, object
      x = -0.0025
      y = 0
    end)
  end
  if keyboard.RIGHT then
    Matter.Body.applyForce(game.player, game.player.position, object
      x = 0.0025
      y = 0
    end)
  end
  if keyboard.UP then
    Matter.Body.applyForce(game.player, game.player.position, object
      x = 0
      y = -0.003
    end)
  end
  if keyboard.DOWN then
    Matter.Body.applyForce(game.player, game.player.position, object
      x = 0
      y = 0.003
    end)
  end

  game.spawnCounter += 1
  if game.spawnCounter >= 90 then
    game.spawnCounter = 0
    spawnOrb()
  end

  Matter.Engine.update(game.engine, 1000 / 60)
end

draw = function()
  screen.fillRect(0, 0, screen.width, screen.height, "#08111f")
  screen.drawText(${title}, 0, -92, 8, "#dbeafe")
  screen.drawText(controlsText, 0, 92, 5, "#cbd5e1")
  drawBody(game.player, "#38bdf8")

  for i = 0 to game.spawned.length - 1
    drawBody(game.spawned[i], "#fbbf24")
  end

  screen.drawText("Press Space or R to restart", 0, 76, 5, "#94a3b8")
end
`
    : `// ${title}
// ${description}
// Safe microScript arcade starter. Keep active objects bounded for performance.

game = object
  player = object
    x = 0
    y = 62
    vx = 0
    vy = 0
    size = 12
  end
  stars = []
  score = 0
  lives = 3
  spawnTimer = 0
  gameOver = false
  message = "Use the arrow keys to move."
  time = 0
  maxStars = 36
end

controlsText = ${controlText}

resetGame = function()
  game.player.x = 0
  game.player.y = 62
  game.player.vx = 0
  game.player.vy = 0
  game.player.size = 12
  game.stars = []
  game.score = 0
  game.lives = 3
  game.spawnTimer = 0
  game.gameOver = false
  game.message = "Use the arrow keys to move."
  game.time = 0
end

spawnStar = function()
  if game.stars.length >= game.maxStars then
    return
  end

  star = object
    x = random.next() * 180 - 90
    y = -100
    vx = (random.next() - 0.5) * 0.7
    vy = 1.4 + random.next() * 1.2
    size = 8
  end
  game.stars.push(star)
end

hit = function(ax, ay, a_size, bx, b_y, b_size)
  return abs(ax - bx) < (a_size + b_size) * 0.55 and abs(ay - b_y) < (a_size + b_size) * 0.55
end

init = function()
  resetGame()
end

update = function()
  if not game then
    resetGame()
  end

  if keyboard.press.SPACE or keyboard.press.KEY_R then
    resetGame()
    return
  end

  if game.gameOver then
    return
  end

  game.time += 1

  if keyboard.LEFT then
    game.player.vx -= 0.5
  end
  if keyboard.RIGHT then
    game.player.vx += 0.5
  end
  if keyboard.UP then
    game.player.vy -= 0.5
  end
  if keyboard.DOWN then
    game.player.vy += 0.5
  end

  game.player.vx *= 0.86
  game.player.vy *= 0.86
  game.player.x += game.player.vx
  game.player.y += game.player.vy

  if game.player.x < -94 then
    game.player.x = -94
  end
  if game.player.x > 94 then
    game.player.x = 94
  end
  if game.player.y < -84 then
    game.player.y = -84
  end
  if game.player.y > 84 then
    game.player.y = 84
  end

  game.spawnTimer -= 1
  if game.spawnTimer <= 0 then
    game.spawnTimer = 32
    spawnStar()
  end

  for i = game.stars.length - 1 to 0 by -1
    star = game.stars[i]
    star.x += star.vx
    star.y += star.vy

    if hit(game.player.x, game.player.y, game.player.size, star.x, star.y, star.size) then
      game.score += 1
      game.stars.remove(i)
    elsif star.y > 110 then
      game.stars.remove(i)
      game.lives -= 1
      if game.lives <= 0 then
        game.gameOver = true
      end
    end
  end
end

draw = function()
  screen.fillRect(0, 0, screen.width, screen.height, "#0f172a")
  screen.drawText(${title}, 0, -92, 8, "#e2e8f0")
  screen.drawText("Score: " + game.score + "  Lives: " + game.lives, 0, -78, 5, "#cbd5e1")
  screen.drawText(controlsText, 0, 92, 5, "#cbd5e1")

  screen.fillRound(game.player.x, game.player.y, game.player.size, game.player.size, "#38bdf8")
  screen.drawRound(game.player.x, game.player.y, game.player.size + 1, game.player.size + 1, "#0ea5e9")

  for i = 0 to game.stars.length - 1
    star = game.stars[i]
    screen.fillRound(star.x, star.y, star.size, star.size, "#fbbf24")
  end

  if game.gameOver then
    screen.drawText("Game Over", 0, -6, 10, "#fca5a5")
    screen.drawText("Press Space or R to restart", 0, 10, 6, "#f8fafc")
  end
end
`;
}

function buildGameProjectSchema(language, request, resolvedPhysics) {
  const config = gameLanguageConfig(language);
  return {
    project: {
      title: "string",
      slug: "string",
      description: "string",
      language: config.language,
      runtime: "microStudio",
      graphics: "basic",
      libraries: resolvedPhysics ? ["matter.js"] : [],
      aspectRatio: request.aspectRatio,
      orientation: request.aspectRatio === "portrait" ? "portrait" : "landscape",
      difficulty: request.difficulty
    },
    gameDesign: {
      genre: "string",
      coreLoop: "string",
      controls: ["string"],
      winCondition: "string",
      loseCondition: "string",
      entities: [
        {
          name: "string",
          role: "player",
          description: "string"
        }
      ]
    },
    files: [
      {
        path: mainPathForLanguage(config.language),
        type: "code",
        content: config.language === "microStudioJavaScript" ? "microStudioJavaScript source code only" : "microScript source code only"
      },
      {
        path: "doc/README.md",
        type: "doc",
        content: "string"
      }
    ],
    sprites: [],
    maps: [],
    imageAssets: [],
    warnings: [],
    nextSteps: []
  };
}

function buildMicroStudioDocGrounding() {
  return [
    "microStudio is an integrated game development environment with a sprite editor, a map editor, a code editor, instant online testing, mobile install support, collaboration, and community sharing.",
    "Use microStudio-native APIs and project assets instead of browser canvas or DOM APIs.",
    "The runtime is built around init(), update(), and draw(); keep update() focused on game logic and draw() focused on rendering.",
    "Use the built-in screen, keyboard, mouse, touch, audio, sprites, maps, storage, and system objects when they fit the game concept.",
    "Keep projects small, playable, and easy to extend inside the microStudio editors."
  ].join(" ");
}

function buildMicroStudioCorePromptRules() {
  return [
    "Treat the sprite editor and map editor as first-class parts of the workflow; use sprites for characters/UI art and maps for tile layouts or level structure whenever they improve the game.",
    "Prefer a compact, playable starter with a small state object, a few helper functions, and bounded arrays for enemies, bullets, coins, particles, or hazards.",
    "Keep init() for setup, update() for simulation and input, and draw() for rendering only.",
    "Use microStudio drawing calls for all output and keep the game readable on the built-in Play screen.",
    "Remove off-screen or spent objects promptly, and avoid unbounded spawning or large transient allocations."
  ].join(" ");
}

function buildMicroStudioInputPromptRules() {
  return [
    "Use keyboard.press for edge-triggered actions like restart, jump, fire, or confirm; use held keyboard keys for continuous movement.",
    "Use mouse.pressed and mouse.press for clicks, touch.press and touch.touching for touch controls, and gamepad.press or gamepad states when controller support is a fit.",
    "Choose controls that match the genre: arrow keys or WASD for movement, Space for jump or fire, and mouse/touch for grid, board, or pointer-driven games."
  ].join(" ");
}

function buildMicroScriptSyntaxPromptRules() {
  return [
    "Use microScript syntax only: object/end literals, if/then/elsif/else/end conditionals, and/or/not operators, for ... to ... by ... loops, and function = function() definitions.",
    "Use microScript built-ins such as abs(), floor(), round(), min(), max(), random.next(), and random.nextInt().",
    "Use list methods like push(), remove(), and splice-style array operations that match microScript conventions, and keep variable names free of JavaScript-only syntax.",
    "Do not use braces, semicolons, arrow functions, const/let/var declarations, Math.*, ===, !==, ||, &&, or browser APIs."
  ].join(" ");
}

function buildMicroStudioJavaScriptSyntaxPromptRules() {
  return [
    "Use microStudio JavaScript syntax only: function declarations, braces, semicolons, const/let, arrays, objects, Math.*, ===/!==, &&/||, and !.",
    "Use microStudio runtime globals such as screen, keyboard, mouse, touch, gamepad, audio, sprites, maps, storage, and system as documented.",
    "Prefer small helper functions, plain objects, and array methods like push(), splice(), shift(), and pop() for game state.",
    "Do not use microScript keywords or syntax such as object/end, then/elsif/end conditionals, or assignment-style function definitions."
  ].join(" ");
}

function buildMicroStudioGenrePromptRules(request) {
  const text = `${request && request.idea ? request.idea : ""} ${request && request.gameDesign && request.gameDesign.genre ? request.gameDesign.genre : ""} ${request && request.gameDesign && request.gameDesign.coreLoop ? request.gameDesign.coreLoop : ""}`.toLowerCase();
  const rules = [];
  if (isPuzzleRequest(request)) {
    rules.push("For a puzzle, use a compact board state, limited legal moves, clear win conditions, and mouse or touch interactions that fit tile swapping, matching, ordering, or path completion.");
  }
  if (isPlatformerRequest(request)) {
    rules.push("For a platformer, use gravity, a jump arc, simple collision against platforms, a bounded camera or fixed room, a goal, and a small number of collectibles or hazards.");
  }
  if (isShooterRequest(request)) {
    rules.push("For a shooter, use movement, fire cooldowns, capped bullets, capped enemies, spawn timers, simple hit detection, score, and lives.");
  }
  if (isRacingRequest(request)) {
    rules.push("For a racing game, use a compact track, checkpoint gates, steering or lane control, speed management, and a clear finish state.");
  }
  if (isTopDownAdventureRequest(request)) {
    rules.push("For a top-down adventure, use room exploration, walls, keys, doors, pickups, and exit or quest triggers with simple collision.");
  }
  if (/grid|board|puzzle|turn[-\s]?based|match|tac[-\s]?toe|sudoku|card/.test(text)) {
    rules.push("For a grid or board game, use simple shapes, lines, pointer input, and clear state text instead of browser canvas habits.");
  }
  if (/sprite|tile|map|level|maze|platform/.test(text)) {
    rules.push("If the game benefits from authored content, lean on sprites and maps instead of hardcoding every visual element.");
  }
  return rules.join(" ");
}

function buildMicroScriptSystemPrompt(request, resolvedPhysics) {
  return [
    "You are an expert microStudio microScript game developer.",
    buildMicroStudioDocGrounding(),
    buildMicroStudioCorePromptRules(),
    "Generate a complete, playable starter 2D game project using microScript only.",
    "Return only valid JSON. Do not use markdown or code fences.",
    "Every source file must use microScript syntax only.",
    "Required lifecycle callbacks: init = function(), update = function(), draw = function().",
    "Do not generate JavaScript syntax, and do not mix languages.",
    "Prefer microStudio drawing/input APIs such as screen.fillRect, screen.drawRect, screen.fillRound, screen.drawRound, screen.drawLine, screen.drawText, screen.drawSprite, screen.drawMap, keyboard.press.KEY_R, mouse.pressed, mouse.press, mouse.x, mouse.y, touch.press, touch.touching, and gamepad when appropriate.",
    buildMicroStudioInputPromptRules(),
    buildMicroStudioGenrePromptRules(request),
    "If the prompt suggests a puzzle, prefer a small board, explicit state transitions, and a clear success condition such as tile ordering, matching, or path completion.",
    resolvedPhysics ? "Matter.js is enabled; create and clear the engine safely and keep body counts bounded." : "Do not use Matter.js unless the game concept explicitly needs rigid-body physics.",
    `Use ${mainPathForLanguage("microScript")} in the JSON schema, and keep the generated code free of browser/network/DOM APIs.`,
    buildMicroScriptSyntaxPromptRules(),
    "Keep update() lightweight and bounded. Remove off-screen objects. Avoid large allocations in draw()."
  ].join(" ");
}

function buildMicroStudioJavaScriptSystemPrompt(request, resolvedPhysics) {
  return [
    "You are an expert microStudio JavaScript game developer.",
    buildMicroStudioDocGrounding(),
    buildMicroStudioCorePromptRules(),
    "Generate a complete, playable starter 2D game project using microStudio JavaScript only.",
    "Return only valid JSON. Do not use markdown or code fences.",
    "Every source file must use microStudio JavaScript syntax only.",
    "Required lifecycle callbacks: function init(), function update(), function draw().",
    "Do not generate microScript syntax, and do not mix languages.",
    "Use microStudio runtime objects and methods such as screen.fillRect, screen.drawRect, screen.fillRound, screen.drawRound, screen.drawLine, screen.drawText, screen.drawSprite, screen.drawMap, keyboard.press.KEY_R, mouse.pressed, mouse.press, mouse.x, mouse.y, touch.press, touch.touching, and gamepad when appropriate.",
    "Do not use browser or canvas APIs such as line(), circle(), rect(), fillText(), strokeText(), strokeStyle, fillStyle, document, window, addEventListener, onMouseDown, onMouseUp, or onClick.",
    buildMicroStudioInputPromptRules(),
    buildMicroStudioGenrePromptRules(request),
    "If the prompt suggests a puzzle, prefer a small board, explicit state transitions, and a clear success condition such as tile ordering, matching, or path completion.",
    resolvedPhysics ? "Matter.js is enabled; create and clear the engine safely and keep body counts bounded." : "Do not use Matter.js unless the game concept explicitly needs rigid-body physics.",
    `Use ${mainPathForLanguage("microStudioJavaScript")} in the JSON schema, and keep the generated code free of browser/network/DOM APIs.`,
    buildMicroStudioJavaScriptSyntaxPromptRules(),
    "Keep update() lightweight and bounded. Remove off-screen objects. Avoid large allocations in draw()."
  ].join(" ");
}

function buildMicroScriptUserPrompt(request, resolvedPhysics) {
  return [
    "Generate a microStudio microScript game project.",
    buildMicroStudioDocGrounding(),
    buildMicroStudioCorePromptRules(),
    `Idea: ${request.idea}`,
    "Language: microScript",
    `Physics: ${request.physics}`,
    `Resolved physics: ${resolvedPhysics ? "matterjs" : "manual"}`,
    `Difficulty: ${request.difficulty}`,
    `Aspect ratio: ${request.aspectRatio}`,
    `Generate images: ${request.generateImages}`,
    buildMicroStudioGenrePromptRules(request),
    "Return only JSON in this exact shape:",
    JSON.stringify(buildGameProjectSchema("microScript", request, resolvedPhysics), null, 2)
  ].join("\n");
}

function buildMicroStudioJavaScriptUserPrompt(request, resolvedPhysics) {
  return [
    "Generate a microStudio JavaScript game project.",
    buildMicroStudioDocGrounding(),
    buildMicroStudioCorePromptRules(),
    `Idea: ${request.idea}`,
    "Language: microStudioJavaScript",
    `Physics: ${request.physics}`,
    `Resolved physics: ${resolvedPhysics ? "matterjs" : "manual"}`,
    `Difficulty: ${request.difficulty}`,
    `Aspect ratio: ${request.aspectRatio}`,
    `Generate images: ${request.generateImages}`,
    buildMicroStudioGenrePromptRules(request),
    "Return only JSON in this exact shape:",
    JSON.stringify(buildGameProjectSchema("microStudioJavaScript", request, resolvedPhysics), null, 2)
  ].join("\n");
}

function buildMicroStudioJavaScriptTicTacToeFallbackGameCode(plan, request) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlsText = JSON.stringify("Click a cell | Space or R to restart");
  return `// ${title}
// ${description}
// Safe microStudio JavaScript tic-tac-toe starter.

const game = {
  cells: [],
  currentPlayer: "X",
  winner: "",
  gameOver: false,
  prevMousePressed: false,
  boardLeft: -54,
  boardTop: -54,
  cellSize: 36,
  status: "Click a cell to play."
};

const titleText = ${title};
const controlsText = ${controlsText};

function resetGame() {
  game.cells = ["", "", "", "", "", "", "", "", ""];
  game.currentPlayer = "X";
  game.winner = "";
  game.gameOver = false;
  game.prevMousePressed = false;
  game.status = "X starts. Click a cell.";
}

function getCellIndex(x, y) {
  if (x < game.boardLeft || y < game.boardTop) {
    return -1;
  }
  if (x >= game.boardLeft + game.cellSize * 3 || y >= game.boardTop + game.cellSize * 3) {
    return -1;
  }
  const col = Math.floor((x - game.boardLeft) / game.cellSize);
  const row = Math.floor((y - game.boardTop) / game.cellSize);
  return row * 3 + col;
}

function checkWinner() {
  const c = game.cells;
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const a = c[line[0]];
    if (a && a === c[line[1]] && a === c[line[2]]) {
      return a;
    }
  }
  return "";
}

function isDraw() {
  for (let i = 0; i < game.cells.length; i += 1) {
    if (!game.cells[i]) {
      return false;
    }
  }
  return true;
}

function placeMove(index) {
  if (index < 0 || index >= game.cells.length) {
    return;
  }
  if (game.cells[index] || game.gameOver) {
    return;
  }
  game.cells[index] = game.currentPlayer;
  const winner = checkWinner();
  if (winner) {
    game.gameOver = true;
    game.winner = winner;
    game.status = winner + " wins!";
    return;
  }
  if (isDraw()) {
    game.gameOver = true;
    game.winner = "";
    game.status = "Draw.";
    return;
  }
  game.currentPlayer = game.currentPlayer === "X" ? "O" : "X";
  game.status = game.currentPlayer + " to play.";
}

function handleClick() {
  const index = getCellIndex(mouse.x, mouse.y);
  if (index >= 0) {
    placeMove(index);
  }
}

function init() {
  resetGame();
}

function update() {
  if (keyboard.press.SPACE || keyboard.press.KEY_R) {
    resetGame();
    return;
  }
  if (game.gameOver) {
    game.prevMousePressed = mouse.pressed;
    return;
  }
  if (mouse.pressed && !game.prevMousePressed) {
    handleClick();
  }
  game.prevMousePressed = mouse.pressed;
}

function draw() {
  screen.fillRect(0, 0, screen.width, screen.height, "#0f172a");
  screen.drawText(titleText, 0, -92, 8, "#e2e8f0");
  screen.drawText(game.status, 0, 90, 5, "#cbd5e1");
  screen.drawText(controlsText, 0, 76, 5, "#94a3b8");

  const boardLeft = game.boardLeft;
  const boardTop = game.boardTop;
  const boardSize = game.cellSize * 3;
  const boardRight = boardLeft + boardSize;
  const boardBottom = boardTop + boardSize;

  screen.drawLine(boardLeft, boardTop, boardRight, boardTop, "#64748b");
  screen.drawLine(boardLeft, boardBottom, boardRight, boardBottom, "#64748b");
  screen.drawLine(boardLeft, boardTop, boardLeft, boardBottom, "#64748b");
  screen.drawLine(boardRight, boardTop, boardRight, boardBottom, "#64748b");

  for (let i = 1; i < 3; i += 1) {
    const x = boardLeft + i * game.cellSize;
    const y = boardTop + i * game.cellSize;
    screen.drawLine(x, boardTop, x, boardBottom, "#64748b");
    screen.drawLine(boardLeft, y, boardRight, y, "#64748b");
  }

  for (let index = 0; index < game.cells.length; index += 1) {
    const value = game.cells[index];
    if (!value) {
      continue;
    }
    const col = index % 3;
    const row = Math.floor(index / 3);
    const centerX = boardLeft + col * game.cellSize + game.cellSize / 2;
    const centerY = boardTop + row * game.cellSize + game.cellSize / 2;
    screen.drawText(value, centerX, centerY, 18, value === "X" ? "#f8fafc" : "#fbbf24");
  }

  if (game.gameOver) {
    screen.drawText(game.winner ? game.winner + " wins" : "Draw", 0, -6, 10, "#fca5a5");
  }
}
`;
}

function buildMicroStudioJavaScriptFallbackGameCode(plan, resolvedPhysics, request = null) {
  if (isTicTacToeRequest(request)) {
    return buildMicroStudioJavaScriptTicTacToeFallbackGameCode(plan, request);
  }
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlText = JSON.stringify((plan.gameDesign && Array.isArray(plan.gameDesign.controls) && plan.gameDesign.controls.length > 0)
    ? plan.gameDesign.controls.join(" | ")
    : "Arrow keys to move. Space or R to restart.");
  if (resolvedPhysics === "matterjs") {
    return `// ${title}
// ${description}
// Safe microStudio JavaScript Matter.js starter. Keep body counts bounded for performance.

const game = {
  engine: null,
  world: null,
  player: null,
  spawned: [],
  spawnCounter: 0,
  maxBodies: 24
};

const controlsText = ${controlText};

function resetGame() {
  if (game.world && game.engine && typeof Matter !== "undefined") {
    Matter.World.clear(game.world, false);
    Matter.Engine.clear(game.engine);
  }

  game.spawned = [];
  game.spawnCounter = 0;
  game.engine = Matter.Engine.create();
  game.world = game.engine.world;
  game.world.gravity.y = 1;

  const ground = Matter.Bodies.rectangle(0, 112, 220, 20, { isStatic: true });
  const leftWall = Matter.Bodies.rectangle(-110, 0, 20, 240, { isStatic: true });
  const rightWall = Matter.Bodies.rectangle(110, 0, 20, 240, { isStatic: true });
  const topWall = Matter.Bodies.rectangle(0, -120, 220, 20, { isStatic: true });
  Matter.World.add(game.world, [ground, leftWall, rightWall, topWall]);

  game.player = Matter.Bodies.circle(-60, 40, 10, { frictionAir: 0.06, restitution: 0.2 });
  Matter.World.add(game.world, game.player);
}

function spawnOrb() {
  if (game.spawned.length >= game.maxBodies) {
    const oldBody = game.spawned.shift();
    if (oldBody) {
      Matter.World.remove(game.world, oldBody);
    }
  }

  const body = Matter.Bodies.circle(random.next() * 80 - 40, -90, 7, { restitution: 0.6 });
  game.spawned.push(body);
  Matter.World.add(game.world, body);
}

function drawBody(body, color) {
  if (!body) {
    return;
  }
  if (body.circleRadius) {
    screen.fillRound(body.position.x, body.position.y, body.circleRadius, body.circleRadius, color);
  } else if (body.bounds) {
    const bounds = body.bounds;
    screen.fillRect(body.position.x, body.position.y, bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, color);
  }
}

function init() {
  resetGame();
}

function update() {
  if (!game.engine) {
    resetGame();
  }

  if (keyboard.press.SPACE || keyboard.press.KEY_R) {
    resetGame();
    return;
  }

  if (keyboard.LEFT) {
    Matter.Body.applyForce(game.player, game.player.position, { x: -0.0025, y: 0 });
  }
  if (keyboard.RIGHT) {
    Matter.Body.applyForce(game.player, game.player.position, { x: 0.0025, y: 0 });
  }
  if (keyboard.UP) {
    Matter.Body.applyForce(game.player, game.player.position, { x: 0, y: -0.003 });
  }
  if (keyboard.DOWN) {
    Matter.Body.applyForce(game.player, game.player.position, { x: 0, y: 0.003 });
  }

  game.spawnCounter += 1;
  if (game.spawnCounter >= 90) {
    game.spawnCounter = 0;
    spawnOrb();
  }

  Matter.Engine.update(game.engine, 1000 / 60);
}

function draw() {
  screen.fillRect(0, 0, screen.width, screen.height, "#08111f");
  screen.drawText(${title}, 0, -92, 8, "#dbeafe");
  screen.drawText(controlsText, 0, 92, 5, "#cbd5e1");
  drawBody(game.player, "#38bdf8");
  for (let i = 0; i < game.spawned.length; i += 1) {
    drawBody(game.spawned[i], "#fbbf24");
  }
  screen.drawText("Press Space or R to restart", 0, 76, 5, "#94a3b8");
}
`;
  }

  return `// ${title}
// ${description}
// Safe microStudio JavaScript arcade starter. Keep active objects bounded for performance.

const game = {
  player: {
    x: 0,
    y: 62,
    vx: 0,
    vy: 0,
    size: 12
  },
  stars: [],
  score: 0,
  lives: 3,
  spawnTimer: 0,
  gameOver: false,
  message: "Use the arrow keys to move.",
  time: 0,
  maxStars: 36
};

const controlsText = ${controlText};

function resetGame() {
  game.player.x = 0;
  game.player.y = 62;
  game.player.vx = 0;
  game.player.vy = 0;
  game.player.size = 12;
  game.stars = [];
  game.score = 0;
  game.lives = 3;
  game.spawnTimer = 0;
  game.gameOver = false;
  game.message = "Use the arrow keys to move.";
  game.time = 0;
}

function spawnStar() {
  if (game.stars.length >= game.maxStars) {
    return;
  }

  const star = {
    x: random.next() * 180 - 90,
    y: -100,
    vx: (random.next() - 0.5) * 0.7,
    vy: 1.4 + random.next() * 1.2,
    size: 8
  };
  game.stars.push(star);
}

function hit(ax, ay, aSize, bx, by, bSize) {
  return Math.abs(ax - bx) < (aSize + bSize) * 0.55 && Math.abs(ay - by) < (aSize + bSize) * 0.55;
}

function init() {
  resetGame();
}

function update() {
  if (keyboard.press.SPACE || keyboard.press.KEY_R) {
    resetGame();
    return;
  }

  if (game.gameOver) {
    return;
  }

  game.time += 1;

  if (keyboard.LEFT) {
    game.player.vx -= 0.5;
  }
  if (keyboard.RIGHT) {
    game.player.vx += 0.5;
  }
  if (keyboard.UP) {
    game.player.vy -= 0.5;
  }
  if (keyboard.DOWN) {
    game.player.vy += 0.5;
  }

  game.player.vx *= 0.94;
  game.player.vy *= 0.94;
  game.player.x += game.player.vx;
  game.player.y += game.player.vy;

  game.player.x = Math.max(-92, Math.min(92, game.player.x));
  game.player.y = Math.max(-92, Math.min(92, game.player.y));

  game.spawnTimer -= 1;
  if (game.spawnTimer <= 0) {
    game.spawnTimer = 32;
    spawnStar();
  }

  for (let i = game.stars.length - 1; i >= 0; i -= 1) {
    const star = game.stars[i];
    star.x += star.vx;
    star.y += star.vy;

    if (hit(game.player.x, game.player.y, game.player.size, star.x, star.y, star.size)) {
      game.score += 1;
      game.stars.splice(i, 1);
    } else if (star.y > 110) {
      game.stars.splice(i, 1);
      game.lives -= 1;
      if (game.lives <= 0) {
        game.gameOver = true;
      }
    }
  }
}

function draw() {
  screen.fillRect(0, 0, screen.width, screen.height, "#0f172a");
  screen.drawText(${title}, 0, -92, 8, "#e2e8f0");
  screen.drawText("Score: " + game.score + "  Lives: " + game.lives, 0, -78, 5, "#cbd5e1");
  screen.drawText(controlsText, 0, 92, 5, "#cbd5e1");

  screen.fillRound(game.player.x, game.player.y, game.player.size, game.player.size, "#38bdf8");
  screen.drawRound(game.player.x, game.player.y, game.player.size + 1, game.player.size + 1, "#0ea5e9");

  for (let i = 0; i < game.stars.length; i += 1) {
    const star = game.stars[i];
    screen.fillRound(star.x, star.y, star.size, star.size, "#fbbf24");
  }

  if (game.gameOver) {
    screen.drawText("Game Over", 0, -6, 10, "#fca5a5");
    screen.drawText("Press Space or R to restart", 0, 10, 6, "#f8fafc");
  }
}
`;
}

function createPreviewDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

class AiGameGeneratorService {
  constructor(server, webapp, gateway = null) {
    this.server = server;
    this.webapp = webapp;
    this.gateway = gateway || (server && server.aiGateway ? server.aiGateway : new AiGatewayManager(server));
    this.draftTable = "ai_game_drafts";
    this.backupTable = "ai_game_backups";
    this.imageProviders = {
      openai: () => new OpenAIImageProvider(),
      comfyui: () => new ComfyUIProvider(),
      placeholder: () => new PlaceholderImageProvider()
    };
  }

  get db() {
    return this.server.db;
  }

  getDraftRecord(id) {
    return this.db.get(this.draftTable, id);
  }

  getBackupRecord(id) {
    return this.db.get(this.backupTable, id);
  }

  createDraftRecord(data) {
    return this.db.create(this.draftTable, data);
  }

  createBackupRecord(data) {
    return this.db.create(this.backupTable, data);
  }

  async readFile(fileStorage, path, encoding = "utf8") {
    return new Promise((resolve) => {
      fileStorage.read(path, encoding, (content) => resolve(content));
    });
  }

  async writeFile(fileStorage, path, content) {
    return new Promise((resolve, reject) => {
      try {
        fileStorage.write(path, content, () => resolve());
      } catch (err) {
        reject(err);
      }
    });
  }

  async deleteFile(fileStorage, path) {
    return new Promise((resolve, reject) => {
      try {
        fileStorage["delete"](path, () => resolve());
      } catch (err) {
        reject(err);
      }
    });
  }

  async listFiles(project, folder) {
    if (!project || !project.manager) {
      return [];
    }
    return new Promise((resolve) => {
      project.manager.listFiles(folder, (files) => resolve(Array.isArray(files) ? files : []));
    });
  }

  async readProjectFile(project, path) {
    const content = await this.readFile(project.content.files, `${project.owner.id}/${project.id}/${path}`, "binary");
    return content;
  }

  validateRequest(input) {
    const request = {
      idea: typeof input.idea === "string" ? input.idea.trim() : "",
      language: normalizeGameLanguage(input.language),
      physics: ["none", "auto", "matterjs"].includes(input.physics) ? input.physics : "auto",
      difficulty: ["beginner", "intermediate", "advanced"].includes(input.difficulty) ? input.difficulty : "beginner",
      artStyle: ["placeholder", "pixel-art", "simple-shapes"].includes(input.artStyle) ? input.artStyle : "placeholder",
      aspectRatio: ["16:9", "4:3", "1:1", "portrait"].includes(input.aspectRatio) ? input.aspectRatio : "16:9",
      generateImages: input.generateImages === true,
      imageProvider: normalizeImageProvider(typeof input.imageProvider === "string" ? input.imageProvider : "placeholder"),
      imageProviderProfileId: input.imageProviderProfileId != null ? String(input.imageProviderProfileId) : null,
      imageStyle: normalizeImageStyle(typeof input.imageStyle === "string" ? input.imageStyle : "pixel-art"),
      transparentSprites: input.transparentSprites !== false,
      assetResolution: normalizeAssetResolution(typeof input.assetResolution === "string" ? input.assetResolution : "64x64"),
      providerProfileId: input.providerProfileId != null ? String(input.providerProfileId) : null,
      targetProjectId: input.targetProjectId != null ? String(input.targetProjectId) : null,
      mode: normalizeMode(input.mode),
      constraints: {
        maxFiles: Number.isInteger(input.constraints && input.constraints.maxFiles) ? input.constraints.maxFiles : 32,
        maxFileSizeKb: Number.isInteger(input.constraints && input.constraints.maxFileSizeKb) ? input.constraints.maxFileSizeKb : 256,
        includeDocs: input.constraints && input.constraints.includeDocs !== false,
        includeTutorialComments: input.constraints && input.constraints.includeTutorialComments !== false
      }
    };

    if (!request.idea) {
      throw new Error("idea is required");
    }
    return request;
  }

  async generateGameProject(input, user) {
    const request = this.validateRequest(input);
    if (request.language === "microStudioJavaScript") {
      return this.generateMicroStudioJavaScriptGameProject(request, user);
    }
    return this.generateMicroScriptGameProject(request, user);
  }

  async generateMicroScriptGameProject(request, user) {
    return this.generateGameProjectForLanguage(request, user, gameLanguageConfig("microScript"));
  }

  async generateMicroStudioJavaScriptGameProject(request, user) {
    return this.generateGameProjectForLanguage(request, user, gameLanguageConfig("microStudioJavaScript"));
  }

  async generateJavaScriptGameProject(request, user) {
    return this.generateMicroStudioJavaScriptGameProject(request, user);
  }

  async generateGameProjectForLanguage(request, user, config) {
    const resolvedPhysics = shouldUseMatter(request);
    const systemPrompt = config.language === "microStudioJavaScript"
      ? buildMicroStudioJavaScriptSystemPrompt(request, resolvedPhysics)
      : buildMicroScriptSystemPrompt(request, resolvedPhysics);
    const userPrompt = config.language === "microStudioJavaScript"
      ? buildMicroStudioJavaScriptUserPrompt(request, resolvedPhysics)
      : buildMicroScriptUserPrompt(request, resolvedPhysics);
    const providerResult = await this.gateway.generate({
      feature: config.featureName,
      purpose: "text",
      providerProfileId: request.providerProfileId,
      responseFormat: "json",
      temperature: 0.15,
      maxTokens: 5000,
      userId: user && user.id != null ? user.id : null,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const parsed = this.parseModelJson(providerResult.content);
    const normalized = await this.validateGeneratedProject(parsed, request, resolvedPhysics, user, config);
    normalized.provider = {
      id: providerResult.providerId,
      name: providerResult.providerName,
      modelId: providerResult.modelId
    };
    const targetProject = request.mode === "apply_to_current_project" ? this.getProject(request.targetProjectId) : null;
    return this.createProjectDraft(user, request, normalized, targetProject, resolvedPhysics);
  }

  parseModelJson(content) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw new Error(`Model output was not valid JSON: ${err.message}`);
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Model output must be a JSON object");
    }
    return parsed;
  }

  getProject(projectId) {
    if (projectId == null) {
      return null;
    }
    return this.server.content.projects[projectId] || null;
  }

  async validateGeneratedProject(projectJson, request, resolvedPhysics, user, config) {
    const warnings = Array.isArray(projectJson.warnings) ? projectJson.warnings.filter((w) => typeof w === "string").slice(0, 20) : [];
    const nextSteps = Array.isArray(projectJson.nextSteps) ? projectJson.nextSteps.filter((w) => typeof w === "string").slice(0, 20) : [];
    const projectInfo = projectJson.project || {};
    const title = typeof projectInfo.title === "string" && projectInfo.title.trim() ? projectInfo.title.trim() : this.fallbackTitle(request.idea);
    const slug = slugify(typeof projectInfo.slug === "string" ? projectInfo.slug : title);
    const description = typeof projectInfo.description === "string" ? projectInfo.description.trim().slice(0, 1000) : "";
    const libraries = resolvedPhysics ? ["matter.js"] : [];
    const gameDesign = this.validateGameDesign(projectJson.gameDesign, request);
    const languageConfig = config || gameLanguageConfig(request.language);
    const filesResult = await this.sanitizeGeneratedFiles(projectJson.files, request, resolvedPhysics, warnings, languageConfig);
    const imageAssets = request.generateImages
      ? await this.validateGeneratedImageAssets(projectJson.imageAssets, request, warnings, title, slug, user, languageConfig)
      : [];
    const imageFiles = request.generateImages
      ? await this.generateImageAssetFiles(imageAssets, request, warnings, title, slug, user)
      : [];
    const spriteFiles = request.generateImages
      ? []
      : await this.createSpriteFiles(projectJson.sprites, request, warnings, title, slug);
    const mapFiles = await this.createMapFiles(projectJson.maps, request, warnings, title, slug);
    const scaffoldFiles = await this.createScaffoldFiles(request, warnings, title, slug, resolvedPhysics, spriteFiles.length === 0 && imageFiles.length === 0, mapFiles.length === 0);

    let files = [...filesResult.files, ...spriteFiles, ...imageFiles, ...mapFiles, ...scaffoldFiles];
    files = uniqueByPath(files);

    if (files.length > request.constraints.maxFiles) {
      throw new Error(`Generated project contains too many files (${files.length} > ${request.constraints.maxFiles})`);
    }

    const mainFile = files.find((file) => file.path === `${languageConfig.sourceRoot}/main.${languageConfig.sourceExt}`);
    if (mainFile == null) {
      files.unshift({
        path: `${languageConfig.sourceRoot}/main.${languageConfig.sourceExt}`,
        type: "code",
        content: buildFallbackGameCode({
          project: { title, description },
          gameDesign,
          nextSteps
        }, resolvedPhysics, languageConfig.language, request),
        encoding: "utf8",
        sourcePath: languageConfig.modelSourcePath,
        preview: "Fallback starter code inserted by server"
      });
    }

    const docFile = files.find((file) => file.path === "doc/README.md");
    if (docFile == null && request.constraints.includeDocs) {
      files.push({
        path: "doc/README.md",
        type: "doc",
        content: buildFallbackDoc({
          project: { title, description },
          gameDesign,
          nextSteps
        }, files),
        encoding: "utf8",
        sourcePath: "doc/README.md"
      });
    }

    const normalized = {
      project: {
        title,
        slug,
        description,
        language: languageConfig.language,
        graphics: "basic",
        libraries,
        aspectRatio: request.aspectRatio,
      orientation: request.aspectRatio === "portrait" ? "portrait" : "landscape",
        difficulty: request.difficulty
      },
      gameDesign,
      files,
      imageAssets,
      warnings,
      nextSteps,
      resolvedPhysicsMode: resolvedPhysics ? "matterjs" : "manual",
      request,
      generatedAt: Date.now(),
      userId: user && user.id != null ? user.id : null
    };

    if (!files.some((file) => file.path === "sprites/icon.png")) {
      if (!request.generateImages || !normalized.imageAssets.some((asset) => asset.type === "ui" && /icon|thumbnail/.test(asset.id || ""))) {
        normalized.files.unshift(await this.createIconFile(title, slug));
      }
    }

    if (!normalized.files.some((file) => file.path === "maps/level1.json")) {
      normalized.files.push(await this.createDefaultMapFile(title, slug));
    }

    if (!normalized.files.some((file) => file.path === "assets/README.txt")) {
      normalized.files.push({
        path: "assets/README.txt",
        type: "doc",
        content: "Drop imported art, models, or other assets in this folder.\n",
        encoding: "utf8",
        sourcePath: "assets/README.txt"
      });
    }

    if (!normalized.files.some((file) => file.path === "sounds/README.txt")) {
      normalized.files.push({
        path: "sounds/README.txt",
        type: "doc",
        content: "Sound placeholders live here until you replace them with real audio.\n",
        encoding: "utf8",
        sourcePath: "sounds/README.txt"
      });
    }

    if (!normalized.files.some((file) => file.path === "music/README.txt")) {
      normalized.files.push({
        path: "music/README.txt",
        type: "doc",
        content: "Music placeholders live here until you replace them with real audio.\n",
        encoding: "utf8",
        sourcePath: "music/README.txt"
      });
    }

    if (normalized.files.length > request.constraints.maxFiles) {
      throw new Error(`Generated project contains too many files (${normalized.files.length} > ${request.constraints.maxFiles})`);
    }

    if (request.generateImages && normalized.imageAssets.length > 0) {
      const manifest = buildGeneratedAssetManifest(normalized.imageAssets, languageConfig.language);
      const mainFile = normalized.files.find((file) => file.path === `${languageConfig.sourceRoot}/main.${languageConfig.sourceExt}` && typeof file.content === "string");
      if (mainFile != null && !mainFile.content.includes("GENERATED_IMAGE_ASSETS")) {
        mainFile.content = `${manifest}${mainFile.content}`;
        mainFile.preview = mainFile.content.slice(0, 2000);
      }
      normalized.files.push(buildGeneratedAssetManifestFile(normalized, request));
    }

    return normalized;
  }

  validateGameDesign(gameDesign, request) {
    const safeString = (value, fallback = "") => {
      if (typeof value !== "string") {
        return fallback;
      }
      return value.trim().slice(0, 500) || fallback;
    };
    const entities = Array.isArray(gameDesign && gameDesign.entities) ? gameDesign.entities.slice(0, 20).map((entity) => ({
      name: safeString(entity && entity.name, "entity"),
      role: ["player", "enemy", "collectible", "obstacle", "goal", "ui", "physics-body"].includes(entity && entity.role) ? entity.role : "ui",
      description: safeString(entity && entity.description, "")
    })) : [];
    return {
      genre: safeString(gameDesign && gameDesign.genre, "Arcade"),
      coreLoop: safeString(gameDesign && gameDesign.coreLoop, "Move, interact, and restart when needed."),
      controls: Array.isArray(gameDesign && gameDesign.controls) ? gameDesign.controls.filter((entry) => typeof entry === "string").slice(0, 8) : ["Arrow keys", "Space to restart"],
      winCondition: safeString(gameDesign && gameDesign.winCondition, "Reach the goal."),
      loseCondition: safeString(gameDesign && gameDesign.loseCondition, "Run out of lives."),
      entities
    };
  }

  async sanitizeGeneratedFiles(files, request, resolvedPhysics, warnings, languageConfig) {
    const safeFiles = [];
    const inputFiles = Array.isArray(files) ? files : [];
    let codeFileCount = 0;
    const maxBytes = request.constraints.maxFileSizeKb * 1024;
    for (const file of inputFiles) {
      if (!file || typeof file !== "object") {
        continue;
      }
      const parts = allowedRootFromPath(file.path);
      if (!parts) {
        warnings.push(`Rejected unsupported file path: ${file && file.path ? file.path : "[unknown]"}`);
        continue;
      }
      const root = parts[0];
      const ext = String(parts[parts.length - 1].split(".").pop() || "").toLowerCase();
      const rawName = parts.slice(1).join("/").replace(/\.[^.]+$/, "");
      if (root === "source" || root === languageConfig.sourceRoot) {
        const normalizedPath = normalizeSourcePathForLanguage(`${root}/${rawName}.${ext}`, languageConfig.language);
        if (!normalizedPath) {
          warnings.push(`Rejected source file with empty or invalid name: ${file.path}`);
          continue;
        }
        const content = this.sanitizeCodeContent(file.content, resolvedPhysics, request, warnings, file.path, languageConfig);
        if (Buffer.byteLength(content, "utf8") > maxBytes) {
          throw new Error(`Code file too large: ${file.path}`);
        }
        if (content !== file.content) {
          warnings.push(`Adjusted unsafe or incomplete code in ${file.path}`);
        }
        safeFiles.push({
          path: normalizedPath,
          type: "code",
          content,
          encoding: "utf8",
          sourcePath: file.path,
          preview: content.slice(0, 2000)
        });
        codeFileCount += 1;
        continue;
      }
      if (root === "doc") {
        if (!["md", "txt", "json"].includes(ext)) {
          warnings.push(`Rejected document with unsupported extension: ${file.path}`);
          continue;
        }
        const normalizedPath = normalizeFinalPath("doc", rawName, ext);
        if (!normalizedPath) {
          warnings.push(`Rejected document with empty or invalid name: ${file.path}`);
          continue;
        }
        const content = contentToString(file.content, "utf8");
        if (Buffer.byteLength(content, "utf8") > maxBytes) {
          throw new Error(`Document too large: ${file.path}`);
        }
        safeFiles.push({
          path: normalizedPath,
          type: "doc",
          content,
          encoding: "utf8",
          sourcePath: file.path
        });
        continue;
      }
      warnings.push(`Ignored non-document file from model output: ${file.path}`);
    }

    if (codeFileCount === 0) {
      warnings.push("Model did not provide a usable source file; a safe starter main file will be inserted.");
    }
    return { files: safeFiles, codeFileCount };
  }

  validateGeneratedImageAssets(imageAssets, request, warnings, title, slug, user, languageConfig) {
    const source = Array.isArray(imageAssets) ? imageAssets.slice(0, 16) : [];
    const normalized = [];
    const config = languageConfig || gameLanguageConfig(request.language);
    let index = 0;
    for (const asset of source) {
      if (!asset || typeof asset !== "object") {
        continue;
      }
      const type = normalizeImageType(typeof asset.type === "string" ? asset.type : "sprite");
      const filename = normalizeImageFilename(asset, type, index);
      const usedByFile = normalizeReferencePath(asset.usedByFile || config.modelSourcePath, config.sourceRoot, config.sourceExt);
      const prompt = this.sanitizeImagePrompt(asset.prompt, request, type, title, slug, usedByFile, warnings);
      const size = imageSizeForType(type, asset.width && asset.height ? `${asset.width}x${asset.height}` : request.assetResolution);
      const transparentBackground = type === "background" || type === "title-screen"
        ? false
        : asset.transparentBackground !== false && request.transparentSprites !== false;
      const width = clampImageDimension(asset.width, size.width, 16, 2048);
      const height = clampImageDimension(asset.height, size.height, 16, 2048);
      normalized.push({
        id: sanitizeSegment(asset.id || asset.name || `asset-${index + 1}`),
        type,
        filename,
        prompt,
        width,
        height,
        transparentBackground,
        usedByFile,
        accepted: asset.accepted !== false,
        sourcePrompt: typeof asset.prompt === "string" ? asset.prompt.trim().slice(0, 500) : "",
        provider: request.imageProvider,
        style: request.imageStyle
      });
      index += 1;
    }

    if (request.generateImages && normalized.length === 0) {
      normalized.push(...this.buildFallbackImageAssets(request, title, slug, config));
    }

    const hasPlayer = normalized.some((asset) => asset.type === "sprite" && /player|hero|character/.test(asset.id));
    const hasBackground = normalized.some((asset) => asset.type === "background" || asset.type === "title-screen");
    const hasObject = normalized.some((asset) => asset.type === "sprite" && /enemy|collectible|obstacle|goal|object|item/.test(asset.id));
    const sourcePath = normalizeReferencePath(config.modelSourcePath, config.sourceRoot, config.sourceExt);
    if (!hasPlayer) {
      normalized.unshift(this.buildDefaultImageAsset("player_idle", "sprite", sourcePath, request, title, slug, "A readable game-ready player character sprite"));
    }
    if (!hasBackground) {
      normalized.push(this.buildDefaultImageAsset("background_level_1", "background", sourcePath, request, title, slug, "A simple colorful game background with a clean silhouette"));
    }
    if (!hasObject) {
      normalized.push(this.buildDefaultImageAsset("collectible_star", "sprite", sourcePath, request, title, slug, "A small collectible object sprite with a readable silhouette"));
    }

    const seen = new Set();
    const deduped = [];
    for (const asset of normalized) {
      if (!seen.has(asset.filename)) {
        seen.add(asset.filename);
        deduped.push(asset);
      }
    }
    return deduped.slice(0, 16);
  }

  sanitizeImagePrompt(prompt, request, type, title, slug, usedByFile, warnings) {
    const safe = typeof prompt === "string" ? prompt.trim().replace(/\s+/g, " ") : "";
    const prefix = imagePromptPrefix(request);
    const typeLabel = type === "background" ? "background" : type === "ui" ? "ui element" : "sprite";
    const base = safe.length > 0 ? safe : `A simple ${typeLabel} for ${title}`;
    return `${prefix}; ${base}; used in ${usedByFile}; style=${request.imageStyle}; project=${title}`.slice(0, 420);
  }

  buildDefaultImageAsset(id, type, usedByFile, request, title, slug, prompt, languageConfig = null) {
    const config = languageConfig || gameLanguageConfig(request.language);
    const size = imageSizeForType(type, request.assetResolution);
    return {
      id,
      type,
      filename: normalizeImageFilename({ id }, type, 0),
      prompt: this.sanitizeImagePrompt(prompt, request, type, title, slug, usedByFile, []),
      width: size.width,
      height: size.height,
      transparentBackground: type === "background" ? false : request.transparentSprites !== false,
      usedByFile: normalizeReferencePath(usedByFile, config.sourceRoot, config.sourceExt),
      accepted: true,
      provider: request.imageProvider,
      style: request.imageStyle
    };
  }

  buildFallbackImageAssets(request, title, slug, languageConfig = null) {
    const config = languageConfig || gameLanguageConfig(request.language);
    const sourcePath = mainPathForLanguage(config.language);
    return [
      this.buildDefaultImageAsset("player_idle", "sprite", sourcePath, request, title, slug, "A readable game-ready player character sprite", config),
      this.buildDefaultImageAsset("enemy_basic", "sprite", sourcePath, request, title, slug, "A simple enemy sprite with a distinct silhouette", config),
      this.buildDefaultImageAsset("collectible_star", "sprite", sourcePath, request, title, slug, "A small collectible object sprite with a readable silhouette", config),
      this.buildDefaultImageAsset("background_level_1", "background", sourcePath, request, title, slug, "A simple colorful game background with a clean silhouette", config),
      this.buildDefaultImageAsset("ui_start_button", "ui", sourcePath, request, title, slug, "A simple UI start button with a clean game interface look", config),
      this.buildDefaultImageAsset("game_icon", "ui", sourcePath, request, title, slug, "A clean game icon or thumbnail with a bold silhouette", config)
    ];
  }

  async generateImageAssetFiles(imageAssets, request, warnings, title, slug, user) {
    const items = [];
    const provider = this.gateway && typeof this.gateway.getImageProvider === "function"
      ? this.gateway.getImageProvider({
        imageProvider: request.imageProvider,
        imageProviderProfileId: request.imageProviderProfileId
      })
      : this.getImageProvider(request.imageProvider);
    const assetsList = Array.isArray(imageAssets) ? imageAssets : [];
    for (const asset of assetsList) {
      const rendered = await this.renderImageAsset(provider, asset, request, warnings, title, slug, user);
      items.push(rendered);
    }

    const iconAsset = assetsList.find((asset) => asset.type === "ui" && /icon|thumbnail/.test(asset.id));
    if (iconAsset) {
      const iconFile = items.find((item) => item.assetId === iconAsset.id);
      if (iconFile != null && iconFile.path !== "sprites/icon.png") {
        items.push(Object.assign({}, iconFile, {
          path: "sprites/icon.png",
          sourcePath: `${iconFile.path} (alias)`,
          preview: "project icon alias"
        }));
      }
    }

    const posterAsset = assetsList.find((asset) => asset.type === "background" || asset.type === "title-screen");
    if (posterAsset) {
      const posterFile = items.find((item) => item.assetId === posterAsset.id);
      if (posterFile != null && posterFile.path !== "sprites/poster.png") {
        items.push(Object.assign({}, posterFile, {
          path: "sprites/poster.png",
          sourcePath: `${posterFile.path} (alias)`,
          preview: "poster alias"
        }));
      }
    }

    return uniqueByPath(items);
  }

  async renderImageAsset(provider, asset, request, warnings, title, slug, user) {
    const result = await this.generateImageBuffer(provider, asset, request, warnings, title, slug, user);
    const normalizedBuffer = await this.resizeImageBuffer(result.buffer, asset.width, asset.height, asset.transparentBackground);
    return {
      path: asset.filename,
      type: "image",
      content: normalizedBuffer,
      contentEncoding: "binary",
      contentBase64: normalizedBuffer.toString("base64"),
      previewDataUrl: createPreviewDataUrl(normalizedBuffer),
      preview: asset.prompt,
      sourcePath: asset.filename,
      width: asset.width,
      height: asset.height,
      kind: asset.type,
      assetId: asset.id,
      assetType: asset.type,
      prompt: asset.prompt,
      accepted: asset.accepted !== false,
      transparentBackground: asset.transparentBackground,
      usedByFile: asset.usedByFile,
      provider: asset.provider,
      style: asset.style
    };
  }

  async generateImageBuffer(provider, asset, request, warnings, title, slug, user) {
    try {
      return await provider.generateImage({
        prompt: asset.prompt,
        width: asset.width,
        height: asset.height,
        transparentBackground: asset.transparentBackground,
        style: request.imageStyle,
        title,
        slug,
        userId: user ? user.id : null
      });
    } catch (err) {
      warnings.push(`Image generation failed for ${asset.id}: ${err.message}. A safe placeholder was used.`);
      const placeholder = await new PlaceholderImageProvider().generateImage({
        prompt: asset.prompt,
        width: asset.width,
        height: asset.height,
        transparentBackground: asset.transparentBackground
      });
      return placeholder;
    }
  }

  async resizeImageBuffer(buffer, width, height, transparentBackground) {
    const image = await Jimp.read(buffer);
    image.contain(Math.max(1, width), Math.max(1, height), Jimp.RESIZE_BILINEAR);
    if (!transparentBackground) {
      image.background(0xffffffff);
    }
    return new Promise((resolve, reject) => {
      image.getBuffer(Jimp.MIME_PNG, (err, out) => {
        if (err) {
          reject(err);
        } else {
          resolve(out);
        }
      });
    });
  }

  sanitizeCodeContent(content, resolvedPhysics, request, warnings, sourcePath, languageConfig) {
    const code = typeof content === "string" ? content : "";
    const config = languageConfig || gameLanguageConfig(request.language);
    if (!code.trim()) {
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics, config.language, request);
    }
    if (isUnsafeCode(code)) {
      warnings.push(`Unsafe code patterns were replaced in ${sourcePath || config.modelSourcePath}`);
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics, config.language, request);
    }
    const validation = validateGeneratedCodeForLanguage(code, config.language);
    if (!validation.ok) {
      if (config.language === "microStudioJavaScript") {
        const fallbackGenre = fallbackGenreName(request);
        warnings.push(fallbackGenre === "ticTacToe"
          ? "The AI generated generic browser/canvas JavaScript instead of microStudio JavaScript. A safe microStudio tic-tac-toe fallback was inserted."
          : fallbackGenre === "puzzle"
            ? "The AI generated generic browser/canvas JavaScript instead of microStudio JavaScript. A safe microStudio puzzle fallback was inserted."
            : fallbackGenre === "racing"
              ? "The AI generated generic browser/canvas JavaScript instead of microStudio JavaScript. A safe microStudio racing fallback was inserted."
              : fallbackGenre === "topDownAdventure"
                ? "The AI generated generic browser/canvas JavaScript instead of microStudio JavaScript. A safe microStudio top-down adventure fallback was inserted."
            : fallbackGenre === "platformer"
              ? "The AI generated generic browser/canvas JavaScript instead of microStudio JavaScript. A safe microStudio platformer fallback was inserted."
              : fallbackGenre === "shooter"
                ? "The AI generated generic browser/canvas JavaScript instead of microStudio JavaScript. A safe microStudio shooter fallback was inserted."
              : "The AI generated generic browser/canvas JavaScript instead of microStudio JavaScript. It used unsupported APIs such as line(), fillText(), strokeStyle, or onMouseDown(). The code was rejected and replaced with a safe microStudio-compatible fallback.");
      } else {
        warnings.push(`Invalid microScript in ${sourcePath || config.modelSourcePath}; fallback inserted. Problems: ${validation.errors.slice(0, 5).join(", ")}`);
      }
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics, config.language, request);
    }
    if (config.language === "microScript" && !hasCoreFunctions(code)) {
      warnings.push(`Missing microScript init/update/draw callbacks in ${sourcePath || config.modelSourcePath}; fallback starter inserted.`);
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics, config.language, request);
    }
    return code;
  }

  fallbackTitle(idea) {
    const words = String(idea || "AI Game")
      .replace(/[^a-z0-9\s-]/gi, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 4);
    if (words.length === 0) {
      return "AI Game";
    }
    return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  }

  async createSpriteFiles(sprites, request, warnings, title, slug) {
    const items = [];
    const list = Array.isArray(sprites) ? sprites.slice(0, 12) : [];
    if (list.length === 0) {
      return items;
    }
    let index = 0;
    for (const sprite of list) {
      const name = sanitizeSegment(sprite && sprite.name ? sprite.name : `sprite-${index + 1}`);
      const width = Number.isInteger(sprite && sprite.width) ? sprite.width : 32;
      const height = Number.isInteger(sprite && sprite.height) ? sprite.height : 32;
      const description = sprite && typeof sprite.description === "string" ? sprite.description : "";
      const kind = sprite && sprite.kind === "generated-metadata" ? "generated-metadata" : "placeholder";
      const buffer = await this.createPlaceholderSpriteBuffer(name, width, height);
      items.push({
        path: `sprites/${name}.png`,
        type: "image",
        content: buffer,
        contentEncoding: "binary",
        contentBase64: buffer.toString("base64"),
        previewDataUrl: createPreviewDataUrl(buffer),
        preview: description || `${kind} sprite placeholder`,
        sourcePath: `sprites/${name}.png`,
        width,
        height,
        kind
      });
      index += 1;
    }
    if (!items.some((item) => item.path === "sprites/icon.png")) {
      items.unshift(await this.createIconFile(title, slug));
    }
    return items;
  }

  async createMapFiles(maps, request, warnings, title, slug) {
    const items = [];
    const list = Array.isArray(maps) ? maps.slice(0, 12) : [];
    if (list.length === 0) {
      return items;
    }
    for (const map of list) {
      const name = sanitizeSegment(map && map.name ? map.name : "level-1");
      const width = Number.isInteger(map && map.width) ? map.width : 20;
      const height = Number.isInteger(map && map.height) ? map.height : 12;
      const tileSize = Number.isInteger(map && map.tileSize) ? map.tileSize : 16;
      const description = map && typeof map.description === "string" ? map.description : "";
      const payload = {
        width,
        height,
        block_width: tileSize,
        block_height: tileSize,
        sprites: [],
        data: new Array(width * height).fill(0)
      };
      const content = JSON.stringify(payload, null, 2);
      items.push({
        path: `maps/${name}.json`,
        type: "map",
        content,
        encoding: "utf8",
        preview: description || "placeholder map",
        sourcePath: `maps/${name}.json`
      });
    }
    return items;
  }

  async createScaffoldFiles(request, warnings, title, slug, resolvedPhysics, needsIcon, needsMap) {
    const items = [];
    if (needsIcon) {
      items.push(await this.createIconFile(title, slug));
    }
    if (needsMap) {
      items.push(await this.createDefaultMapFile(title, slug));
    }
    return items;
  }

  async createIconFile(title, slug) {
    const buffer = await this.createPlaceholderSpriteBuffer("icon", 64, 64, title, slug);
    return {
      path: "sprites/icon.png",
      type: "image",
      content: buffer,
      contentEncoding: "binary",
      contentBase64: buffer.toString("base64"),
      previewDataUrl: createPreviewDataUrl(buffer),
      preview: "project icon placeholder",
      sourcePath: "sprites/icon.png",
      width: 64,
      height: 64,
      kind: "placeholder"
    };
  }

  async createDefaultMapFile(title, slug) {
    const content = JSON.stringify({
      width: 20,
      height: 12,
      block_width: 16,
      block_height: 16,
      sprites: [],
      data: new Array(20 * 12).fill(0)
    }, null, 2);
    return {
      path: "maps/level1.json",
      type: "map",
      content,
      encoding: "utf8",
      preview: "blank starter map",
      sourcePath: "maps/level1.json"
    };
  }

  async createPlaceholderSpriteBuffer(name, width, height, title = "", slug = "") {
    const hash = crypto.createHash("sha1").update(`${name}:${title}:${slug}`).digest();
    const r = 80 + (hash[0] % 120);
    const g = 80 + (hash[1] % 120);
    const b = 80 + (hash[2] % 120);
    const bg = Jimp.rgbaToInt(r, g, b, 255);
    const image = await new Promise((resolve, reject) => {
      new Jimp(Math.max(1, width), Math.max(1, height), bg, (err, img) => {
        if (err) {
          reject(err);
        } else {
          resolve(img);
        }
      });
    });

    const border = Jimp.rgbaToInt(Math.max(0, r - 45), Math.max(0, g - 45), Math.max(0, b - 45), 255);
    const accent = Jimp.rgbaToInt(255 - r, 255 - g, 255 - b, 255);
    for (let x = 0; x < width; x += 1) {
      image.setPixelColor(border, x, 0);
      image.setPixelColor(border, x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      image.setPixelColor(border, 0, y);
      image.setPixelColor(border, width - 1, y);
    }
    const midX = Math.floor(width / 2);
    const midY = Math.floor(height / 2);
    for (let x = Math.max(1, midX - 2); x <= Math.min(width - 2, midX + 2); x += 1) {
      for (let y = Math.max(1, midY - 2); y <= Math.min(height - 2, midY + 2); y += 1) {
        image.setPixelColor(accent, x, y);
      }
    }
    return new Promise((resolve, reject) => {
      image.getBuffer(Jimp.MIME_PNG, (err, buffer) => {
        if (err) {
          reject(err);
        } else {
          resolve(buffer);
        }
      });
    });
  }

  async createProjectDraft(user, request, normalized, targetProject, resolvedPhysics) {
    const preview = await this.buildPreview(normalized, targetProject, request, resolvedPhysics);
    const record = this.createDraftRecord({
      userId: user.id,
      request,
      targetProjectId: request.mode === "apply_to_current_project" ? request.targetProjectId : null,
      generatedAt: normalized.generatedAt,
      resolvedPhysicsMode: normalized.resolvedPhysicsMode,
      provider: normalized.provider || null,
      project: normalized.project,
      gameDesign: normalized.gameDesign,
      imageAssets: normalized.imageAssets || [],
      modelJson: clone({
        project: normalized.project,
        gameDesign: normalized.gameDesign,
        imageAssets: normalized.imageAssets || [],
        warnings: normalized.warnings,
        nextSteps: normalized.nextSteps,
        resolvedPhysicsMode: normalized.resolvedPhysicsMode,
        provider: normalized.provider || null
      }),
      warnings: normalized.warnings,
      nextSteps: normalized.nextSteps,
      files: normalized.files.map((file) => this.serializeDraftFile(file)),
      preview: preview.files,
      managedPaths: preview.managedPaths
    });

    return this.exportDraft(record.get(), preview);
  }

  serializeDraftFile(file) {
    const record = {
      path: file.path,
      type: file.type,
      encoding: file.contentEncoding || file.encoding || "utf8",
      sourcePath: file.sourcePath || file.path,
      preview: file.preview || "",
      version: file.version != null ? file.version : 0,
      size: Buffer.isBuffer(file.content) ? file.content.length : Buffer.byteLength(String(file.content || ""), "utf8"),
      assetId: file.assetId,
      assetType: file.assetType,
      prompt: file.prompt,
      accepted: file.accepted,
      transparentBackground: file.transparentBackground,
      usedByFile: file.usedByFile,
      provider: file.provider,
      style: file.style
    };
    if (Buffer.isBuffer(file.content)) {
      record.contentBase64 = file.content.toString("base64");
      record.content = null;
      record.previewDataUrl = file.previewDataUrl || null;
      record.width = file.width;
      record.height = file.height;
      record.kind = file.kind;
    } else {
      record.content = String(file.content || "");
    }
    return record;
  }

  deserializeDraftFile(file) {
    const out = clone(file);
    if (out.contentBase64) {
      out.content = Buffer.from(out.contentBase64, "base64");
    }
    return out;
  }

  async buildPreview(normalized, targetProject, request, resolvedPhysics) {
    const files = normalized.files.map((file) => ({
      path: file.path,
      type: file.type,
      encoding: file.contentEncoding || file.encoding || "utf8",
      preview: file.preview || "",
      previewDataUrl: file.previewDataUrl || null,
      sourcePath: file.sourcePath || file.path,
      size: Buffer.isBuffer(file.content) ? file.content.length : Buffer.byteLength(String(file.content || ""), "utf8"),
      status: "create",
      version: 0
    }));

    const managedPaths = files.map((file) => file.path);
    const aiManifest = targetProject && targetProject.properties && targetProject.properties.ai_game_generator && Array.isArray(targetProject.properties.ai_game_generator.paths)
      ? targetProject.properties.ai_game_generator.paths
      : [];
    const deleted = [];

    if (targetProject != null) {
      for (const file of files) {
        const info = targetProject.getFileInfo(file.path);
        if (info && info.version > 0) {
          file.status = "overwrite";
          file.version = info.version;
        }
      }
      for (const oldPath of aiManifest) {
        if (managedPaths.indexOf(oldPath) < 0) {
          const info = targetProject.getFileInfo(oldPath);
          deleted.push({
            path: oldPath,
            type: this.pathType(oldPath),
            status: "delete",
            sourcePath: oldPath,
            version: info && info.version > 0 ? info.version : 0
          });
        }
      }
    }

    return {
      files: [...files, ...deleted],
      managedPaths
    };
  }

  pathType(path) {
    if (path.startsWith("sprites/")) {
      return "image";
    }
    if (path.startsWith("maps/")) {
      return "map";
    }
    if (path.startsWith("doc/")) {
      return "doc";
    }
    return "code";
  }

  exportDraft(record, preview) {
    const files = record.files.map((file) => ({
      path: file.path,
      type: file.type,
      encoding: file.encoding,
      sourcePath: file.sourcePath,
      preview: file.preview || "",
      previewDataUrl: file.previewDataUrl || null,
      version: file.version != null ? file.version : 0,
      content: file.content != null ? file.content : null,
      contentBase64: file.contentBase64 || null,
      size: file.size || 0,
      width: file.width,
      height: file.height,
      kind: file.kind,
      assetId: file.assetId,
      assetType: file.assetType,
      prompt: file.prompt,
      accepted: file.accepted,
      transparentBackground: file.transparentBackground,
      usedByFile: file.usedByFile,
      provider: file.provider,
      style: file.style
    }));
    return {
      id: record.id,
      userId: record.userId,
      request: record.request,
      project: record.project,
      gameDesign: record.gameDesign,
      modelJson: record.modelJson || null,
      imageAssets: record.imageAssets || [],
      provider: record.provider || null,
      warnings: record.warnings || [],
      nextSteps: record.nextSteps || [],
      resolvedPhysicsMode: record.resolvedPhysicsMode,
      targetProjectId: record.targetProjectId || null,
      preview: preview.files,
      files,
      managedPaths: record.managedPaths || []
    };
  }

  getImageProvider(providerName) {
    const name = normalizeImageProvider(providerName);
    if (name === "openai") {
      return this.imageProviders.openai();
    }
    if (name === "comfyui") {
      return this.imageProviders.comfyui();
    }
    return this.imageProviders.placeholder();
  }

  async regenerateImageAsset(draftId, assetId, input, user) {
    const draftRecord = this.getDraftRecord(draftId);
    if (!draftRecord) {
      throw new Error("draft not found");
    }
    const draft = draftRecord.get();
    if (draft.userId != null && user != null && draft.userId !== user.id) {
      throw new Error("You must own the target draft to regenerate an image");
    }
    const assets = Array.isArray(draft.imageAssets) ? draft.imageAssets.slice() : [];
    const index = assets.findIndex((asset) => asset && (asset.id === assetId || asset.filename === assetId));
    if (index < 0) {
      throw new Error("image asset not found");
    }
    const request = this.validateRequest(Object.assign({}, draft.request || {}, input || {}, {
      generateImages: true
    }));
    const asset = Object.assign({}, assets[index]);
    if (typeof input.prompt === "string" && input.prompt.trim().length > 0) {
      const draftConfig = gameLanguageConfig(draft.request && draft.request.language);
      asset.prompt = this.sanitizeImagePrompt(input.prompt, request, asset.type, draft.project && draft.project.title ? draft.project.title : this.fallbackTitle(request.idea), draft.project && draft.project.slug ? draft.project.slug : "", asset.usedByFile || draftConfig.modelSourcePath, []);
    }
    if (typeof input.imageStyle === "string") {
      request.imageStyle = normalizeImageStyle(input.imageStyle);
    }
    if (typeof input.transparentBackground === "boolean") {
      asset.transparentBackground = input.transparentBackground;
    }
    if (Number.isInteger(input.width)) {
      asset.width = clampImageDimension(input.width, asset.width);
    }
    if (Number.isInteger(input.height)) {
      asset.height = clampImageDimension(input.height, asset.height);
    }
    asset.provider = request.imageProvider;
    asset.style = request.imageStyle;
    const warnings = Array.isArray(draft.warnings) ? draft.warnings.slice() : [];
    const normalizedProjectTitle = draft.project && draft.project.title ? draft.project.title : this.fallbackTitle(request.idea);
    const generated = await this.renderImageAsset(
      this.gateway && typeof this.gateway.getImageProvider === "function"
        ? this.gateway.getImageProvider({
          imageProvider: request.imageProvider,
          imageProviderProfileId: request.imageProviderProfileId
        })
        : this.getImageProvider(request.imageProvider),
      asset,
      request,
      warnings,
      normalizedProjectTitle,
      draft.project && draft.project.slug ? draft.project.slug : "",
      user
    );
    const nextImageAssets = assets.map((entry, idx) => idx === index ? Object.assign({}, asset, {
      accepted: input.accepted != null ? !!input.accepted : entry.accepted !== false,
      previewDataUrl: generated.previewDataUrl,
      contentBase64: generated.contentBase64,
      contentEncoding: generated.contentEncoding,
      size: generated.size,
      generatedAt: Date.now()
    }) : entry);
    const aliasPaths = new Set([asset.filename]);
    if (asset.type === "ui" && /icon|thumbnail/.test(asset.id)) {
      aliasPaths.add("sprites/icon.png");
    }
    if ((asset.type === "background" || asset.type === "title-screen")) {
      aliasPaths.add("sprites/poster.png");
    }
    const nextFiles = Array.isArray(draft.files) ? draft.files.map((file) => {
      if (file.assetId === asset.id || aliasPaths.has(file.path)) {
        return Object.assign({}, file, generated, {
          path: file.path,
          sourcePath: file.sourcePath || file.path,
          accepted: input.accepted != null ? !!input.accepted : file.accepted !== false
        });
      }
      return file;
    }) : [];
    const nextRecord = Object.assign({}, draftRecord.get(), {
      imageAssets: nextImageAssets,
      files: nextFiles,
      warnings
    });
    draftRecord.set(nextRecord);
    const updatedPreview = await this.buildPreview({
      files: nextFiles,
      imageAssets: nextImageAssets
    }, this.getProject(draft.targetProjectId || (draft.request && draft.request.targetProjectId)), request, shouldUseMatter(request));
    nextRecord.preview = updatedPreview.files;
    nextRecord.managedPaths = updatedPreview.managedPaths;
    draftRecord.set(nextRecord);
    return this.exportDraft(nextRecord, updatedPreview);
  }

  async regenerateGameProject(draftId, input, user) {
    const existing = this.getDraftRecord(draftId);
    if (!existing) {
      throw new Error("draft not found");
    }
    const previous = existing.get();
    const request = this.validateRequest(Object.assign({}, previous.request || {}, input || {}));
    request.targetProjectId = request.mode === "apply_to_current_project" ? request.targetProjectId : null;
    return this.generateGameProject(request, user);
  }

  async explainGeneratedGame(draftId, question, user) {
    const draftRecord = this.getDraftRecord(draftId);
    if (!draftRecord) {
      throw new Error("draft not found");
    }
    const draft = draftRecord.get();
    const prompt = [
      "Explain the generated microStudio game to the user.",
      "Keep the response concise and practical.",
      `Question: ${question || "Explain the game, controls, and how to extend it."}`,
      `Project: ${JSON.stringify(draft.project, null, 2)}`,
      `Game design: ${JSON.stringify(draft.gameDesign, null, 2)}`,
      `Image assets: ${JSON.stringify(draft.imageAssets || [], null, 2)}`,
      `Validated model JSON: ${JSON.stringify(draft.modelJson || {}, null, 2)}`,
      `Warnings: ${JSON.stringify(draft.warnings || [])}`,
      `Next steps: ${JSON.stringify(draft.nextSteps || [])}`
    ].join("\n");
    const result = await this.gateway.generate({
      feature: "game-generator-explain",
      purpose: "text",
      providerProfileId: draft.request ? draft.request.providerProfileId : null,
      responseFormat: "text",
      temperature: 0.2,
      maxTokens: 1200,
      userId: user && user.id != null ? user.id : null,
      messages: [
        { role: "system", content: "You explain generated starter games clearly and briefly. Do not output markdown fences." },
        { role: "user", content: prompt }
      ]
    });
    return {
      draftId,
      explanation: result.content
    };
  }

  async applyProjectDraft(draftId, user, targetProjectIdOverride = null, modeOverride = null) {
    const draftRecord = this.getDraftRecord(draftId);
    if (!draftRecord) {
      throw new Error("draft not found");
    }
    const draft = draftRecord.get();
    const mode = normalizeMode(modeOverride || draft.request.mode || "apply_to_current_project");
    const targetProjectId = mode === "apply_to_current_project" ? (targetProjectIdOverride || draft.targetProjectId || draft.request.targetProjectId) : null;
    if (mode === "apply_to_current_project" && !targetProjectId) {
      throw new Error("target project id is required");
    }
    let project = null;
    if (mode === "apply_to_current_project") {
      project = this.getProject(targetProjectId);
      if (!project) {
        throw new Error("target project not found");
      }
      if (!project.owner || project.owner.id !== user.id) {
        throw new Error("You must own the target project to apply an AI draft");
      }
    }

    const previewVersions = new Map(Array.isArray(draft.preview) ? draft.preview.map((file) => [file.path, file.version != null ? file.version : 0]) : []);
    if (project) {
      for (const [path, expectedVersion] of previewVersions.entries()) {
        const info = project.getFileInfo(path);
        const currentVersion = info && info.version != null ? info.version : 0;
        if (currentVersion !== expectedVersion) {
          throw new Error(`File version conflict for ${path}`);
        }
      }
    }

    const files = draft.files.map((file) => this.deserializeDraftFile(file));
    const newPaths = files.map((file) => file.path);
    const previousPaths = project && project.properties && project.properties.ai_game_generator && Array.isArray(project.properties.ai_game_generator.paths)
      ? project.properties.ai_game_generator.paths
      : [];
    const deletePaths = previousPaths.filter((path) => newPaths.indexOf(path) < 0);
    const backupPaths = [];
    if (project) {
      for (const file of files) {
        if (project.getFileInfo(file.path) && project.getFileInfo(file.path).version > 0) {
          backupPaths.push(file.path);
        }
      }
      for (const path of deletePaths) {
        if (project.getFileInfo(path) && project.getFileInfo(path).version > 0) {
          backupPaths.push(path);
        }
      }
    }

    const backup = await this.snapshotProjectFiles(project, backupPaths);
    const backupRecord = this.createBackupRecord({
      userId: user.id,
      draftId,
      projectId: project ? project.id : null,
      createdAt: Date.now(),
      items: backup.items
    });

    const applied = [];
    try {
      const desiredProjectLanguage = gameLanguageConfig(draft.project && draft.project.language ? draft.project.language : draft.request && draft.request.language).projectLanguage;
      if (mode === "new_project") {
        project = await this.createProjectFromDraft(user, draft);
      } else if (project && project.language !== desiredProjectLanguage) {
        project.set("language", desiredProjectLanguage);
        if (project.manager != null) {
          project.manager.propagateOptions(null);
        }
      }

      for (const file of files) {
        await this.writeDraftFile(project, file);
        applied.push(file.path);
      }

      for (const path of deletePaths) {
        await this.deleteProjectPath(project, path);
        applied.push(path);
      }

      project.setProperty("ai_game_generator", {
        draftId,
        paths: newPaths.slice(),
        physics: draft.resolvedPhysicsMode || (draft.request && draft.request.physics) || "manual",
        updatedAt: Date.now()
      });
      project.touch();

      return {
        draftId,
        backupId: backupRecord.id,
        projectId: project.id,
        project: {
          id: project.id,
          title: project.title,
          slug: project.slug,
          language: project.language
        },
        appliedFiles: newPaths,
        deletedFiles: deletePaths
      };
    } catch (err) {
      await this.restoreBackup(project, backup.items, applied);
      if (mode === "new_project" && project && typeof project.delete === "function") {
        try {
          project.delete();
        } catch (deleteErr) {
          // best effort cleanup
        }
      }
      throw err;
    }
  }

  async snapshotProjectFiles(project, paths) {
    const items = [];
    if (!project || !Array.isArray(paths)) {
      return { items };
    }
    for (const path of paths) {
      const file = await this.readProjectFile(project, path);
      if (file != null) {
        items.push({
          path,
          contentBase64: Buffer.isBuffer(file) ? file.toString("base64") : Buffer.from(String(file), "utf8").toString("base64"),
          encoding: "binary",
          size: Buffer.isBuffer(file) ? file.length : Buffer.byteLength(String(file), "utf8"),
          info: clone(project.getFileInfo(path) || {})
        });
      }
    }
    return { items };
  }

  async restoreBackup(project, backupItems, appliedPaths) {
    if (!project) {
      return;
    }
    const applied = new Set(appliedPaths || []);
    const backupByPath = new Map();
    for (const item of backupItems || []) {
      backupByPath.set(item.path, item);
    }
    for (const path of applied) {
      if (!backupByPath.has(path)) {
        try {
          await this.deleteProjectPath(project, path);
        } catch (err) {
          // best effort rollback
        }
      }
    }
    for (const item of backupItems || []) {
      try {
        const buffer = Buffer.from(item.contentBase64, "base64");
        await this.writePath(project, item.path, buffer);
        this.restoreProjectFileInfo(project, item.path, item.info || {}, buffer.length);
      } catch (err) {
        // best effort rollback
      }
    }
  }

  async writeDraftFile(project, file) {
    const content = file.encoding === "binary" || Buffer.isBuffer(file.content)
      ? bufferFromContent(file.content, "base64")
      : contentToString(file.content, "utf8");
    await this.writePath(project, file.path, content);
    this.restoreProjectFileInfo(project, file.path, file, Buffer.isBuffer(content) ? content.length : Buffer.byteLength(String(content), "utf8"));
  }

  async writePath(project, path, content) {
    return new Promise((resolve, reject) => {
      const storagePath = `${project.owner.id}/${project.id}/${path}`;
      project.content.files.write(storagePath, content, () => resolve());
    });
  }

  async deleteProjectPath(project, path) {
    return new Promise((resolve) => {
      const storagePath = `${project.owner.id}/${project.id}/${path}`;
      project.content.files["delete"](storagePath, () => {
        if (project && typeof project.deleteFileInfo === "function") {
          project.deleteFileInfo(path);
        }
        resolve();
      });
    });
  }

  restoreProjectFileInfo(project, path, info, size) {
    if (!project || typeof project.setFileInfo !== "function") {
      return;
    }
    const nextInfo = clone(info || {});
    const existing = typeof project.getFileInfo === "function" ? (project.getFileInfo(path) || {}) : {};
    if (size != null) {
      nextInfo.size = size;
    }
    if (nextInfo.version == null) {
      nextInfo.version = (existing.version || 0) + 1;
    }
    project.setFileInfo(path, "version", nextInfo.version);
    project.setFileInfo(path, "size", nextInfo.size != null ? nextInfo.size : size || 0);
    if (nextInfo.properties != null) {
      project.setFileInfo(path, "properties", nextInfo.properties);
    }
  }

  async createProjectFromDraft(user, draft) {
    const title = draft.project && draft.project.title ? draft.project.title : this.fallbackTitle(draft.request && draft.request.idea);
    const slug = slugify(draft.project && draft.project.slug ? draft.project.slug : title);
    const config = gameLanguageConfig(draft.request && draft.request.language);
    return new Promise((resolve, reject) => {
      this.server.content.createProject(user, {
        title,
        slug,
        public: false,
        type: "app",
        orientation: draft.project && draft.project.orientation ? draft.project.orientation : "landscape",
        aspect: normalizeAspectRatio(draft.project && draft.project.aspectRatio ? draft.project.aspectRatio : draft.request && draft.request.aspectRatio),
        language: config.projectLanguage,
        graphics: "M1",
        networking: false,
        libs: draft.project && Array.isArray(draft.project.libraries) && draft.project.libraries.includes("matter.js") ? ["matterjs"] : [],
        tabs: {},
        plugins: {},
        libraries: [],
        description: draft.project && draft.project.description ? draft.project.description : ""
      }, (project) => {
        resolve(project);
      }, true);
    });
  }

  async openProjectFilesPreview(draftId) {
    const draftRecord = this.getDraftRecord(draftId);
    if (!draftRecord) {
      throw new Error("draft not found");
    }
    return draftRecord.get();
  }
}

module.exports = {
  AiGameGeneratorService,
  shouldUseMatter,
  normalizeGameLanguage,
  normalizeAspectRatio,
  mainPathForLanguage,
  normalizeSourcePathForLanguage,
  slugify,
  validateGeneratedCodeForLanguage,
  validateMicroScriptCode,
  validateMicroStudioJavaScriptCode,
  validateJavaScriptCode,
  validateMicroStudioRuntimeApiUsage,
  buildMicroStudioJavaScriptTicTacToeFallbackGameCode,
  buildMicroStudioJavaScriptPuzzleFallbackGameCode,
  buildMicroStudioJavaScriptRacingFallbackGameCode,
  buildMicroStudioJavaScriptTopDownAdventureFallbackGameCode,
  buildMicroStudioJavaScriptPlatformerFallbackGameCode,
  buildMicroStudioJavaScriptShooterFallbackGameCode,
  buildMicroScriptPuzzleFallbackGameCode,
  buildMicroScriptRacingFallbackGameCode,
  buildMicroScriptTopDownAdventureFallbackGameCode,
  buildMicroScriptPlatformerFallbackGameCode,
  buildMicroScriptShooterFallbackGameCode,
  gameLanguageConfig
};
