express = require "express"
{AiGatewayManager} = require "./ai/ai_gateway_manager.js"
{AiGameGeneratorService} = require "./ai/game_generator.js"

class @API
  constructor:(@server,@webapp)->
    @app = @webapp.app
    @gateway = @server.aiGateway or new AiGatewayManager @server
    @server.aiGateway = @gateway
    @ai = new AiGameGeneratorService @server,@webapp,@gateway

    @app.use express.json limit: "2mb"
    @app.use express.urlencoded extended: true, limit: "2mb"

    @app.get /^\/api\/status\/?$/, (req,res)=>
      return if @webapp.ensureDevArea(req,res)

      res.setHeader("Content-Type", "application/json")

      list = @server.content.new_projects.slice(0,4)
      projects = []
      for p in list
        approved = p.flags.approved or (p.owner? and p.owner.flags.approved)
        projects.push
          id: p.id
          title: p.title
          slug: p.slug
          owner: p.owner.nick
          url: "https://microstudio.dev/i/#{p.owner.nick}/#{p.slug}/"
          date: p.first_published
          type: p.type
          approved: approved

      posts = @server.content.forum.posts
      list = []
      for id,post of posts
        if not post.deleted and post.date > Date.now()-60*60*1000*24
          list.push post

      list.sort (a,b)->b.date-a.date
      list = list.slice(0,5)
      posts = []
      for p in list
        if p.category.language == "en"
          posts.push
            id: p.id
            url: "https://microstudio.dev/community/#{p.category.slug}/#{p.slug}/#{p.id}/"
            language: p.category.language
            title: p.title
            author: p.author.nick
            date: p.date
            category: p.category.slug

      response =
        status: "running"
        status_at: Date.now()
        started_at: @server.date_started
        active_builders: @server.build_manager.getActiveBuildersData()
        new_public_projects: projects
        recent_community_posts: posts

      res.send JSON.stringify response,null,2

    @app.get /^\/api\/ai\/providers\/public\/?$/, (req,res)=>
      @handlePublicAiProviders req,res

    @app.post /^\/api\/ai\/game-generator\/?$/, (req,res)=>
      @handleAiGenerate req,res

    @app.post /^\/api\/ai\/generate-game\/?$/, (req,res)=>
      @handleAiGenerate req,res

    @app.post /^\/api\/ai\/regenerate-game\/?$/, (req,res)=>
      @handleAiRegenerate req,res

    @app.post /^\/api\/ai\/explain-generated-game\/?$/, (req,res)=>
      @handleAiExplain req,res

    @app.post /^\/api\/ai\/regenerate-image\/?$/, (req,res)=>
      @handleAiRegenerateImage req,res

    @app.post /^\/api\/ai\/apply-game\/?$/, (req,res)=>
      @handleAiApply req,res

    @app.get /^\/api\/admin\/ai\/providers\/?$/, (req,res)=>
      @handleAdminAiProviders req,res

    @app.post /^\/api\/admin\/ai\/providers\/?$/, (req,res)=>
      @handleAdminCreateAiProvider req,res

    @app.get /^\/api\/admin\/ai\/providers\/(\d+)\/?$/, (req,res)=>
      @handleAdminGetAiProvider req,res

    @app.patch /^\/api\/admin\/ai\/providers\/(\d+)\/?$/, (req,res)=>
      @handleAdminUpdateAiProvider req,res

    @app.delete /^\/api\/admin\/ai\/providers\/(\d+)\/?$/, (req,res)=>
      @handleAdminDeleteAiProvider req,res

    @app.post /^\/api\/admin\/ai\/providers\/(\d+)\/test\/?$/, (req,res)=>
      @handleAdminTestAiProvider req,res

    @app.post /^\/api\/admin\/ai\/providers\/(\d+)\/set-default\/?$/, (req,res)=>
      @handleAdminSetDefaultAiProvider req,res

  getCurrentUser:(req)->
    if req.cookies? and typeof req.cookies.token == "string" and req.cookies.token.length > 0
      token = @server.content.findToken req.cookies.token
      if token? and token.user? and not token.user.flags.deleted
        return token.user
    null

  ensureAdmin:(req,res)->
    user = @getCurrentUser req
    if not user?
      @sendError res,401,"not connected"
      return null
    if not (user.flags? and user.flags.admin)
      @sendError res,403,"admin only"
      return null
    user

  sendError:(res,status,error)->
    res.status(status).json
      name: "error"
      error: error

  handleAiError:(res,err)->
    message = if err?.message? then err.message else "Unexpected error"
    status = 500
    if /idea is required|draft not found|image asset not found|target project id is required|target project not found|You must own the target project|You must own the target draft|Requested provider profile not found|Requested provider profile is disabled|Requested provider profile is not available for this purpose|No AI provider configured|Provider not found/i.test message
      status = 400
    else if /OPENAI_API_KEY|provider|OpenAI request failed|AI provider request failed/i.test message
      status = 502
    @sendError res,status,message

  handlePublicAiProviders:(req,res)->
    user = @getCurrentUser req
    return @sendError res,401,"not connected" if not user?
    purpose = if typeof req.query?.purpose == "string" then req.query.purpose else "text"
    res.json
      providers: @gateway.listPublicProviders purpose

  handleAiGenerate:(req,res)->
    user = @getCurrentUser req
    return @sendError res,401,"not connected" if not user?
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_generate_ip",req.ip
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_generate_user",user.id
    @ai.generateGameProject(req.body or {},user).then((result)=>
      res.json result
    ).catch((err)=>
      @handleAiError res,err
    )

  handleAiRegenerate:(req,res)->
    user = @getCurrentUser req
    return @sendError res,401,"not connected" if not user?
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_generate_ip",req.ip
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_generate_user",user.id
    return @sendError res,400,"draftId is required" if not req.body? or not req.body.draftId?
    @ai.regenerateGameProject(req.body.draftId,req.body,user).then((result)=>
      res.json result
    ).catch((err)=>
      @handleAiError res,err
    )

  handleAiExplain:(req,res)->
    user = @getCurrentUser req
    return @sendError res,401,"not connected" if not user?
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_explain_ip",req.ip
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_explain_user",user.id
    return @sendError res,400,"draftId is required" if not req.body? or not req.body.draftId?
    @ai.explainGeneratedGame(req.body.draftId,req.body.question,user).then((result)=>
      res.json result
    ).catch((err)=>
      @handleAiError res,err
    )

  handleAiApply:(req,res)->
    user = @getCurrentUser req
    return @sendError res,401,"not connected" if not user?
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_apply_ip",req.ip
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_apply_user",user.id
    return @sendError res,400,"draftId is required" if not req.body? or not req.body.draftId?
    mode = req.body.mode or "apply_to_current_project"
    if mode == "apply_to_current_project" and not req.body.targetProjectId?
      return @sendError res,400,"targetProjectId is required"
    @ai.applyProjectDraft(req.body.draftId,user,req.body.targetProjectId,mode).then((result)=>
      res.json result
    ).catch((err)=>
      @handleAiError res,err
    )

  handleAiRegenerateImage:(req,res)->
    user = @getCurrentUser req
    return @sendError res,401,"not connected" if not user?
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_generate_ip",req.ip
    return @sendError res,429,"rate limited" if not @server.rate_limiter.accept "ai_generate_user",user.id
    return @sendError res,400,"draftId is required" if not req.body? or not req.body.draftId?
    return @sendError res,400,"assetId is required" if not req.body.assetId?
    @ai.regenerateImageAsset(req.body.draftId,req.body.assetId,req.body,user).then((result)=>
      res.json result
    ).catch((err)=>
      @handleAiError res,err
    )

  handleAdminAiProviders:(req,res)->
    user = @ensureAdmin req,res
    return if not user?
    purpose = if typeof req.query?.purpose == "string" then req.query.purpose else null
    res.json
      providers: @gateway.listAdminProviders purpose

  handleAdminGetAiProvider:(req,res)->
    user = @ensureAdmin req,res
    return if not user?
    res.json
      provider: @gateway.getProvider req.params[0]

  handleAdminCreateAiProvider:(req,res)->
    user = @ensureAdmin req,res
    return if not user?
    try
      res.json
        provider: @gateway.createProvider req.body or {}
    catch err
      @handleAiError res,err

  handleAdminUpdateAiProvider:(req,res)->
    user = @ensureAdmin req,res
    return if not user?
    try
      provider = @gateway.updateProvider req.params[0], req.body or {}
      return @sendError res,404,"provider not found" if not provider?
      res.json
        provider: provider
    catch err
      @handleAiError res,err

  handleAdminDeleteAiProvider:(req,res)->
    user = @ensureAdmin req,res
    return if not user?
    return @sendError res,404,"provider not found" if not @gateway.deleteProvider req.params[0]
    res.json
      ok: true

  handleAdminSetDefaultAiProvider:(req,res)->
    user = @ensureAdmin req,res
    return if not user?
    provider = @gateway.setDefaultProvider req.params[0]
    return @sendError res,404,"provider not found" if not provider?
    res.json
      provider: provider

  handleAdminTestAiProvider:(req,res)->
    user = @ensureAdmin req,res
    return if not user?
    @gateway.testProvider(req.params[0],user.id).then((result)=>
      res.json result
    ,(err)=>
      @handleAiError res,err
    )

module.exports = @API
