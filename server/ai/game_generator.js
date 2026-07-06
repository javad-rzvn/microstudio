const crypto = require("crypto");
const Jimp = require("jimp");
const { OpenAIProvider } = require("./provider_openai.js");

const ALLOWED_ROOTS = new Set(["source", "sprites", "maps", "assets", "sounds", "music", "doc"]);
const ALLOWED_EXTENSIONS = new Set(["js", "json", "md", "txt"]);
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
  return /\binit\s*=\s*function\s*\(|\bfunction\s+init\s*\(|\binit\s*:\s*function\s*\(/.test(content) &&
    /\bupdate\s*=\s*function\s*\(|\bfunction\s+update\s*\(|\bupdate\s*:\s*function\s*\(/.test(content) &&
    /\bdraw\s*=\s*function\s*\(|\bfunction\s+draw\s*\(|\bdraw\s*:\s*function\s*\(/.test(content);
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

function buildFallbackGameCode(plan, resolvedPhysics) {
  const title = JSON.stringify((plan.project && plan.project.title) || "AI Game");
  const description = JSON.stringify((plan.project && plan.project.description) || "");
  const controlText = JSON.stringify((plan.gameDesign && Array.isArray(plan.gameDesign.controls) && plan.gameDesign.controls.length > 0)
    ? plan.gameDesign.controls.join(" | ")
    : "Arrow keys to move. Space or R to restart.");
  const useMatter = resolvedPhysics === "matterjs";

  if (useMatter) {
    return `// ${title}\n// ${description}\n// Simple Matter.js starter. Replace the placeholders after generating.\n\nvar game;\nvar engine;\nvar world;\nvar player;\nvar score = 0;\nvar spawned = [];\nvar lastSpawn = 0;\nvar controlsText = ${controlText};\n\nfunction resetGame() {\n  score = 0;\n  spawned = [];\n  if (world && engine) {\n    Matter.World.clear(world, false);\n    Matter.Engine.clear(engine);\n  }\n  engine = Matter.Engine.create();\n  world = engine.world;\n  world.gravity.y = 1;\n  Matter.World.add(world, [\n    Matter.Bodies.rectangle(0, 112, 220, 20, { isStatic: true }),\n    Matter.Bodies.rectangle(-110, 0, 20, 240, { isStatic: true }),\n    Matter.Bodies.rectangle(110, 0, 20, 240, { isStatic: true }),\n    Matter.Bodies.rectangle(0, -120, 220, 20, { isStatic: true })\n  ]);\n  player = Matter.Bodies.circle(-60, 40, 10, { frictionAir: 0.06, restitution: 0.2 });\n  Matter.World.add(world, player);\n}\n\ninit = function() {\n  resetGame();\n};\n\nupdate = function() {\n  if (!engine) {\n    resetGame();\n  }\n  if (keyboard.LEFT) {\n    Matter.Body.applyForce(player, player.position, { x: -0.0025, y: 0 });\n  }\n  if (keyboard.RIGHT) {\n    Matter.Body.applyForce(player, player.position, { x: 0.0025, y: 0 });\n  }\n  if (keyboard.UP) {\n    Matter.Body.applyForce(player, player.position, { x: 0, y: -0.003 });\n  }\n  if (keyboard.DOWN) {\n    Matter.Body.applyForce(player, player.position, { x: 0, y: 0.003 });\n  }\n  if (keyboard.press.SPACE || keyboard.press.KEY_R) {\n    resetGame();\n  }\n  if (Date.now() - lastSpawn > 1200) {\n    lastSpawn = Date.now();\n    var body = Matter.Bodies.circle(Math.random() * 80 - 40, -90, 7, { restitution: 0.6 });\n    spawned.push(body);\n    Matter.World.add(world, body);\n  }\n  Matter.Engine.update(engine, 1000 / 60);\n};\n\nfunction drawBody(body, color) {\n  screen.setColor(color);\n  if (body.circleRadius != null) {\n    screen.fillCircle(body.position.x, body.position.y, body.circleRadius, color);\n  } else {\n    var bounds = body.bounds;\n    screen.fillRect(body.position.x, body.position.y, bounds.max.x - bounds.min.x, bounds.max.y - bounds.min.y, color);\n  }\n}\n\ndraw = function() {\n  screen.clear(\"#08111f\");\n  screen.setColor(\"#dbeafe\");\n  screen.drawText(${title}, 0, -92, 8, \"#dbeafe\");\n  screen.drawText(${controlText}, 0, 92, 5, \"#cbd5e1\");\n  drawBody(player, \"#38bdf8\");\n  for (var i = 0; i < spawned.length; i++) {\n    drawBody(spawned[i], \"#fbbf24\");\n  }\n  screen.drawText(\"Press Space or R to restart\", 0, 76, 5, \"#94a3b8\");\n};\n`;
  }

  return `// ${title}\n// ${description}\n// Simple manual starter. Replace the placeholders after generating.\n\nvar game;\nvar controlsText = ${controlText};\n\nfunction resetGame() {\n  game = {\n    player: { x: 0, y: 62, vx: 0, vy: 0, size: 12 },\n    stars: [],\n    score: 0,\n    lives: 3,\n    spawnTimer: 0,\n    gameOver: false,\n    message: \"Use the arrow keys to move.\",\n    time: 0\n  };\n}\n\nfunction spawnStar() {\n  game.stars.push({\n    x: Math.random() * 180 - 90,\n    y: -100,\n    vx: (Math.random() - 0.5) * 0.7,\n    vy: 1.4 + Math.random() * 1.2,\n    size: 8\n  });\n}\n\nfunction hit(ax, ay, as, bx, by, bs) {\n  return Math.abs(ax - bx) < (as + bs) * 0.55 && Math.abs(ay - by) < (as + bs) * 0.55;\n}\n\ninit = function() {\n  resetGame();\n};\n\nupdate = function() {\n  if (!game) {\n    resetGame();\n  }\n  if (keyboard.press.SPACE || keyboard.press.KEY_R) {\n    resetGame();\n    return;\n  }\n  if (game.gameOver) {\n    return;\n  }\n  game.time += 1;\n  if (keyboard.LEFT) {\n    game.player.vx -= 0.5;\n  }\n  if (keyboard.RIGHT) {\n    game.player.vx += 0.5;\n  }\n  if (keyboard.UP) {\n    game.player.vy -= 0.5;\n  }\n  if (keyboard.DOWN) {\n    game.player.vy += 0.5;\n  }\n  game.player.vx *= 0.86;\n  game.player.vy *= 0.86;\n  game.player.x += game.player.vx;\n  game.player.y += game.player.vy;\n  game.player.x = Math.max(-94, Math.min(94, game.player.x));\n  game.player.y = Math.max(-84, Math.min(84, game.player.y));\n\n  game.spawnTimer -= 1;\n  if (game.spawnTimer <= 0) {\n    game.spawnTimer = 32;\n    spawnStar();\n  }\n\n  for (var i = game.stars.length - 1; i >= 0; i--) {\n    var star = game.stars[i];\n    star.x += star.vx;\n    star.y += star.vy;\n    if (hit(game.player.x, game.player.y, game.player.size, star.x, star.y, star.size)) {\n      game.score += 1;\n      game.stars.splice(i, 1);\n      continue;\n    }\n    if (star.y > 110) {\n      game.stars.splice(i, 1);\n      game.lives -= 1;\n      if (game.lives <= 0) {\n        game.gameOver = true;\n      }\n    }\n  }\n};\n\ndraw = function() {\n  screen.clear(\"#0f172a\");\n  screen.setColor(\"#e2e8f0\");\n  screen.drawText(${title}, 0, -92, 8, \"#e2e8f0\");\n  screen.drawText(\"Score: \" + game.score + \"  Lives: \" + game.lives, 0, -78, 5, \"#cbd5e1\");\n  screen.drawText(controlsText, 0, 92, 5, \"#cbd5e1\");\n  screen.fillCircle(game.player.x, game.player.y, game.player.size, \"#38bdf8\");\n  screen.drawCircle(game.player.x, game.player.y, game.player.size + 1, \"#0ea5e9\");\n  for (var i = 0; i < game.stars.length; i++) {\n    var star = game.stars[i];\n    screen.fillCircle(star.x, star.y, star.size, \"#fbbf24\");\n  }\n  if (game.gameOver) {\n    screen.drawText(\"Game Over\", 0, -6, 10, \"#fca5a5\");\n    screen.drawText(\"Press Space or R to restart\", 0, 10, 6, \"#f8fafc\");\n  }\n};\n`;
}

function createPreviewDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

class AiGameGeneratorService {
  constructor(server, webapp) {
    this.server = server;
    this.webapp = webapp;
    this.provider = new OpenAIProvider();
    this.draftTable = "ai_game_drafts";
    this.backupTable = "ai_game_backups";
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
      language: input.language === "JavaScript" ? "JavaScript" : "JavaScript",
      physics: ["none", "auto", "matterjs"].includes(input.physics) ? input.physics : "auto",
      difficulty: ["beginner", "intermediate", "advanced"].includes(input.difficulty) ? input.difficulty : "beginner",
      artStyle: ["placeholder", "pixel-art", "simple-shapes"].includes(input.artStyle) ? input.artStyle : "placeholder",
      aspectRatio: ["16:9", "4:3", "1:1", "portrait"].includes(input.aspectRatio) ? input.aspectRatio : "16:9",
      targetProjectId: input.targetProjectId != null ? String(input.targetProjectId) : null,
      mode: normalizeMode(input.mode),
      constraints: {
        maxFiles: Number.isInteger(input.constraints && input.constraints.maxFiles) ? input.constraints.maxFiles : 20,
        maxFileSizeKb: Number.isInteger(input.constraints && input.constraints.maxFileSizeKb) ? input.constraints.maxFileSizeKb : 120,
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
    const resolvedPhysics = shouldUseMatter(request);
    const systemPrompt = [
      "You are an expert microStudio JavaScript game developer.",
      "Generate a complete but small starter 2D browser game project.",
      "Return only valid JSON matching the provided schema.",
      "Do not include markdown.",
      "Do not include explanations outside JSON.",
      "Do not include secrets, external network calls, unsafe code, or unsupported file paths.",
      "Prefer simple readable JavaScript.",
      resolvedPhysics ? "Matter.js is enabled for this request." : "Do not use Matter.js unless the game concept explicitly needs it.",
      "Use source/*.js for code file entries and doc/*.md or doc/*.txt for docs.",
      "Put sprite and map metadata in the sprites and maps arrays instead of file entries.",
      "The generated project must have init, update, and draw functions, controls explanation, and restart logic.",
      "Beginner difficulty should include comments explaining the code."
    ].join(" ");

    const userPrompt = [
      `Idea: ${request.idea}`,
      `Language: ${request.language}`,
      `Physics: ${request.physics} (resolved: ${resolvedPhysics ? "matterjs" : "manual"})`,
      `Difficulty: ${request.difficulty}`,
      `Art style: ${request.artStyle}`,
      `Aspect ratio: ${request.aspectRatio}`,
      `Mode: ${request.mode}`,
      `Constraints: maxFiles=${request.constraints.maxFiles}, maxFileSizeKb=${request.constraints.maxFileSizeKb}, includeDocs=${request.constraints.includeDocs}, includeTutorialComments=${request.constraints.includeTutorialComments}`,
      "Return this exact shape:",
      JSON.stringify({
        project: {
          title: "string",
          slug: "string",
          description: "string",
          language: "JavaScript",
          graphics: "basic",
          libraries: resolvedPhysics ? ["matter.js"] : [],
          aspectRatio: "16:9",
          orientation: "landscape",
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
            content: "string"
          },
          {
            path: "doc/README.md",
            type: "doc",
            content: "string"
          }
        ],
        sprites: [
          {
            name: "string",
            kind: "placeholder",
            width: 32,
            height: 32,
            description: "string"
          }
        ],
        maps: [
          {
            name: "string",
            width: 20,
            height: 12,
            tileSize: 16,
            description: "string"
          }
        ],
        warnings: ["string"],
        nextSteps: ["string"]
      }, null, 2)
    ].join("\n");

    const providerJson = await this.provider.generate([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ], {
      maxTokens: 5000
    });

    const parsed = this.parseModelJson(providerJson);
    const normalized = await this.validateGeneratedProject(parsed, request, resolvedPhysics, user);
    const targetProject = request.mode === "apply_to_current_project" ? this.getProject(request.targetProjectId) : null;
    const draft = await this.createProjectDraft(user, request, normalized, targetProject, resolvedPhysics);
    return draft;
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

  async validateGeneratedProject(projectJson, request, resolvedPhysics, user) {
    const warnings = Array.isArray(projectJson.warnings) ? projectJson.warnings.filter((w) => typeof w === "string").slice(0, 20) : [];
    const nextSteps = Array.isArray(projectJson.nextSteps) ? projectJson.nextSteps.filter((w) => typeof w === "string").slice(0, 20) : [];
    const projectInfo = projectJson.project || {};
    const title = typeof projectInfo.title === "string" && projectInfo.title.trim() ? projectInfo.title.trim() : this.fallbackTitle(request.idea);
    const slug = slugify(typeof projectInfo.slug === "string" ? projectInfo.slug : title);
    const description = typeof projectInfo.description === "string" ? projectInfo.description.trim().slice(0, 1000) : "";
    const libraries = resolvedPhysics ? ["matter.js"] : [];
    const gameDesign = this.validateGameDesign(projectJson.gameDesign, request);
    const filesResult = await this.sanitizeGeneratedFiles(projectJson.files, request, resolvedPhysics, warnings);
    const spriteFiles = await this.createSpriteFiles(projectJson.sprites, request, warnings, title, slug);
    const mapFiles = await this.createMapFiles(projectJson.maps, request, warnings, title, slug);
    const scaffoldFiles = await this.createScaffoldFiles(request, warnings, title, slug, resolvedPhysics, spriteFiles.length === 0, mapFiles.length === 0);

    let files = [...filesResult.files, ...spriteFiles, ...mapFiles, ...scaffoldFiles];
    files = uniqueByPath(files);

    if (files.length > request.constraints.maxFiles) {
      throw new Error(`Generated project contains too many files (${files.length} > ${request.constraints.maxFiles})`);
    }

    const mainFile = files.find((file) => file.path === "ms/main.ms");
    if (mainFile == null) {
      files.unshift({
        path: "ms/main.ms",
        type: "code",
        content: buildFallbackGameCode({
          project: { title, description },
          gameDesign,
          nextSteps
        }, resolvedPhysics),
        encoding: "utf8",
        sourcePath: "source/main.js",
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
        language: "JavaScript",
        graphics: "basic",
        libraries,
        aspectRatio: request.aspectRatio,
      orientation: request.aspectRatio === "portrait" ? "portrait" : "landscape",
        difficulty: request.difficulty
      },
      gameDesign,
      files,
      warnings,
      nextSteps,
      resolvedPhysicsMode: resolvedPhysics ? "matterjs" : "manual",
      request,
      generatedAt: Date.now(),
      userId: user && user.id != null ? user.id : null
    };

    if (!files.some((file) => file.path === "sprites/icon.png")) {
      normalized.files.unshift(await this.createIconFile(title, slug));
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

  async sanitizeGeneratedFiles(files, request, resolvedPhysics, warnings) {
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
        const normalizedPath = normalizeFinalPath("ms", rawName, "ms");
        if (!normalizedPath) {
          warnings.push(`Rejected source file with empty or invalid name: ${file.path}`);
          continue;
        }
        const content = this.sanitizeCodeContent(file.content, resolvedPhysics, request, warnings, file.path);
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

  sanitizeCodeContent(content, resolvedPhysics, request, warnings, sourcePath) {
    const code = typeof content === "string" ? content : "";
    if (!code.trim()) {
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics);
    }
    if (isUnsafeCode(code)) {
      warnings.push(`Unsafe code patterns were replaced in ${sourcePath || "source/main.js"}`);
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics);
    }
    if (!hasCoreFunctions(code)) {
      warnings.push(`Missing init/update/draw in ${sourcePath || "source/main.js"}; fallback starter inserted.`);
      return buildFallbackGameCode({
        project: { title: this.fallbackTitle(request.idea), description: request.idea },
        gameDesign: this.validateGameDesign({}, request),
        nextSteps: []
      }, resolvedPhysics);
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
      project: normalized.project,
      gameDesign: normalized.gameDesign,
      modelJson: clone({
        project: normalized.project,
        gameDesign: normalized.gameDesign,
        warnings: normalized.warnings,
        nextSteps: normalized.nextSteps,
        resolvedPhysicsMode: normalized.resolvedPhysicsMode
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
      size: Buffer.isBuffer(file.content) ? file.content.length : Buffer.byteLength(String(file.content || ""), "utf8")
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
      status: "create"
    }));

    const managedPaths = files.map((file) => file.path);
    const aiManifest = targetProject && targetProject.properties && targetProject.properties.ai_game_generator && Array.isArray(targetProject.properties.ai_game_generator.paths)
      ? targetProject.properties.ai_game_generator.paths
      : [];
    const deleted = [];

    if (targetProject != null) {
      for (const file of files) {
        if (targetProject.getFileInfo(file.path) && targetProject.getFileInfo(file.path).version > 0) {
          file.status = "overwrite";
        }
      }
      for (const oldPath of aiManifest) {
        if (managedPaths.indexOf(oldPath) < 0) {
          deleted.push({
            path: oldPath,
            type: this.pathType(oldPath),
            status: "delete",
            sourcePath: oldPath
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
      content: file.content != null ? file.content : null,
      contentBase64: file.contentBase64 || null,
      size: file.size || 0,
      width: file.width,
      height: file.height,
      kind: file.kind
    }));
    return {
      id: record.id,
      userId: record.userId,
      request: record.request,
      project: record.project,
      gameDesign: record.gameDesign,
      modelJson: record.modelJson || null,
      warnings: record.warnings || [],
      nextSteps: record.nextSteps || [],
      resolvedPhysicsMode: record.resolvedPhysicsMode,
      targetProjectId: record.targetProjectId || null,
      preview: preview.files,
      files,
      managedPaths: record.managedPaths || []
    };
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
      `Validated model JSON: ${JSON.stringify(draft.modelJson || {}, null, 2)}`,
      `Warnings: ${JSON.stringify(draft.warnings || [])}`,
      `Next steps: ${JSON.stringify(draft.nextSteps || [])}`
    ].join("\n");
    const content = await this.provider.generate([
      { role: "system", content: "You explain generated starter games clearly and briefly. Do not output markdown fences." },
      { role: "user", content: prompt }
    ], {
      maxTokens: 1200
    });
    return {
      draftId,
      explanation: content
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
          size: Buffer.isBuffer(file) ? file.length : Buffer.byteLength(String(file), "utf8")
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
      project.content.files["delete"](storagePath, () => resolve());
    });
  }

  async createProjectFromDraft(user, draft) {
    const title = draft.project && draft.project.title ? draft.project.title : this.fallbackTitle(draft.request && draft.request.idea);
    const slug = slugify(draft.project && draft.project.slug ? draft.project.slug : title);
    return new Promise((resolve, reject) => {
      this.server.content.createProject(user, {
        title,
        slug,
        public: false,
        type: "app",
        orientation: draft.project && draft.project.orientation ? draft.project.orientation : "landscape",
        aspect: normalizeAspectRatio(draft.project && draft.project.aspectRatio ? draft.project.aspectRatio : draft.request && draft.request.aspectRatio),
        language: "javascript",
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
  normalizeAspectRatio,
  slugify
};
