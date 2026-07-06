express = require "express"
{AiGameGeneratorService} = require "./ai/game_generator.js"

class @API
  constructor:(@server,@webapp)->
    @app = @webapp.app
    @ai = new AiGameGeneratorService @server,@webapp

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

    @app.post /^\/api\/ai\/generate-game\/?$/, (req,res)=>
      @handleAiGenerate req,res

    @app.post /^\/api\/ai\/regenerate-game\/?$/, (req,res)=>
      @handleAiRegenerate req,res

    @app.post /^\/api\/ai\/explain-generated-game\/?$/, (req,res)=>
      @handleAiExplain req,res

    @app.post /^\/api\/ai\/apply-game\/?$/, (req,res)=>
      @handleAiApply req,res

  getCurrentUser:(req)->
    if req.cookies? and typeof req.cookies.token == "string" and req.cookies.token.length > 0
      token = @server.content.findToken req.cookies.token
      if token? and token.user? and not token.user.flags.deleted
        return token.user
    null

  sendError:(res,status,error)->
    res.status(status).json
      name: "error"
      error: error

  handleAiError:(res,err)->
    message = if err?.message? then err.message else "Unexpected error"
    status = 500
    if /idea is required|draft not found|target project id is required|target project not found|You must own the target project/i.test message
      status = 400
    else if /OPENAI_API_KEY|provider|OpenAI request failed/i.test message
      status = 502
    @sendError res,status,message

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

module.exports = @API
