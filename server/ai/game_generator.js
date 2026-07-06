const crypto = require("crypto");
const Jimp = require("jimp");
const { OpenAIProvider } = require("./provider_openai.js");
const { AiGatewayManager } = require("./ai_gateway_manager.js");
const {
  PlaceholderImageProvider,
  OpenAIImageProvider,
  ComfyUIProvider
} = require("./image_providers.js");

const ALLOWED_ROOTS = new Set(["source", "sprites", "maps", "assets", "sounds", "music", "doc", "backgrounds", "ui"]);
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

function normalizeReferencePath(path, sourceRoot = "ms", sourceExt = "ms") {
  const cleaned = String(path || "")
    .replace(/\\/g, "/")
    .trim();
  if (!cleaned) {
    return `${sourceRoot}/main.${sourceExt}`;
  }
  if (cleaned.startsWith("source/")) {
    return cleaned.replace(/^source\//, `${sourceRoot}/`).replace(/\.js$/i, `.${sourceExt}`);
  }
  if (cleaned.startsWith("ms/") || cleaned.startsWith("js/")) {
    return cleaned;
  }
  if (cleaned.startsWith("doc/")) {
    return cleaned;
  }
  return cleaned;
}

function validateGeneratedCodeForLanguage(code, language) {
  const config = gameLanguageConfig(language);
  if (config.language === "JavaScript") {
    return validateJavaScriptCode(code);
  }
  return validateMicroScriptCode(code);
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

function validateJavaScriptCode(code) {
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

  if (!/\bfunction\s+init\s*\(/.test(code)) {
    errors.push("Missing JavaScript lifecycle callback: function init().");
  }
  if (!/\bfunction\s+update\s*\(/.test(code)) {
    errors.push("Missing JavaScript lifecycle callback: function update().");
  }
  if (!/\bfunction\s+draw\s*\(/.test(code)) {
    errors.push("Missing JavaScript lifecycle callback: function draw().");
  }

  return {
    ok: errors.length === 0,
    errors
  };
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
  if (raw === "javascript" || raw === "java-script" || raw === "js") {
    return "JavaScript";
  }
  return "microScript";
}

function gameLanguageConfig(language) {
  const normalized = normalizeGameLanguage(language);
  if (normalized === "JavaScript") {
    return {
      language: "JavaScript",
      projectLanguage: "javascript",
      sourceRoot: "js",
      sourceExt: "js",
      modelSourcePath: "source/main.js",
      featureName: "game-generator-javascript"
    };
  }
  return {
    language: "microScript",
    projectLanguage: "microscript_v2",
    sourceRoot: "ms",
    sourceExt: "ms",
    modelSourcePath: "source/main.js",
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
  if (config.language === "JavaScript") {
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

function buildFallbackGameCode(plan, resolvedPhysics, language = "microScript") {
  const config = gameLanguageConfig(language);
  if (config.language === "JavaScript") {
    return buildJavaScriptFallbackGameCode(plan, resolvedPhysics);
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
    screen.fillCircle(body.position.x, body.position.y, body.circleRadius, color)
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

  screen.fillCircle(game.player.x, game.player.y, game.player.size, "#38bdf8")
  screen.drawCircle(game.player.x, game.player.y, game.player.size + 1, "#0ea5e9")

  for i = 0 to game.stars.length - 1
    star = game.stars[i]
    screen.fillCircle(star.x, star.y, star.size, "#fbbf24")
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
        path: "source/main.js",
        type: "code",
        content: config.language === "JavaScript" ? "JavaScript source code only" : "microScript source code only"
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

function buildMicroScriptSystemPrompt(request, resolvedPhysics) {
  return [
    "You are an expert microStudio microScript game developer.",
    "Generate a complete, playable starter 2D browser game project using microScript only.",
    "Return only valid JSON. Do not use markdown or code fences.",
    "Every source file must use microScript syntax only.",
    "Required lifecycle callbacks: init = function(), update = function(), draw = function().",
    "Do not generate JavaScript syntax, and do not mix languages.",
    resolvedPhysics ? "Matter.js is enabled; create and clear the engine safely and keep body counts bounded." : "Do not use Matter.js unless the game concept explicitly needs rigid-body physics.",
    "Use source/main.js in the JSON schema, and keep the generated code free of browser/network/DOM APIs.",
    "Use microScript operators and syntax only: object/end, if/then/else/elsif, and/or/not, ==/!=, floor(), random.next().",
    "Keep update() lightweight and bounded. Remove off-screen objects. Avoid large allocations in draw()."
  ].join(" ");
}

function buildJavaScriptSystemPrompt(request, resolvedPhysics) {
  return [
    "You are an expert microStudio JavaScript game developer.",
    "Generate a complete, playable starter 2D browser game project using JavaScript only.",
    "Return only valid JSON. Do not use markdown or code fences.",
    "Every source file must use JavaScript syntax only.",
    "Required lifecycle callbacks: function init(), function update(), function draw().",
    "Do not generate microScript syntax, and do not mix languages.",
    resolvedPhysics ? "Matter.js is enabled; create and clear the engine safely and keep body counts bounded." : "Do not use Matter.js unless the game concept explicitly needs rigid-body physics.",
    "Use source/main.js in the JSON schema, and keep the generated code free of browser/network/DOM APIs.",
    "Use JavaScript syntax only: function declarations, braces, semicolons, const/let, Math.*, ===/!==, &&/||, and !.",
    "Keep update() lightweight and bounded. Remove off-screen objects. Avoid large allocations in draw()."
  ].join(" ");
}

function buildMicroScriptUserPrompt(request, resolvedPhysics) {
  return [
    "Generate a microStudio microScript game project.",
    `Idea: ${request.idea}`,
    "Language: microScript",
    `Physics: ${request.physics}`,
    `Resolved physics: ${resolvedPhysics ? "matterjs" : "manual"}`,
    `Difficulty: ${request.difficulty}`,
    `Aspect ratio: ${request.aspectRatio}`,
    `Generate images: ${request.generateImages}`,
    "Return only JSON in this exact shape:",
    JSON.stringify(buildGameProjectSchema("microScript", request, resolvedPhysics), null, 2)
  ].join("\n");
}

function buildJavaScriptUserPrompt(request, resolvedPhysics) {
  return [
    "Generate a microStudio JavaScript game project.",
    `Idea: ${request.idea}`,
    "Language: JavaScript",
    `Physics: ${request.physics}`,
    `Resolved physics: ${resolvedPhysics ? "matterjs" : "manual"}`,
    `Difficulty: ${request.difficulty}`,
    `Aspect ratio: ${request.aspectRatio}`,
    `Generate images: ${request.generateImages}`,
    "Return only JSON in this exact shape:",
    JSON.stringify(buildGameProjectSchema("JavaScript", request, resolvedPhysics), null, 2)
  ].join("\n");
}

function buildJavaScriptFallbackGameCode(plan, resolvedPhysics) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlText = JSON.stringify((plan.gameDesign && Array.isArray(plan.gameDesign.controls) && plan.gameDesign.controls.length > 0)
    ? plan.gameDesign.controls.join(" | ")
    : "Arrow keys to move. Space or R to restart.");
  if (resolvedPhysics === "matterjs") {
    return `// ${title}
// ${description}
// Safe JavaScript Matter.js starter. Keep body counts bounded for performance.

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
    screen.fillCircle(body.position.x, body.position.y, body.circleRadius, color);
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
// Safe JavaScript arcade starter. Keep active objects bounded for performance.

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

  screen.fillCircle(game.player.x, game.player.y, game.player.size, "#38bdf8");
  screen.drawCircle(game.player.x, game.player.y, game.player.size + 1, "#0ea5e9");

  for (let i = 0; i < game.stars.length; i += 1) {
    const star = game.stars[i];
    screen.fillCircle(star.x, star.y, star.size, "#fbbf24");
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
    if (request.language === "JavaScript") {
      return this.generateJavaScriptGameProject(request, user);
    }
    return this.generateMicroScriptGameProject(request, user);
  }

  async generateMicroScriptGameProject(request, user) {
    return this.generateGameProjectForLanguage(request, user, gameLanguageConfig("microScript"));
  }

  async generateJavaScriptGameProject(request, user) {
    return this.generateGameProjectForLanguage(request, user, gameLanguageConfig("JavaScript"));
  }

  async generateGameProjectForLanguage(request, user, config) {
    const resolvedPhysics = shouldUseMatter(request);
    const systemPrompt = config.language === "JavaScript"
      ? buildJavaScriptSystemPrompt(request, resolvedPhysics)
      : buildMicroScriptSystemPrompt(request, resolvedPhysics);
    const userPrompt = config.language === "JavaScript"
      ? buildJavaScriptUserPrompt(request, resolvedPhysics)
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
        }, resolvedPhysics, languageConfig.language),
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
      if (root === "source") {
        if (ext !== "js") {
          warnings.push(`Rejected source file with unsupported extension: ${file.path}`);
          continue;
        }
        const normalizedPath = normalizeFinalPath(languageConfig.sourceRoot, rawName, languageConfig.sourceExt);
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
    return [
      this.buildDefaultImageAsset("player_idle", "sprite", "source/main.js", request, title, slug, "A readable game-ready player character sprite", config),
      this.buildDefaultImageAsset("enemy_basic", "sprite", "source/main.js", request, title, slug, "A simple enemy sprite with a distinct silhouette", config),
      this.buildDefaultImageAsset("collectible_star", "sprite", "source/main.js", request, title, slug, "A small collectible object sprite with a readable silhouette", config),
      this.buildDefaultImageAsset("background_level_1", "background", "source/main.js", request, title, slug, "A simple colorful game background with a clean silhouette", config),
      this.buildDefaultImageAsset("ui_start_button", "ui", "source/main.js", request, title, slug, "A simple UI start button with a clean game interface look", config),
      this.buildDefaultImageAsset("game_icon", "ui", "source/main.js", request, title, slug, "A clean game icon or thumbnail with a bold silhouette", config)
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
      }, resolvedPhysics, config.language);
    }
    if (isUnsafeCode(code)) {
      warnings.push(`Unsafe code patterns were replaced in ${sourcePath || config.modelSourcePath}`);
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics, config.language);
    }
    const validation = validateGeneratedCodeForLanguage(code, config.language);
    if (!validation.ok) {
      const label = config.language === "JavaScript" ? "JavaScript" : "microScript";
      warnings.push(`Invalid ${label} in ${sourcePath || config.modelSourcePath}; fallback inserted. Problems: ${validation.errors.slice(0, 5).join(", ")}`);
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics, config.language);
    }
    if (config.language === "microScript" && !hasCoreFunctions(code)) {
      warnings.push(`Missing microScript init/update/draw callbacks in ${sourcePath || config.modelSourcePath}; fallback starter inserted.`);
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics, config.language);
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
      if (mode === "new_project") {
        project = await this.createProjectFromDraft(user, draft);
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
          slug: project.slug
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
  slugify,
  validateGeneratedCodeForLanguage,
  validateMicroScriptCode,
  validateJavaScriptCode,
  gameLanguageConfig
};
