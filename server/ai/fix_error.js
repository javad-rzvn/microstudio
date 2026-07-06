const crypto = require("crypto");
const { AiGatewayManager } = require("./ai_gateway_manager.js");

function parseBooleanEnv(value) {
  return String(value || "").toLowerCase() === "true" || value === "1";
}

function now() {
  return Date.now();
}

function safeError(message, status = 400) {
  const err = new Error(message);
  err.safe = true;
  err.status = status;
  return err;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimString(value, maxLength) {
  const text = value == null ? "" : String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, Math.max(0, maxLength - 1)) + "…";
}

function uniqueStrings(list) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    if (typeof item !== "string") {
      continue;
    }
    const value = item.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

function hasUnsafePathSegment(segment) {
  return segment === "" || segment === "." || segment === ".." || segment.startsWith(".") || segment.includes("..");
}

class FixErrorService {
  constructor(server, webapp, gateway = null) {
    this.server = server;
    this.webapp = webapp;
    this.gateway = gateway || (server && server.aiGateway ? server.aiGateway : new AiGatewayManager(server));
    this.proposalTable = "ai_fix_error_proposals";
    this.backupTable = "ai_fix_error_backups";
    this.maxContextBytes = parseInt(process.env.AI_FIX_ERROR_MAX_CONTEXT_BYTES || "120000", 10);
    this.maxResponseBytes = parseInt(process.env.AI_FIX_ERROR_MAX_RESPONSE_BYTES || "150000", 10);
    this.maxNearbyFiles = parseInt(process.env.AI_FIX_ERROR_MAX_NEARBY_FILES || "2", 10);
    this.maxPromptLogBytes = parseInt(process.env.AI_FIX_ERROR_MAX_PROMPT_LOG_BYTES || "4096", 10);
    this.logPrompts = parseBooleanEnv(process.env.AI_GATEWAY_LOG_FIX_ERROR_PROMPTS);
  }

  get db() {
    return this.server.db;
  }

  getProject(projectId) {
    if (projectId == null) {
      return null;
    }
    return this.server.content.projects[String(projectId)] || null;
  }

  getProposalRecord(id) {
    return this.db.get(this.proposalTable, id);
  }

  getBackupRecord(id) {
    return this.db.get(this.backupTable, id);
  }

  createProposalRecord(data) {
    return this.db.create(this.proposalTable, data);
  }

  createBackupRecord(data) {
    return this.db.create(this.backupTable, data);
  }

  readFile(fileStorage, path, encoding = "utf8") {
    return new Promise((resolve) => {
      fileStorage.read(path, encoding, (content) => resolve(content));
    });
  }

  writeFile(fileStorage, path, content) {
    return new Promise((resolve, reject) => {
      try {
        fileStorage.write(path, content, () => resolve());
      } catch (err) {
        reject(err);
      }
    });
  }

  deleteFile(fileStorage, path) {
    return new Promise((resolve, reject) => {
      try {
        fileStorage["delete"](path, () => resolve());
      } catch (err) {
        reject(err);
      }
    });
  }

  normalizePath(path) {
    if (typeof path !== "string") {
      return null;
    }
    let value = path.trim().replace(/\\/g, "/");
    if (!value || value.startsWith("/") || /^[a-zA-Z]:/.test(value)) {
      return null;
    }
    const segments = value.split("/");
    if (segments.some(hasUnsafePathSegment)) {
      return null;
    }
    const root = segments[0];
    const base = segments[segments.length - 1];
    if (root === "source" || root === "ms") {
      const name = base.replace(/\.(js|ms|py|lua|txt|json|md)$/i, "");
      if (!name) {
        return null;
      }
      if (!/^[a-z0-9_-]+$/i.test(name)) {
        return null;
      }
      return `ms/${name}.ms`;
    }
    if (root === "doc") {
      const match = base.match(/^([a-z0-9_-]+)(\.(md|txt|json))?$/i);
      if (!match) {
        return null;
      }
      const ext = (match[3] || "md").toLowerCase();
      return `doc/${match[1]}.${ext}`;
    }
    return null;
  }

  isAllowedPath(path) {
    return typeof path === "string" && /^(ms\/[a-z0-9_-]+\.ms|doc\/[a-z0-9_-]+\.(md|txt|json))$/i.test(path);
  }

  isCodePath(path) {
    return typeof path === "string" && /^ms\/[a-z0-9_-]+\.ms$/i.test(path);
  }

  isDocPath(path) {
    return typeof path === "string" && /^doc\/[a-z0-9_-]+\.(md|txt|json)$/i.test(path);
  }

  getSourceList(project) {
    if (!project || !Array.isArray(project.source_list)) {
      return [];
    }
    return project.source_list
      .map((source) => ({
        name: source && source.name != null ? String(source.name) : "",
        content: source && source.content != null ? String(source.content) : ""
      }))
      .filter((source) => !!source.name);
  }

  extractLineWindow(text, lineNumber, radius = 60) {
    const lines = String(text || "").split("\n");
    if (lines.length === 0) {
      return "";
    }
    const index = Math.max(0, Math.min(lines.length - 1, (lineNumber || 1) - 1));
    const start = Math.max(0, index - radius);
    const end = Math.min(lines.length, index + radius + 1);
    const slice = lines.slice(start, end);
    if (start > 0) {
      slice.unshift("…");
    }
    if (end < lines.length) {
      slice.push("…");
    }
    return slice.join("\n");
  }

  trimTextForPrompt(text, maxChars, errorLine = null) {
    const value = String(text || "");
    if (value.length <= maxChars) {
      return value;
    }
    if (errorLine != null && errorLine > 0) {
      const windowed = this.extractLineWindow(value, errorLine, 60);
      if (windowed.length <= maxChars) {
        return windowed;
      }
      return windowed.slice(0, Math.max(0, maxChars - 1)) + "…";
    }
    const head = Math.floor(maxChars * 0.65);
    const tail = Math.max(0, maxChars - head - 2);
    return `${value.slice(0, head)}\n…\n${value.slice(Math.max(0, value.length - tail))}`;
  }

  trimNearbyFilesForPrompt(files) {
    const list = [];
    for (const file of Array.isArray(files) ? files : []) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
        continue;
      }
      list.push({
        path: file.path,
        content: this.trimTextForPrompt(file.content, Math.floor(this.maxContextBytes / 4), file.errorLine || null)
      });
    }
    return list;
  }

  collectNearbyFiles(project, currentPath, request) {
    if (!request.includeNearbyFiles) {
      return [];
    }
    if (!this.isCodePath(currentPath)) {
      return [];
    }
    const sources = this.getSourceList(project).filter((source) => `ms/${source.name}.ms` !== currentPath);
    const nearby = [];
    for (const source of sources.slice(0, Math.max(0, this.maxNearbyFiles))) {
      nearby.push({
        path: `ms/${source.name}.ms`,
        content: source.content
      });
    }
    return nearby;
  }

  normalizeRequest(input, user) {
    const projectId = input.projectId != null ? String(input.projectId) : "";
    const project = this.getProject(projectId);
    if (!project) {
      throw safeError("project not found");
    }
    if (!project.manager) {
      throw safeError("project access unavailable");
    }
    if (!project.manager.canWrite(user)) {
      throw safeError("You do not have permission to edit this project", 403);
    }

    const normalizedPath = this.normalizePath(input.filePath);
    if (!normalizedPath || !this.isAllowedPath(normalizedPath)) {
      throw safeError("unsafe file path");
    }

    const fileInfo = project.getFileInfo(normalizedPath) || {};
    const fileVersion = isPositiveInteger(fileInfo.version) ? fileInfo.version : 0;

    const currentFileContent = typeof input.currentFileContent === "string"
      ? input.currentFileContent
      : "";
    const selectedCode = typeof input.codeContext?.selectedCode === "string"
      ? input.codeContext.selectedCode
      : typeof input.selectedCode === "string"
        ? input.selectedCode
        : "";
    const beforeCursor = typeof input.codeContext?.beforeCursor === "string"
      ? input.codeContext.beforeCursor
      : typeof input.beforeCursor === "string"
        ? input.beforeCursor
        : "";
    const afterCursor = typeof input.codeContext?.afterCursor === "string"
      ? input.codeContext.afterCursor
      : typeof input.afterCursor === "string"
        ? input.afterCursor
        : "";
    const manualErrorText = typeof input.errorText === "string" ? trimString(input.errorText, 4000) : "";

    const error = input.error && typeof input.error === "object" ? {
      message: manualErrorText || trimString(input.error.message, 4000),
      stack: trimString(input.error.stack, 8000),
      line: isPositiveInteger(Number(input.error.line)) ? Number(input.error.line) : null,
      column: isPositiveInteger(Number(input.error.column)) ? Number(input.error.column) : null,
      source: ["runtime", "syntax", "console", "user"].includes(String(input.error.source || "")) ? String(input.error.source) : "user",
      file: this.normalizePath(input.error.file) || normalizedPath
    } : {
      message: manualErrorText,
      stack: "",
      line: null,
      column: null,
      source: "user",
      file: normalizedPath
    };

    const options = {
      explanationLevel: ["beginner", "concise", "advanced"].includes(String(input.options?.explanationLevel || input.explanationLevel || "concise"))
        ? String(input.options?.explanationLevel || input.explanationLevel || "concise")
        : "concise",
      allowMultiFileFix: input.options?.allowMultiFileFix === true || input.allowMultiFileFix === true,
      preferMinimalPatch: input.options?.preferMinimalPatch !== false && input.preferMinimalPatch !== false,
      includeNearbyFiles: input.options?.includeNearbyFiles === true || input.includeNearbyFiles === true,
      includeMatterContext: input.options?.includeMatterContext === true || input.includeMatterContext === true,
      providerProfileId: input.providerProfileId != null ? String(input.providerProfileId) : null
    };

    const enabledLibraries = uniqueStrings([...(Array.isArray(project.libs) ? project.libs : []), ...(Array.isArray(project.libraries) ? project.libraries : [])]);
    const language = typeof input.language === "string" && input.language.trim().length > 0 ? input.language.trim() : String(project.language || "microscript_v2");
    const userIntent = trimString(input.userIntent || input.problemDescription || "", 4000);
    const currentFileHash = sha256(currentFileContent);

    return {
      project,
      projectId,
      filePath: normalizedPath,
      fileVersion,
      fileHash: currentFileHash,
      language,
      enabledLibraries,
      error,
      userIntent,
      options,
      currentFileContent,
      selectedCode,
      beforeCursor,
      afterCursor,
      nearbyFiles: this.collectNearbyFiles(project, normalizedPath, options)
    };
  }

  buildPromptPayload(request, previousProposals = []) {
    const errorLine = request.error && request.error.line != null ? request.error.line : null;
    const payload = {
      feature: "fix-error",
      projectId: request.projectId,
      filePath: request.filePath,
      language: request.language,
      enabledLibraries: request.enabledLibraries,
      error: request.error,
      codeContext: {
        selectedCode: this.trimTextForPrompt(request.selectedCode, Math.floor(this.maxContextBytes / 4), errorLine),
        currentFileContent: this.trimTextForPrompt(request.currentFileContent, Math.floor(this.maxContextBytes / 2), errorLine),
        beforeCursor: this.trimTextForPrompt(request.beforeCursor, Math.floor(this.maxContextBytes / 6), errorLine),
        afterCursor: this.trimTextForPrompt(request.afterCursor, Math.floor(this.maxContextBytes / 6), errorLine)
      },
      nearbyFiles: this.trimNearbyFilesForPrompt(request.nearbyFiles),
      userIntent: request.userIntent,
      options: request.options,
      previousProposals: Array.isArray(previousProposals) ? previousProposals.slice(-3).map((proposal) => ({
        summary: trimString(proposal.summary || "", 400),
        diagnosis: proposal.diagnosis || null,
        warnings: Array.isArray(proposal.warnings) ? proposal.warnings.slice(0, 10) : [],
        testsToTry: Array.isArray(proposal.testsToTry) ? proposal.testsToTry.slice(0, 10) : []
      })) : [],
      matterContext: {
        enabled: request.options.includeMatterContext === true || request.enabledLibraries.some((lib) => /matter/i.test(lib))
      },
      limits: {
        maxContextBytes: this.maxContextBytes,
        maxResponseBytes: this.maxResponseBytes
      },
      regenerateHint: previousProposals.length > 0 ? "The previous fix did not work. Propose a smaller or alternative fix." : ""
    };
    return JSON.stringify(payload, null, 2);
  }

  buildSystemPrompt() {
    return [
      "You are an expert microStudio game debugging assistant.",
      "Return only valid JSON matching the required schema.",
      "Do not include markdown or explanations outside JSON.",
      "Prefer the smallest safe fix.",
      "Do not add external network calls, eval, Function constructor, script injection, iframe injection, cookie access, or unsafe browser behavior.",
      "Do not modify unrelated files.",
      "If there is not enough context, set needsMoreContext to true and ask concise questions.",
      "Projects use microStudio source files stored under ms/ and documentation files stored under doc/.",
      "For the MVP, return one change only and use changeType replace_file."
    ].join("\n");
  }

  parseModelJson(content) {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      throw safeError(`Model output was not valid JSON: ${err.message}`, 422);
    }
    if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw safeError("Model output must be a JSON object", 422);
    }
    return parsed;
  }

  normalizeModelChange(change, request) {
    if (!change || typeof change !== "object") {
      return null;
    }
    const path = this.normalizePath(change.path);
    if (path !== request.filePath) {
      throw safeError("AI proposed an unsafe or unsupported file path", 422);
    }
    const changeType = String(change.changeType || "").trim();
    if (changeType !== "replace_file") {
      throw safeError("AI proposed an unsupported change type", 422);
    }
    const newContent = typeof change.newContent === "string" ? change.newContent : "";
    const oldContent = typeof change.oldContent === "string" ? change.oldContent : "";
    if (!newContent) {
      throw safeError("AI did not provide replacement content", 422);
    }
    if (newContent.length > this.maxResponseBytes) {
      throw safeError("AI proposed content that is too large", 422);
    }
    if (this.isCodePath(path) && this.detectUnsafeGeneratedCode(newContent)) {
      throw safeError("AI proposed unsafe generated code", 422);
    }
    return {
      path,
      changeType: "replace_file",
      startLine: 1,
      endLine: 1,
      oldContent,
      newContent,
      explanation: trimString(change.explanation || "", 1200)
    };
  }

  detectUnsafeGeneratedCode(content) {
    const text = String(content || "");
    const patterns = [
      /(^|[^A-Za-z0-9_])eval\s*\(/i,
      /(^|[^A-Za-z0-9_])new\s+Function\b/i,
      /document\.cookie/i,
      /<script\b/i,
      /<\/script>/i,
      /\biframe\b/i,
      /\bXMLHttpRequest\b/i,
      /(^|[^A-Za-z0-9_])fetch\s*\(/i,
      /\bimport\s*\(/i,
      /\brequire\s*\(/i,
      /\bprocess\.env\b/i,
      /\blocalStorage\b/i,
      /\bsessionStorage\b/i
    ];
    return patterns.some((pattern) => pattern.test(text));
  }

  normalizeProposal(parsed, request, previousProposals = []) {
    const summary = trimString(parsed.summary || parsed.userExplanation || "", 1000);
    const diagnosisRaw = parsed.diagnosis && typeof parsed.diagnosis === "object" ? parsed.diagnosis : {};
    const diagnosis = {
      errorType: ["syntax", "runtime", "logic", "import", "physics", "api", "unknown"].includes(String(diagnosisRaw.errorType || "unknown"))
        ? String(diagnosisRaw.errorType || "unknown")
        : "unknown",
      rootCause: trimString(diagnosisRaw.rootCause || "", 1500),
      affectedFile: this.normalizePath(diagnosisRaw.affectedFile || request.filePath) || request.filePath,
      affectedLines: Array.isArray(diagnosisRaw.affectedLines)
        ? diagnosisRaw.affectedLines.filter((n) => isPositiveInteger(Number(n))).slice(0, 10).map((n) => Number(n))
        : [],
      confidence: Math.max(0, Math.min(1, Number(diagnosisRaw.confidence || 0)))
    };

    const fixPlan = Array.isArray(parsed.fixPlan) ? parsed.fixPlan.filter((item) => typeof item === "string").map((item) => trimString(item, 400)).slice(0, 20) : [];
    const warnings = Array.isArray(parsed.warnings) ? parsed.warnings.filter((item) => typeof item === "string").map((item) => trimString(item, 600)).slice(0, 20) : [];
    const testsToTry = Array.isArray(parsed.testsToTry) ? parsed.testsToTry.filter((item) => typeof item === "string").map((item) => trimString(item, 400)).slice(0, 20) : [];
    const questions = Array.isArray(parsed.questions) ? parsed.questions.filter((item) => typeof item === "string").map((item) => trimString(item, 400)).slice(0, 8) : [];
    const userExplanation = trimString(parsed.userExplanation || summary, 4000);
    const needsMoreContext = parsed.needsMoreContext === true || (questions.length > 0 && fixPlan.length === 0);

    const rawChanges = Array.isArray(parsed.changes) ? parsed.changes : [];
    if (!needsMoreContext && rawChanges.length === 0) {
      throw safeError("AI output did not include any changes", 422);
    }
    if (!request.options.allowMultiFileFix && rawChanges.length > 1) {
      throw safeError("AI proposed multiple file changes for an MVP single-file fix", 422);
    }

    const changes = needsMoreContext
      ? []
      : rawChanges.map((change) => this.normalizeModelChange(change, request)).filter(Boolean);

    if (!needsMoreContext && changes.length === 0) {
      throw safeError("AI output did not include a usable change", 422);
    }
    if (!needsMoreContext && changes.length > 1 && !request.options.allowMultiFileFix) {
      throw safeError("AI proposed multiple file changes for an MVP single-file fix", 422);
    }

    return {
      summary,
      diagnosis,
      fixPlan,
      changes,
      warnings,
      testsToTry,
      userExplanation,
      needsMoreContext,
      questions
    };
  }

  async generateFix(input, user) {
    const request = this.normalizeRequest(input, user);
    const previousProposals = Array.isArray(input.previousProposals) ? input.previousProposals : [];
    const prompt = this.buildPromptPayload(request, previousProposals);
    if (this.logPrompts) {
      console.info("[ai-fix-error prompt]", prompt.slice(0, this.maxPromptLogBytes));
    }
    const result = await this.gateway.generate({
      feature: "fix-error",
      purpose: "text",
      providerProfileId: request.options.providerProfileId,
      responseFormat: "json",
      temperature: 0.1,
      maxTokens: 4500,
      userId: user && user.id != null ? user.id : null,
      messages: [
        { role: "system", content: this.buildSystemPrompt() },
        { role: "user", content: prompt }
      ]
    });
    const parsed = this.parseModelJson(result.content);
    const fix = this.normalizeProposal(parsed, request, previousProposals);
    const proposal = this.createProposalRecord({
      userId: user.id,
      projectId: request.projectId,
      filePath: request.filePath,
      baseVersion: request.fileVersion,
      baseHash: request.fileHash,
      createdAt: now(),
      updatedAt: now(),
      request: {
        projectId: request.projectId,
        filePath: request.filePath,
        language: request.language,
        enabledLibraries: request.enabledLibraries,
        error: request.error,
        userIntent: request.userIntent,
        options: request.options,
        currentFileLength: request.currentFileContent.length
      },
      fix,
      provider: {
        id: result.providerId,
        name: result.providerName,
        modelId: result.modelId
      },
      status: fix.needsMoreContext ? "needs_more_context" : "proposed"
    });
    return {
      ok: true,
      proposalId: proposal.id,
      fix: clone(fix),
      provider: {
        id: result.providerId,
        name: result.providerName,
        modelId: result.modelId
      }
    };
  }

  async applyFix(input, user) {
    const proposalId = input && input.fixProposalId != null ? String(input.fixProposalId) : "";
    if (!proposalId) {
      throw safeError("fixProposalId is required");
    }
    const proposalRecord = this.getProposalRecord(proposalId);
    if (!proposalRecord) {
      throw safeError("fix proposal not found", 404);
    }
    const proposal = proposalRecord.get();
    if (!proposal || proposal.userId !== user.id) {
      throw safeError("You do not have permission to apply this proposal", 403);
    }
    const project = this.getProject(proposal.projectId);
    if (!project) {
      throw safeError("project not found");
    }
    if (!project.manager || !project.manager.canWrite(user)) {
      throw safeError("You do not have permission to edit this project", 403);
    }

    const fix = proposal.fix || {};
    const acceptedChanges = Array.isArray(input.acceptedChanges) ? input.acceptedChanges : [];
    if (fix.needsMoreContext) {
      throw safeError("The proposal needs more context before it can be applied", 422);
    }
    if (!acceptedChanges.length) {
      throw safeError("acceptedChanges is required");
    }
    if (!Array.isArray(fix.changes) || fix.changes.length === 0) {
      throw safeError("The proposal has no changes to apply", 422);
    }
    if (acceptedChanges.length !== fix.changes.length) {
      throw safeError("The accepted changes do not match the proposal", 422);
    }

    for (let i = 0; i < acceptedChanges.length; i++) {
      const accepted = acceptedChanges[i] || {};
      const proposalChange = fix.changes[i];
      const normalizedPath = this.normalizePath(accepted.path);
      if (normalizedPath !== proposalChange.path) {
        throw safeError("The accepted changes do not match the proposal", 422);
      }
      if (String(accepted.newContent || "") !== String(proposalChange.newContent || "")) {
        throw safeError("The accepted changes do not match the proposal", 422);
      }
      if (!this.isAllowedPath(normalizedPath)) {
        throw safeError("unsafe file path");
      }
      if (this.isCodePath(normalizedPath) && this.detectUnsafeGeneratedCode(accepted.newContent)) {
        throw safeError("AI proposed unsafe generated code", 422);
      }
    }

    const currentInfo = project.getFileInfo(proposal.filePath) || {};
    const currentVersion = isPositiveInteger(currentInfo.version) ? currentInfo.version : 0;
    if (currentVersion !== proposal.baseVersion) {
      throw safeError("This file changed after the AI fix was generated. Review the diff before applying.", 409);
    }

    const currentContent = await this.readFile(project.content.files, `${project.owner.id}/${project.id}/${proposal.filePath}`, "utf8");
    const currentHash = sha256(currentContent == null ? "" : currentContent);
    if (currentHash !== proposal.baseHash) {
      throw safeError("This file changed after the AI fix was generated. Review the diff before applying.", 409);
    }

    const backup = await this.snapshotProjectFiles(project, [proposal.filePath]);
    const backupRecord = this.createBackupRecord({
      userId: user.id,
      proposalId,
      projectId: project.id,
      createdAt: now(),
      items: backup.items
    });

    const appliedPaths = [];
    try {
      for (const accepted of acceptedChanges) {
        const path = this.normalizePath(accepted.path);
        await this.writePath(project, path, accepted.newContent);
        const nextVersion = currentVersion + 1;
        const nextSize = Buffer.byteLength(String(accepted.newContent), "utf8");
        project.setFileInfo(path, "version", nextVersion);
        project.setFileInfo(path, "size", nextSize);
        const nextInfo = project.getFileInfo(path) || {};
        if (project.manager && typeof project.manager.propagateFileChange === "function") {
          project.manager.propagateFileChange(null, path, nextVersion, String(accepted.newContent), nextInfo.properties || {});
        }
        appliedPaths.push(path);
      }
      project.touch();
      proposalRecord.set({
        ...proposalRecord.get(),
        status: "applied",
        appliedAt: now(),
        backupId: backupRecord.id
      });
      return {
        ok: true,
        proposalId,
        backupId: backupRecord.id,
        appliedFiles: appliedPaths
      };
    } catch (err) {
      await this.restoreBackup(project, backup.items, appliedPaths);
      throw err;
    }
  }

  async snapshotProjectFiles(project, paths) {
    const items = [];
    if (!project || !Array.isArray(paths)) {
      return { items };
    }
    for (const path of paths) {
      const content = await this.readFile(project.content.files, `${project.owner.id}/${project.id}/${path}`, "utf8");
      if (content != null) {
        items.push({
          path,
          contentBase64: Buffer.from(String(content), "utf8").toString("base64"),
          encoding: "utf8",
          size: Buffer.byteLength(String(content), "utf8"),
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
        await this.writePath(project, item.path, buffer.toString("utf8"));
        this.restoreProjectFileInfo(project, item.path, item.info || {}, buffer.length);
      } catch (err) {
        // best effort rollback
      }
    }
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
}

module.exports = {
  FixErrorService
};
