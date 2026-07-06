const express = require("express");
const { AiGatewayManager } = require("./ai/ai_gateway_manager.js");
const { AiGameGeneratorService } = require("./ai/game_generator.js");

this.API = (function() {
  function API(server, webapp) {
    this.server = server;
    this.webapp = webapp;
    this.app = this.webapp.app;
    this.gateway = this.server.aiGateway || new AiGatewayManager(this.server);
    this.server.aiGateway = this.gateway;
    this.ai = new AiGameGeneratorService(this.server, this.webapp, this.gateway);

    this.app.use(express.json({ limit: "2mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "2mb" }));

    this.app.get(/^\/api\/status\/?$/, (req, res) => {
      var approved, i, id, j, len, len1, list, p, post, posts, projects, response;
      if (this.webapp.ensureDevArea(req, res)) {
        return;
      }
      res.setHeader("Content-Type", "application/json");
      list = this.server.content.new_projects.slice(0, 4);
      projects = [];
      for (i = 0, len = list.length; i < len; i++) {
        p = list[i];
        approved = p.flags.approved || ((p.owner != null) && p.owner.flags.approved);
        projects.push({
          id: p.id,
          title: p.title,
          slug: p.slug,
          owner: p.owner.nick,
          url: "https://microstudio.dev/i/" + p.owner.nick + "/" + p.slug + "/",
          date: p.first_published,
          type: p.type,
          approved: approved
        });
      }
      posts = this.server.content.forum.posts;
      list = [];
      for (id in posts) {
        post = posts[id];
        if (!post.deleted && post.date > Date.now() - 60 * 60 * 1000 * 24) {
          list.push(post);
        }
      }
      list.sort(function(a, b) {
        return b.date - a.date;
      });
      list = list.slice(0, 5);
      posts = [];
      for (j = 0, len1 = list.length; j < len1; j++) {
        p = list[j];
        if (p.category.language === "en") {
          posts.push({
            id: p.id,
            url: "https://microstudio.dev/community/" + p.category.slug + "/" + p.slug + "/" + p.id + "/",
            language: p.category.language,
            title: p.title,
            author: p.author.nick,
            date: p.date,
            category: p.category.slug
          });
        }
      }
      response = {
        status: "running",
        status_at: Date.now(),
        started_at: this.server.date_started,
        active_builders: this.server.build_manager.getActiveBuildersData(),
        new_public_projects: projects,
        recent_community_posts: posts
      };
      return res.send(JSON.stringify(response, null, 2));
    });

    this.app.get(/^\/api\/ai\/providers\/public\/?$/, async (req, res) => {
      return this.handlePublicAiProviders(req, res);
    });

    this.app.post(/^\/api\/ai\/game-generator\/?$/, async (req, res) => {
      return this.handleAiGenerate(req, res);
    });

    this.app.post(/^\/api\/ai\/generate-game\/?$/, async (req, res) => {
      return this.handleAiGenerate(req, res);
    });

    this.app.post(/^\/api\/ai\/regenerate-game\/?$/, async (req, res) => {
      return this.handleAiRegenerate(req, res);
    });

    this.app.post(/^\/api\/ai\/explain-generated-game\/?$/, async (req, res) => {
      return this.handleAiExplain(req, res);
    });

    this.app.post(/^\/api\/ai\/regenerate-image\/?$/, async (req, res) => {
      return this.handleAiRegenerateImage(req, res);
    });

    this.app.post(/^\/api\/ai\/drafts\/(\d+)\/export\/?$/, async (req, res) => {
      return this.handleAiExportDraft(req, res);
    });

    this.app.post(/^\/api\/ai\/apply-game\/?$/, async (req, res) => {
      return this.handleAiApply(req, res);
    });

    this.app.get(/^\/api\/admin\/ai\/providers\/?$/, async (req, res) => {
      return this.handleAdminAiProviders(req, res);
    });

    this.app.post(/^\/api\/admin\/ai\/providers\/?$/, async (req, res) => {
      return this.handleAdminCreateAiProvider(req, res);
    });

    this.app.get(/^\/api\/admin\/ai\/providers\/(\d+)\/?$/, async (req, res) => {
      return this.handleAdminGetAiProvider(req, res);
    });

    this.app.patch(/^\/api\/admin\/ai\/providers\/(\d+)\/?$/, async (req, res) => {
      return this.handleAdminUpdateAiProvider(req, res);
    });

    this.app.delete(/^\/api\/admin\/ai\/providers\/(\d+)\/?$/, async (req, res) => {
      return this.handleAdminDeleteAiProvider(req, res);
    });

    this.app.post(/^\/api\/admin\/ai\/providers\/(\d+)\/test\/?$/, async (req, res) => {
      return this.handleAdminTestAiProvider(req, res);
    });

    this.app.post(/^\/api\/admin\/ai\/providers\/(\d+)\/set-default\/?$/, async (req, res) => {
      return this.handleAdminSetDefaultAiProvider(req, res);
    });
  }

  API.prototype.getCurrentUser = function(req) {
    var token;
    if ((req.cookies != null) && typeof req.cookies.token === "string" && req.cookies.token.length > 0) {
      token = this.server.content.findToken(req.cookies.token);
      if ((token != null) && (token.user != null) && !token.user.flags.deleted) {
        return token.user;
      }
    }
    return null;
  };

  API.prototype.ensureAdmin = function(req, res) {
    var user;
    user = this.getCurrentUser(req);
    if (user == null) {
      this.sendError(res, 401, "not connected");
      return null;
    }
    if (!(user.flags != null && user.flags.admin)) {
      this.sendError(res, 403, "admin only");
      return null;
    }
    return user;
  };

  API.prototype.sendError = function(res, status, error) {
    return res.status(status).json({
      name: "error",
      error: error
    });
  };

  API.prototype.handleAiError = function(res, err) {
    var message, status;
    message = err != null && err.message != null ? err.message : "Unexpected error";
    status = 500;
    if (/idea is required|draft not found|image asset not found|target project id is required|target project not found|You must own the target project|You must own the target draft|Requested provider profile not found|Requested provider profile is disabled|Requested provider profile is not available for this purpose|No AI provider configured|Provider not found/i.test(message)) {
      status = 400;
    } else if (/OPENAI_API_KEY|provider|OpenAI request failed|AI provider request failed/i.test(message)) {
      status = 502;
    }
    return this.sendError(res, status, message);
  };

  API.prototype.handlePublicAiProviders = function(req, res) {
    var purpose, user;
    user = this.getCurrentUser(req);
    if (user == null) {
      return this.sendError(res, 401, "not connected");
    }
    purpose = typeof req.query.purpose === "string" ? req.query.purpose : "text";
    return res.json({
      providers: this.gateway.listPublicProviders(purpose)
    });
  };

  API.prototype.handleAiGenerate = async function(req, res) {
    var user;
    user = this.getCurrentUser(req);
    if (user == null) {
      return this.sendError(res, 401, "not connected");
    }
    if (!this.server.rate_limiter.accept("ai_generate_ip", req.ip)) {
      return this.sendError(res, 429, "rate limited");
    }
    if (!this.server.rate_limiter.accept("ai_generate_user", user.id)) {
      return this.sendError(res, 429, "rate limited");
    }
    try {
      return res.json(await this.ai.generateGameProject(req.body || {}, user));
    } catch (err) {
      return this.handleAiError(res, err);
    }
  };

  API.prototype.handleAiRegenerate = async function(req, res) {
    var user;
    user = this.getCurrentUser(req);
    if (user == null) {
      return this.sendError(res, 401, "not connected");
    }
    if (!this.server.rate_limiter.accept("ai_generate_ip", req.ip)) {
      return this.sendError(res, 429, "rate limited");
    }
    if (!this.server.rate_limiter.accept("ai_generate_user", user.id)) {
      return this.sendError(res, 429, "rate limited");
    }
    try {
      if (!req.body || !req.body.draftId) {
        return this.sendError(res, 400, "draftId is required");
      }
      return res.json(await this.ai.regenerateGameProject(req.body.draftId, req.body, user));
    } catch (err) {
      return this.handleAiError(res, err);
    }
  };

  API.prototype.handleAiExplain = async function(req, res) {
    var user;
    user = this.getCurrentUser(req);
    if (user == null) {
      return this.sendError(res, 401, "not connected");
    }
    if (!this.server.rate_limiter.accept("ai_explain_ip", req.ip)) {
      return this.sendError(res, 429, "rate limited");
    }
    if (!this.server.rate_limiter.accept("ai_explain_user", user.id)) {
      return this.sendError(res, 429, "rate limited");
    }
    try {
      if (!req.body || !req.body.draftId) {
        return this.sendError(res, 400, "draftId is required");
      }
      return res.json(await this.ai.explainGeneratedGame(req.body.draftId, req.body.question, user));
    } catch (err) {
      return this.handleAiError(res, err);
    }
  };

  API.prototype.handleAiApply = async function(req, res) {
    var mode, user;
    user = this.getCurrentUser(req);
    if (user == null) {
      return this.sendError(res, 401, "not connected");
    }
    if (!this.server.rate_limiter.accept("ai_apply_ip", req.ip)) {
      return this.sendError(res, 429, "rate limited");
    }
    if (!this.server.rate_limiter.accept("ai_apply_user", user.id)) {
      return this.sendError(res, 429, "rate limited");
    }
    try {
      if (!req.body || !req.body.draftId) {
        return this.sendError(res, 400, "draftId is required");
      }
      mode = req.body.mode || "apply_to_current_project";
      if (mode === "apply_to_current_project" && !req.body.targetProjectId) {
        return this.sendError(res, 400, "targetProjectId is required");
      }
      return res.json(await this.ai.applyProjectDraft(req.body.draftId, user, req.body.targetProjectId, mode));
    } catch (err) {
      return this.handleAiError(res, err);
    }
  };

  API.prototype.handleAiRegenerateImage = async function(req, res) {
    var user;
    user = this.getCurrentUser(req);
    if (user == null) {
      return this.sendError(res, 401, "not connected");
    }
    if (!this.server.rate_limiter.accept("ai_generate_ip", req.ip)) {
      return this.sendError(res, 429, "rate limited");
    }
    if (!this.server.rate_limiter.accept("ai_generate_user", user.id)) {
      return this.sendError(res, 429, "rate limited");
    }
    try {
      if (!req.body || !req.body.draftId) {
        return this.sendError(res, 400, "draftId is required");
      }
      if (!req.body.assetId) {
        return this.sendError(res, 400, "assetId is required");
      }
      return res.json(await this.ai.regenerateImageAsset(req.body.draftId, req.body.assetId, req.body, user));
    } catch (err) {
      return this.handleAiError(res, err);
    }
  };

  API.prototype.handleAiExportDraft = function(req, res) {
    var draft, draftRecord, user;
    user = this.getCurrentUser(req);
    if (user == null) {
      return this.sendError(res, 401, "not connected");
    }
    draftRecord = this.ai.getDraftRecord(req.params[0]);
    if (draftRecord == null) {
      return this.sendError(res, 404, "draft not found");
    }
    draft = draftRecord.get();
    if ((draft != null ? draft.userId : void 0) != null && draft.userId !== user.id && !(user.flags != null && user.flags.admin)) {
      return this.sendError(res, 403, "You must own the target draft");
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="ai-draft-${req.params[0]}.json"`);
    return res.send(JSON.stringify(draft, null, 2));
  };

  API.prototype.handleAdminAiProviders = function(req, res) {
    var purpose, user;
    user = this.ensureAdmin(req, res);
    if (user == null) {
      return;
    }
    purpose = typeof req.query.purpose === "string" ? req.query.purpose : null;
    return res.json({
      providers: this.gateway.listAdminProviders(purpose)
    });
  };

  API.prototype.handleAdminGetAiProvider = function(req, res) {
    var user;
    user = this.ensureAdmin(req, res);
    if (user == null) {
      return;
    }
    return res.json({
      provider: this.gateway.getProvider(req.params[0])
    });
  };

  API.prototype.handleAdminCreateAiProvider = function(req, res) {
    var user;
    user = this.ensureAdmin(req, res);
    if (user == null) {
      return;
    }
    try {
      return res.json({
        provider: this.gateway.createProvider(req.body || {})
      });
    } catch (err) {
      return this.handleAiError(res, err);
    }
  };

  API.prototype.handleAdminUpdateAiProvider = function(req, res) {
    var provider, user;
    user = this.ensureAdmin(req, res);
    if (user == null) {
      return;
    }
    try {
      provider = this.gateway.updateProvider(req.params[0], req.body || {});
      if (provider == null) {
        return this.sendError(res, 404, "provider not found");
      }
      return res.json({
        provider: provider
      });
    } catch (err) {
      return this.handleAiError(res, err);
    }
  };

  API.prototype.handleAdminDeleteAiProvider = function(req, res) {
    var user;
    user = this.ensureAdmin(req, res);
    if (user == null) {
      return;
    }
    if (!this.gateway.deleteProvider(req.params[0])) {
      return this.sendError(res, 404, "provider not found");
    }
    return res.json({
      ok: true
    });
  };

  API.prototype.handleAdminSetDefaultAiProvider = function(req, res) {
    var provider, user;
    user = this.ensureAdmin(req, res);
    if (user == null) {
      return;
    }
    provider = this.gateway.setDefaultProvider(req.params[0]);
    if (provider == null) {
      return this.sendError(res, 404, "provider not found");
    }
    return res.json({
      provider: provider
    });
  };

  API.prototype.handleAdminTestAiProvider = async function(req, res) {
    var user;
    user = this.ensureAdmin(req, res);
    if (user == null) {
      return;
    }
    try {
      return res.json(await this.gateway.testProvider(req.params[0], user.id));
    } catch (err) {
      return this.handleAiError(res, err);
    }
  };

  return API;
})();

module.exports = this.API;
