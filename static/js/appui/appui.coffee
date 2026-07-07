class AppUI
  constructor:(@app)->
    @sections = [
      "code"
      "sprites"
      "maps"
      "assets"
      "sounds"
      "music"
      "doc"
      "sync"
      "options"
      "publish"
      "tabs"
      "ai-generator"
    ]

    @menuoptions = [
      "home"
      "explore"
      "projects"
      "help"
      "tutorials"
      "about"
      "usersettings"
    ]

    for s in @sections
      do (s)=>
        if document.getElementById("menuitem-#{s}")?
          document.getElementById("menuitem-#{s}").addEventListener "click",(event)=>
            @setSection(s,true)

    @warning_messages = []

    document.addEventListener "keydown",(e)=>
      if (if window.navigator.platform.match("Mac") then e.metaKey else e.ctrlKey) && e.keyCode == 83
        e.preventDefault()
        switch @current_section
          when "code" then @app.editor.checkSave true
          when "sprites" then @app.sprite_editor.checkSave true
          when "maps" then @app.map_editor.checkSave true
          when "doc" then @app.doc_editor.checkSave true
          when "assets" then @app.assets_manager.text_viewer.checkSave true

    for s in @menuoptions
      do (s)=>
        e = document.getElementById("menu-#{s}")
        if e?
          e.addEventListener "click",(event)=>
            if window.ms_standalone and s == "explore"
              window.open "https://microstudio.dev/explore/","_blank"
            else if window.ms_standalone and s == "home"
              window.open "https://microstudio.dev","_blank"
            else
              @setMainSection(s,true)

    @setAction "logo",()=>
      if window.ms_standalone
        window.open "https://microstudio.dev","_blank"
      else
        @setMainSection("home",true)

    if window.ms_standalone
      document.getElementById("menu-community").parentNode.href = "https://microstudio.dev/community/"

      document.getElementById("projectoptions-users-content").style.display = "none"
      document.getElementById("publish-box-online").style.display = "none"
      document.getElementById("usersetting-block-nickname").style.display = "none"
      document.getElementById("usersetting-block-email").style.display = "none"
      document.getElementById("usersetting-block-newsletter").style.display = "none"
      document.getElementById("usersetting-block-account-type").style.display = "none"

      document.body.classList.add "standalone"

    #@setSection("options")
    @createLoginFunctions()
    @createAiGeneratorFunctions()
    @createAiFixErrorFunctions?()



    advanced = document.getElementById("advanced-create-project-options-button")
    @setAction "create-project-button",()=>
      @show "create-project-overlay"
      @focus "create-project-title"
      document.getElementById("createprojectoption-type").value = "app"
      document.getElementById("createprojectoption-language").value = window.ms_default_project_language or "microscript_v2"
      document.getElementById("createprojectoption-graphics").value = "M1"
      document.getElementById("createprojectoption-networking").checked = false
      document.getElementById("create-project-option-lib-matterjs").checked = false
      document.getElementById("create-project-option-lib-cannonjs").checked = false
      @hideAdvanced()

    @hideAdvanced = ()=>
      advanced.classList.remove "open"
      document.getElementById("advanced-create-project-options").style.display = "none"
      advanced.childNodes[1].innerText = @app.translator.get "Advanced"

    advanced.addEventListener "click",()=>
      if advanced.classList.contains "open"
        @hideAdvanced()
      else
        advanced.classList.add "open"
        document.getElementById("advanced-create-project-options").style.display = "block"
        advanced.childNodes[1].innerText = @app.translator.get "Hide advanced options"

    @setAction "import-project-button",()=>
      input = document.createElement "input"
      input.type = "file"
      input.accept = "application/zip"
      input.addEventListener "change",(event)=>
        files = event.target.files
        if files.length>=1
          f = files[0]
          @app.importProject f

      input.click()

    @setAction "home-action-explore",()=>
      @setMainSection("explore")

    @setAction "home-action-create",()=>
      @setMainSection("projects")

    document.getElementById("create-project-overlay").addEventListener "mousedown",(event)=>
      if event.target != document.getElementById("create-project-overlay")
        return true

      b = document.getElementById("create-project-window").getBoundingClientRect()
      if event.clientX < b.x or event.clientX > b.x+b.width or event.clientY < b.y or event.clientY > b.y+b.height
        @hide "create-project-overlay"
      true

    @setAction "create-project-submit",()=>
      title = @get("create-project-title").value
      slug = RegexLib.slugify(title)
      if title.length > 0 and slug.length > 0
        libs = []
        if document.getElementById("create-project-option-lib-matterjs").checked
          libs.push "matterjs"
        if document.getElementById("create-project-option-lib-cannonjs").checked
          libs.push "cannonjs"

        @app.createProject title,slug,
          type: document.getElementById("createprojectoption-type").value
          language: document.getElementById("createprojectoption-language").value
          graphics: document.getElementById("createprojectoption-graphics").value
          networking: document.getElementById("createprojectoption-networking").checked
          libs: libs

        @hide "create-project-overlay"
        @get("create-project-title").value = ""

    @doc_splitbar = new SplitBar("doc-section","horizontal")
    @doc_splitbar.auto = 1
    @code_splitbar = new SplitBar("code-section","horizontal")
    @code_splitbar.auto = 1
    @runtime_splitbar = new SplitBar("runtime-container","vertical")
    @runtime_splitbar.auto = 1.5
    @runtime_splitbar.initPosition(67)
    @server_splitbar = new SplitBar "runtime-terminal","horizontal"
    @server_splitbar.initPosition(50)
    @server_splitbar.closed1 = true
    
    @debug_splitbar = new SplitBar("terminal-debug-container","horizontal")
    @debug_splitbar.closed2 = true
    @debug_splitbar.splitbar_size = 12

    @setAction "backtoprojects",()=>
      if @app.project?
        @app.project.savePendingChanges ()=>
          @backToProjectList(true)
      else
        @backToProjectList(true)

    @get("create_nick").addEventListener "input",()=>
      value = @get("create_nick").value
      if value != RegexLib.fixNick(value)
        @get("create_nick").value = RegexLib.fixNick(value)

    @startSaveStatus()

    @last_activity = Date.now()

    document.addEventListener "mousemove",()=>
      @last_activity = Date.now()

    document.addEventListener "keydown",()=>
      @last_activity = Date.now()

    document.querySelector("#projects-search input").addEventListener "input",()=>
      search = document.querySelector("#projects-search input").value.toLowerCase()
      list = document.getElementById("project-list").childNodes
      if search.trim().length>0
        for p in list
          continue if not p.dataset.title?
          ok = p.dataset.title.toLowerCase().indexOf(search)>=0
          ok |= p.dataset.description.toLowerCase().indexOf(search)>=0
          ok |= p.dataset.tags.toLowerCase().indexOf(search)>=0
          ok |= p.dataset.public and "public".indexOf(search)>=0
          if ok
            p.style.display = "inline-block"
          else
            p.style.display = "none"
      else
        for p in list
          p.style.display = "inline-block"

    document.querySelector("#home-section").addEventListener "scroll",()=>
      scroll = Math.min(60,document.querySelector("#home-section").scrollTop)
      document.querySelector("#home-header-background").style.height = "#{scroll}px"
      #document.querySelector("#home-section .part1").style["padding-top"] = "#{160-scroll}px"


    document.getElementById("myprojects").addEventListener "dragover",(event)=>
      event.preventDefault()

    document.getElementById("myprojects").addEventListener "drop",(event)=>
      event.preventDefault()
      if event.dataTransfer.items and event.dataTransfer.items[0]?
        @app.importProject(event.dataTransfer.items[0].getAsFile())

    @createFullscreenFeatures()
    @createProjectSideBarCollapse()   

    setInterval (()=>@checkActivity()),10000

    @reboot_date = 1689163200000
    @checkRebootMessage()

  checkRebootMessage:()->
    if @reboot_date and Date.now()<@reboot_date+1000*60*2
      document.querySelector(".main-container").style.top = "100px"
      div = document.createElement "div"
      div.classList.add "meta-message"
      funk = ()=>
        minutes = Math.max(0,@reboot_date-Date.now())/60000
        if minutes>=120
          hours = Math.floor(minutes/60)
          div.innerHTML = "<i class='fas fa-info-circle'></i> "+@app.translator.get("microStudio will be down for server migration on %DATE% at %TIME%. Downtime will last a few minutes.").replace("%DATE%",new Date(@reboot_date).toLocaleDateString()).replace("%TIME%",new Date(@reboot_date).toLocaleTimeString())
        else if minutes>=2
          minutes = Math.floor(minutes)
          div.innerHTML = "<i class='fas fa-exclamation-circle'></i> "+@app.translator.get("Downtime will start in %MINUTES% minutes").replace("%MINUTES%",minutes)
        else
          div.innerHTML = "<i class='fas fa-exclamation-circle'></i> "+@app.translator.get("Downtime will start immediately")

      funk()
      setInterval (()=>funk()),30000
      document.body.appendChild div

  addWarningMessage:(text,icon="fa-exclamation-circle",id,dismissable)->
    if dismissable and id
      if localStorage.getItem(id)
        return

    div = document.createElement "div"
    div.classList.add "meta-message"

    span = document.createElement "span"
    span.innerHTML = "<i class='fas #{icon}'></i> #{text}"

    if dismissable
      close = document.createElement "i"
      close.classList.add "fa"
      close.classList.add "fa-times"

      close.addEventListener "click",()=>
        @removeWarningMessage div
        if id
          localStorage.setItem(id,true)

      div.appendChild close

    div.appendChild span

    @warning_messages.push div
    document.querySelector(".main-container").style.top = "#{60+40*@warning_messages.length}px"
    document.body.appendChild div
    @layoutWarningMessages()

  layoutWarningMessages:()->
    for w,i in @warning_messages
      w.style.top = "#{60+i*40}px"

  removeWarningMessage:(div)->
    if document.body.contains div
      document.body.removeChild div
      index = @warning_messages.indexOf div
      if index>=0
        @warning_messages.splice index,1
        document.querySelector(".main-container").style.top = "#{60+40*@warning_messages.length}px"
        @layoutWarningMessages()

  checkActivity:()->
    t = Date.now()-@last_activity
    if @app.project?
      if t>60*60*1000
        @backToProjectList(true)
      else
        @app.client.sendRequest
          name: "ping"

  backToProjectList:(useraction)->
    @hide "projectview"
    @show "myprojects"
    @clearAiDraft()
    @app.runwindow.projectClosed()
    @app.debug.projectClosed()
    @app.tab_manager.projectClosed()
    @app.lib_manager.projectClosed()
    @app.project = null
    @project = null
    @app.updateProjectList()
    if useraction
      @app.app_state.pushState "projects","/projects/"
    if document.fullscreenElement
      document.exitFullscreen()


  setSection:(section,useraction)->
    if @makeProjectSideBarVisible? then @makeProjectSideBarVisible()
    @current_section = section

    for s in @sections
      do (s)=>
        element = document.getElementById("#{s}-section")
        menuitem = document.getElementById("menuitem-#{s}")
        return if not element? or not menuitem?
        if s == section
          element.style.display = "block"
          menuitem.classList.add "selected"
          if s == "tabs"
            @app.tab_manager.tabOpened()
        else
          element.style.display = "none"
          menuitem.classList.remove "selected"

        return

    menuitem = document.getElementById("menuitem-#{section}")
    if menuitem?
      menuitem.classList.add "selected"

    list = document.querySelectorAll ".menuitem-plugin"
    for item in list
      if item.id != "menuitem-#{section}"
        item.classList.remove "selected"

    @app.tab_manager.setTabView section

    if section == "sprites"
      @app.sprite_editor.spriteview.windowResized()

    if section == "code"
      @code_splitbar.update()
      @server_splitbar.update()
      @debug_splitbar.update()
      @runtime_splitbar.update()
      @app.runwindow.windowResized()
      @app.editor.editor.resize()
      @app.editor.update()

    if section == "sprites"
      @app.sprite_editor.update()

    if section == "maps"
      @app.map_editor.update()

    if section == "doc"
      @doc_splitbar.update()
      @app.doc_editor.editor.resize()
      @app.doc_editor.checkTutorial()

    if section == "sounds"
      @app.sound_editor.update()

    if section == "music"
      @app.music_editor.update()

    if section == "assets"
      @app.assets_manager.update()

    if section == "sync"
      @app.sync.update()

    if section == "options"
      @app.options.update()

    app.editor.editor.setReadOnly section != "code"
    app.doc_editor.editor.setReadOnly section != "doc"

    if useraction and @app.project?
      @app.app_state.pushState "project.#{@app.project.slug}.#{section}","/projects/#{@app.project.slug}/#{section}/"

    @app.runwindow.hideAll()

  accountRequired:(callback)->
    @logged_callback = callback

    @setDisplay "login-overlay","block"
    @hide "login-panel"
    @hide "create-account-panel"
    @hide "forgot-password-panel"
    @show "guest-panel"

  setMainSection:(section,useraction=false)->
    if section == "projects" and not @app.user?
      @accountRequired()
      return

    if useraction
      if section == "home"
        @app.app_state.pushState "home",if @app.translator.lang == "fr" then "/fr" else "/"
      else if section == "projects" and @project? and @current_section?
        @app.app_state.pushState "project.#{@project.slug}.#{@current_section}","/projects/#{@project.slug}/#{@current_section}/"
      else if section == "explore" and @app.explore.project
        p = @app.explore.project
        @app.app_state.pushState "project_details","/i/#{p.owner}/#{p.slug}/",{project: p}
      else
        name = {"help":"documentation"}[section] || section
        if name == "documentation"
          @app.documentation.pushState()
        else if name == "tutorials"
          @app.tutorials.tutorials_page.pushState()
        else
          @app.app_state.pushState name,"/#{name}/"

    for s in @menuoptions
      do (s)=>
        element = document.getElementById("#{s}-section")
        menuitem = document.getElementById("menu-#{s}")
        if s == section
          element.style.display = "block"
          menuitem.classList.add "selected" if menuitem?
        else
          element.style.display = "none"
          menuitem.classList.remove "selected" if menuitem?

    if section == "projects" and not @app.project?
      @hide "projectview"
      @show "myprojects"

    if section == "projects"
      @code_splitbar.update()
      @server_splitbar.update()
      @debug_splitbar.update()
      @runtime_splitbar.update()
      @app.runwindow.windowResized()

    if section == "explore"
      @app.explore.update()
    else
      @app.explore.closed()

    if section == "help"
      @app.documentation.updateViewPos()

    if section == "about"
      @app.about.setSection("about")

    if section == "tutorials"
      @app.tutorials.load()

    #@app.explore.closeDetails() if section != "explore"
    @app.runwindow.hideAll()
    return

  createAiGeneratorFunctions:()->
    @aiDraft = null
    @aiDraftByPath = {}
    @aiDraftPreviewByPath = {}
    @aiDraftImageById = {}
    @aiSelectedPath = null
    @aiBusy = false
    @aiProviderProfiles = []
    @aiAdminProviders = []
    @aiProviderAdminOpen = false
    @aiProviderDraftId = null
    @aiRequestAbortController = null

    @setAction "ai-generator-generate",()=>
      @generateAiDraft()

    @setAction "ai-generator-regenerate",()=>
      @regenerateAiDraft()

    @setAction "ai-generator-explain",()=>
      @explainAiDraft()

    @setAction "ai-generator-export-json",()=>
      @exportAiDraftJson()

    @setAction "ai-generator-apply",()=>
      @applyAiDraft "apply_to_current_project"

    @setAction "ai-generator-create-new",()=>
      @applyAiDraft "new_project"

    @setAction "ai-generator-cancel",()=>
      @cancelAiRequest()

    @setAction "ai-generator-improve",()=>
      @improveAiIdeaPrompt()

    @setAction "ai-provider-admin-button",()=>
      @toggleAiProviderAdminPanel()

    @setAction "ai-provider-admin-refresh",()=>
      @loadAiAdminProviders()

    @setAction "ai-provider-save",()=>
      @saveAiProvider()

    @setAction "ai-provider-new",()=>
      @showAiProviderEditor null

    @setAction "ai-provider-cancel",()=>
      @showAiProviderEditor null

    fileTree = @get("ai-generator-file-tree")
    fileTree.addEventListener "click",(event)=>
      target = event.target
      while target? and target != fileTree and not target.classList.contains("ai-file-item")
        target = target.parentNode
      if target? and target.classList.contains("ai-file-item")
        @selectAiDraftFile target.dataset.path

    assetGallery = @get("ai-generator-asset-gallery")
    assetGallery.addEventListener "click",(event)=>
      target = event.target
      while target? and target != assetGallery and not target.classList.contains("ai-asset-card")
        target = target.parentNode
      if not target? or not target.classList.contains("ai-asset-card")
        return
      assetId = target.dataset.assetId
      action = null
      if event.target? and event.target.dataset?
        action = event.target.dataset.action
      if action?
        @handleAiAssetAction action,assetId
      else if assetId?
        @selectAiDraftAsset assetId

    adminList = @get("ai-provider-admin-list")
    adminList.addEventListener "click",(event)=>
      target = event.target
      while target? and target != adminList and not target.dataset?.action?
        target = target.parentNode
      return if not target? or not target.dataset?.action?
      providerId = target.dataset.providerId
      switch target.dataset.action
        when "edit-provider"
          @showAiProviderEditor @findAiProviderAdminProfile(providerId)
        when "test-provider"
          @testAiProvider providerId
        when "delete-provider"
          @deleteAiProvider providerId
        when "set-default-provider"
          @setDefaultAiProvider providerId

    @get("ai-generator-target-mode").addEventListener "change",()=>
      @updateAiGeneratorButtons()
    @get("ai-generator-generate-images").addEventListener "change",()=>
      @updateAiGeneratorButtons()
    @get("ai-generator-image-style").addEventListener "change",()=>
      @updateAiGeneratorButtons()
    @get("ai-generator-transparent-sprites").addEventListener "change",()=>
      @updateAiGeneratorButtons()
    @get("ai-generator-asset-resolution").addEventListener "change",()=>
      @updateAiGeneratorButtons()
    @get("ai-generator-image-provider").addEventListener "change",()=>
      @updateAiGeneratorButtons()
    @get("ai-generator-provider").addEventListener "change",()=>
      @updateAiGeneratorButtons()

    for id in [
      "ai-generator-idea"
      "ai-generator-language"
      "ai-generator-physics"
      "ai-generator-difficulty"
      "ai-generator-art-style"
      "ai-generator-image-style"
      "ai-generator-aspect-ratio"
    ]
      do (id)=>
        @get(id).addEventListener "input",()=>
          @updateAiGeneratorButtons()
        @get(id).addEventListener "change",()=>
          @updateAiGeneratorButtons()

    @updateAiProviderVisibility()
    @loadAiProviders()
    @updateAiProviderAdminVisibility()
    @renderAiDraft null

  createAiFixErrorFunctions:()->
    @fixErrorState = "idle"
    @fixErrorProposal = null
    @fixErrorContext = null
    @fixErrorLatestError = null
    @fixErrorConsoleVisible = false
    @fixErrorRequestToken = 0

    @setAction "fix-error-button",()=> @openFixErrorDialog()
    @setAction "console-fix-error-button",()=> @openFixErrorDialog()
    @setAction "fix-error-analyze",()=> @requestFixErrorAnalysis false
    @setAction "fix-error-regenerate",()=> @requestFixErrorAnalysis true
    @setAction "fix-error-apply",()=> @applyFixError()
    @setAction "fix-error-copy",()=> @copyFixErrorPatch()
    @setAction "fix-error-close",()=> @hideFixErrorDialog()
    @setAction "fix-error-cancel",()=> @hideFixErrorDialog()

    overlay = @get "fix-error-overlay"
    if overlay?
      overlay.addEventListener "mousedown",(event)=>
        @hideFixErrorDialog() if event.target == overlay

    if @get("fix-error-intent")?
      @get("fix-error-intent").addEventListener "input",()=> @updateFixErrorButtons()
    if @get("fix-error-include-nearby")?
      @get("fix-error-include-nearby").addEventListener "change",()=> @updateFixErrorButtons()
    if @get("fix-error-prefer-minimal")?
      @get("fix-error-prefer-minimal").addEventListener "change",()=> @updateFixErrorButtons()
    @updateFixErrorButtons()
    @setFixErrorState "idle",""

  clearFixError:()->
    @fixErrorState = "idle"
    @fixErrorProposal = null
    @fixErrorContext = null
    @fixErrorLatestError = null
    @fixErrorConsoleVisible = false
    @fixErrorRequestToken += 1
    @hide "fix-error-overlay"
    @renderFixErrorContext null
    @renderFixErrorProposal null
    @setFixErrorState "idle",""
    @setFixErrorConsoleVisible false
    @updateFixErrorButtons()

  setFixErrorConsoleVisible:(visible)->
    @fixErrorConsoleVisible = !!visible
    button = @get "console-fix-error-button"
    if button?
      button.style.display = if visible then "inline-flex" else "none"
    @fixErrorConsoleVisible

  setFixErrorLatestError:(error)->
    if not error?
      @fixErrorLatestError = null
      @setFixErrorConsoleVisible false
      @updateFixErrorButtons()
      return

    @fixErrorLatestError = JSON.parse(JSON.stringify(error))
    @setFixErrorConsoleVisible true
    @updateFixErrorButtons()

  getFixErrorContext:()->
    project = @app.project
    editor = @app.editor?.editor
    selectedSource = @app.editor?.selected_source
    filePath = if selectedSource? then "ms/#{selectedSource}.ms" else null
    currentFileContent = if editor? then editor.getValue() else ""
    selectedCode = if editor? then editor.getSelectedText() else ""
    row = 0
    column = 0
    if editor? and typeof editor.getCursorPosition == "function"
      cursor = editor.getCursorPosition()
      row = cursor.row or 0
      column = cursor.column or 0
    lines = String(currentFileContent or "").split /\r?\n/
    contextRadius = 18
    beforeCursor = lines.slice(Math.max(0,row-contextRadius),row+1).join "\n"
    afterCursor = lines.slice(row,Math.min(lines.length,row+contextRadius+1)).join "\n"
    enabledLibraries = []
    enabledLibraries.push.apply enabledLibraries, project.libs if Array.isArray(project?.libs)
    enabledLibraries.push.apply enabledLibraries, project.libraries if Array.isArray(project?.libraries)
    uniqueLibraries = []
    for lib in enabledLibraries
      uniqueLibraries.push lib if typeof lib == "string" and lib.length > 0 and uniqueLibraries.indexOf(lib) < 0
    {
      projectId: project?.id or null
      filePath: filePath
      language: project?.language or "microscript_v2"
      enabledLibraries: uniqueLibraries
      currentFileContent: currentFileContent
      selectedCode: selectedCode
      beforeCursor: beforeCursor
      afterCursor: afterCursor
      cursor:
        row: row
        column: column
      error: if @fixErrorLatestError? then JSON.parse(JSON.stringify(@fixErrorLatestError)) else null
    }

  openFixErrorDialog:()->
    return if not @app.project?
    @setSection "code",false if @current_section != "code"
    @fixErrorContext = @getFixErrorContext()
    @show "fix-error-overlay"
    @renderFixErrorContext @fixErrorContext
    @renderFixErrorProposal null
    hasStructuredError = @fixErrorContext?.error? and ((@fixErrorContext.error.message? and @fixErrorContext.error.message.length > 0) or (@fixErrorContext.error.stack? and @fixErrorContext.error.stack.length > 0))
    @setFixErrorState "idle", if hasStructuredError then @app.translator.get("Review the error text and click Analyze & Fix.") else @app.translator.get("Paste or type the error text, then click Analyze & Fix.")
    @updateFixErrorButtons()

  hideFixErrorDialog:()->
    @fixErrorRequestToken += 1
    @hide "fix-error-overlay"
    @updateFixErrorButtons()

  renderFixErrorContext:(context)->
    path = @get "fix-error-file-path"
    currentFile = @get "fix-error-current-file"
    selectedCode = @get "fix-error-selected-code"
    errorText = @get "fix-error-error"
    path.value = context?.filePath or "" if path?
    currentFile.value = context?.currentFileContent or "" if currentFile?
    selectedCode.value = if context?.selectedCode? and context.selectedCode.length > 0 then context.selectedCode else "" if selectedCode?
    if errorText?
      errorText.value = if context?.error? then @formatFixErrorMessage context.error else ""
    element = @get "fix-error-state-description"
    if element?
      if context?.error?.message? and context.error.message.length > 0
        element.textContent = context.error.message
      else
        element.textContent = @app.translator.get "No structured runtime error was captured yet."
    element = @get "fix-error-language"
    element.textContent = context?.language or "" if element?
    element = @get "fix-error-libraries"
    if element?
      element.textContent = if context? and Array.isArray(context.enabledLibraries) and context.enabledLibraries.length > 0 then context.enabledLibraries.join(", ") else @app.translator.get("None")
    @updateFixErrorButtons()

  formatFixErrorMessage:(error)->
    return "" if not error?
    lines = []
    lines.push String(error.message) if error.message? and error.message.length > 0
    lines.push "File: #{error.file}" if error.file? and error.file.length > 0
    if error.line?
      lines.push "Line: #{error.line}#{if error.column? then ", column #{error.column}" else ""}"
    lines.push "Type: #{error.type}" if error.type? and error.type.length > 0
    if error.stack? and error.stack.length > 0
      lines.push ""
      lines.push error.stack
    lines.join "\n"

  buildFixErrorRequest:(regenerate=false)->
    context = @fixErrorContext or @getFixErrorContext()
    intent = if @get("fix-error-intent")? then @get("fix-error-intent").value.trim() else ""
    errorText = if @get("fix-error-error")? then @get("fix-error-error").value.trim() else ""
    options =
      includeNearbyFiles: @get("fix-error-include-nearby")?.checked or false
      preferMinimalPatch: if @get("fix-error-prefer-minimal")? then @get("fix-error-prefer-minimal").checked else true
      allowMultiFileFix: false
    proposalId = if regenerate and @fixErrorProposal? then @fixErrorProposal.proposalId else null
    {
      projectId: context.projectId
      filePath: context.filePath
      language: context.language
      enabledLibraries: context.enabledLibraries
      currentFileContent: context.currentFileContent
      selectedCode: context.selectedCode
      beforeCursor: context.beforeCursor
      afterCursor: context.afterCursor
      error: context.error
      errorText: errorText
      userIntent: intent
      options: options
      proposalId: proposalId
    }

  requestFixErrorAnalysis:(regenerate=false)->
    return Promise.resolve(null) if @fixErrorState in ["requesting","applying"]
    body = @buildFixErrorRequest regenerate
    @fixErrorContext = body
    requestToken = ++@fixErrorRequestToken
    @setFixErrorState "requesting", if regenerate then @app.translator.get("Regenerating fix proposal...") else @app.translator.get("Requesting AI fix proposal...")
    @updateFixErrorButtons()
    @requestJson("POST","/api/ai/fix-error",body).then (data)=>
      return null if requestToken != @fixErrorRequestToken
      @applyFixErrorProposal data
    , (err)=>
      return null if requestToken != @fixErrorRequestToken
      if err?.status == 409
        @renderFixErrorProposal null
        @setFixErrorState "conflict", err?.message or @app.translator.get("This file changed after the proposal was generated.")
      else if err?.status == 422
        @setFixErrorState "validation_rejected", err?.message or @app.translator.get("The AI proposal was rejected by validation.")
      else if err?.status == 429
        @setFixErrorState "validation_rejected", err?.message or @app.translator.get("Rate limited")
      else
        @setFixErrorState "validation_rejected", err?.message or @app.translator.get("Failed to generate a fix proposal.")
      @updateFixErrorButtons()
      null

  applyFixErrorProposal:(data)->
    proposal = data?.fix or null
    if not proposal?
      @setFixErrorState "validation_rejected", @app.translator.get("The AI response did not include a proposal.")
      @renderFixErrorProposal null
      return null

    @fixErrorProposal =
      proposalId: data?.proposalId or null
      provider: data?.provider or null
      fix: proposal

    @renderFixErrorProposal @fixErrorProposal
    if proposal.needsMoreContext
      summary = if Array.isArray(proposal.questions) and proposal.questions.length > 0 then proposal.questions.join(" ") else @app.translator.get("The AI needs more context before it can propose a safe fix.")
      @setFixErrorState "needs_more_context", summary
    else
      firstChange = if Array.isArray(proposal.changes) and proposal.changes.length > 0 then proposal.changes[0] else null
      if firstChange?
        diffText = @buildFixErrorPatchText firstChange.path, @fixErrorContext?.currentFileContent or "", firstChange.newContent, proposal
        @renderFixErrorDiff firstChange.path, @fixErrorContext?.currentFileContent or "", firstChange.newContent, proposal
        @get("fix-error-patch-text").value = diffText if @get("fix-error-patch-text")?
      @setFixErrorState "showing_proposal", proposal.summary or @app.translator.get("AI proposal ready")

    if @get("fix-error-status-message")?
      @get("fix-error-status-message").textContent = if data?.provider? then "#{data.provider.name or "AI"} / #{data.provider.modelId or ""}" else ""
    @updateFixErrorButtons()
    data

  renderFixErrorProposal:(record)->
    container = @get "fix-error-proposal-summary"
    diffContainer = @get "fix-error-diff"
    explanation = @get "fix-error-diagnosis"
    note = @get "fix-error-followup"
    questions = @get "fix-error-questions"
    warnings = @get "fix-error-warnings"
    container.textContent = "" if container?
    diffContainer.innerHTML = "" if diffContainer?
    explanation.textContent = "" if explanation?
    note.textContent = "" if note?
    questions.innerHTML = "" if questions?
    warnings.innerHTML = "" if warnings?
    return if not record?

    proposal = record.fix or {}
    @get("fix-error-summary").textContent = proposal.summary or "" if @get("fix-error-summary")?
    explanation.textContent = proposal.diagnosis?.rootCause or "" if explanation?
    if container?
      list = []
      list.push "#{@app.translator.get("Proposal")}: #{record.proposalId or ""}"
      if record.provider?
        list.push "#{@app.translator.get("Provider")}: #{record.provider.name or ""}#{if record.provider.modelId? then " / #{record.provider.modelId}" else ""}"
      if proposal.diagnosis?.errorType?
        list.push "#{@app.translator.get("Type")}: #{proposal.diagnosis.errorType}"
      container.textContent = list.filter((entry)-> entry? and entry.length > 0).join("  ")
    if Array.isArray(proposal.warnings) and proposal.warnings.length > 0 and warnings?
      for warning in proposal.warnings
        item = document.createElement "div"
        item.classList.add "fix-error-warning"
        item.textContent = warning
        warnings.appendChild item
    if proposal.needsMoreContext
      note.textContent = if Array.isArray(proposal.questions) and proposal.questions.length > 0 then proposal.questions.join(" ") else @app.translator.get("The AI needs more context.") if note?
      if questions? and Array.isArray(proposal.questions)
        for question in proposal.questions
          item = document.createElement "div"
          item.classList.add "fix-error-question"
          item.textContent = question
          questions.appendChild item
      return
    if Array.isArray(proposal.changes) and proposal.changes.length > 0
      change = proposal.changes[0]
      @renderFixErrorDiff change.path, @fixErrorContext?.currentFileContent or "", change.newContent, proposal if diffContainer?
      note.textContent = proposal.userExplanation or "" if note?
    else if note?
      note.textContent = @app.translator.get "No file change was returned."

  renderFixErrorDiff:(path,before,after,proposal)->
    container = @get "fix-error-diff"
    return if not container?
    container.innerHTML = ""
    lines = if typeof diff == "function" then diff(before or "", after or "") else []
    if not Array.isArray(lines) or lines.length == 0
      text = document.createElement "div"
      text.classList.add "fix-error-diff-empty"
      text.textContent = @app.translator.get "No diff available."
      container.appendChild text
      return
    beforeLine = 1
    afterLine = 1
    diffLines = document.createElement "div"
    diffLines.classList.add "fix-error-diff-lines"
    container.appendChild diffLines
    for segment in lines when segment? and Array.isArray(segment.data)
      for line in segment.data
        row = document.createElement "div"
        row.classList.add "fix-error-diff-row"
        row.classList.add "context" if segment.type == "="
        row.classList.add "removed" if segment.type == "-"
        row.classList.add "added" if segment.type == "+"
        row.innerHTML = "<span class='before'></span><span class='after'></span><span class='text'></span>"
        if segment.type == "="
          row.childNodes[0].textContent = "#{beforeLine++}"
          row.childNodes[1].textContent = "#{afterLine++}"
        else if segment.type == "-"
          row.childNodes[0].textContent = "#{beforeLine++}"
        else if segment.type == "+"
          row.childNodes[1].textContent = "#{afterLine++}"
        row.childNodes[2].textContent = line
        diffLines.appendChild row
    container

  buildFixErrorPatchText:(path,before,after,proposal)->
    out = []
    out.push "# #{proposal.summary}" if proposal?.summary? and proposal.summary.length > 0
    out.push "--- #{path}"
    out.push "+++ #{path}"
    diffLines = if typeof diff == "function" then diff(before or "", after or "") else []
    for segment in diffLines when segment? and Array.isArray(segment.data)
      for line in segment.data
        if segment.type == "="
          out.push " #{line}"
        else if segment.type == "-"
          out.push "-#{line}"
        else if segment.type == "+"
          out.push "+#{line}"
    out.join "\n"

  copyFixErrorPatch:()->
    proposal = @fixErrorProposal
    return if not proposal? or not proposal.fix? or not Array.isArray(proposal.fix.changes) or proposal.fix.changes.length == 0
    text = @buildFixErrorPatchText proposal.fix.changes[0].path, @fixErrorContext?.currentFileContent or "", proposal.fix.changes[0].newContent, proposal.fix
    if navigator.clipboard? and typeof navigator.clipboard.writeText == "function"
      navigator.clipboard.writeText(text).then => @showNotification @app.translator.get("Patch copied to clipboard")
    else
      element = document.createElement "textarea"
      element.value = text
      element.style.position = "fixed"
      element.style.left = "-1000px"
      element.style.top = "-1000px"
      document.body.appendChild element
      element.select()
      document.execCommand "copy"
      document.body.removeChild element
      @showNotification @app.translator.get("Patch copied to clipboard")

  applyFixError:()->
    proposal = @fixErrorProposal
    return Promise.resolve(null) if not proposal? or not proposal.fix? or proposal.proposalId == null
    if proposal.fix.needsMoreContext
      @setFixErrorState "needs_more_context", @app.translator.get("More context is required before applying this fix.")
      return Promise.resolve null
    if not Array.isArray(proposal.fix.changes) or proposal.fix.changes.length == 0
      @setFixErrorState "validation_rejected", @app.translator.get("The proposal has no changes to apply.")
      return Promise.resolve null
    body =
      fixProposalId: proposal.proposalId
      acceptedChanges: proposal.fix.changes
    requestToken = ++@fixErrorRequestToken
    @setFixErrorState "applying", @app.translator.get("Applying approved change...")
    @updateFixErrorButtons()
    @requestJson("POST","/api/ai/fix-error/apply",body).then (data)=>
      return null if requestToken != @fixErrorRequestToken
      @setFixErrorState "success", @app.translator.get("Fix applied successfully.")
      @updateFixErrorButtons()
      @showNotification @app.translator.get("AI fix applied")
      setTimeout (()=> @hideFixErrorDialog() if @fixErrorState == "success"),1200
    , (err)=>
      return null if requestToken != @fixErrorRequestToken
      if err?.status == 409
        @setFixErrorState "conflict", err?.message or @app.translator.get("The file changed before the proposal could be applied.")
      else if err?.status == 422
        @setFixErrorState "validation_rejected", err?.message or @app.translator.get("The proposal was rejected by validation.")
      else
        @setFixErrorState "validation_rejected", err?.message or @app.translator.get("Failed to apply the fix.")
      @updateFixErrorButtons()
      null

  setFixErrorState:(state,message="")->
    @fixErrorState = state
    @fixErrorStateMessage = message or ""
    element = @get "fix-error-state"
    if element?
      element.textContent = @app.translator.get({
        idle: "Idle"
        collecting: "Collecting"
        requesting: "Requesting"
        showing_proposal: "Proposal ready"
        needs_more_context: "Needs more context"
        validation_rejected: "Validation rejected"
        conflict: "Conflict"
        applying: "Applying"
        success: "Success"
      }[state] or state.replace /_/g," ")
    @get("fix-error-status").textContent = message or "" if @get("fix-error-status")?
    @updateFixErrorButtons()

  updateFixErrorButtons:()->
    hasProposal = @fixErrorProposal? and @fixErrorProposal.fix?
    isBusy = @fixErrorState in ["collecting","requesting","applying"]
    canApply = hasProposal and not isBusy and not (@fixErrorProposal.fix?.needsMoreContext == true) and Array.isArray(@fixErrorProposal.fix.changes) and @fixErrorProposal.fix.changes.length > 0 and @fixErrorState != "validation_rejected" and @fixErrorState != "conflict"
    @get("fix-error-analyze").disabled = isBusy if @get("fix-error-analyze")?
    @get("fix-error-regenerate").disabled = not (hasProposal and not isBusy) if @get("fix-error-regenerate")?
    @get("fix-error-apply").disabled = not canApply if @get("fix-error-apply")?
    @get("fix-error-copy").disabled = not (hasProposal and not isBusy) if @get("fix-error-copy")?
    @get("fix-error-intent").disabled = isBusy if @get("fix-error-intent")?
    @get("fix-error-include-nearby").disabled = isBusy if @get("fix-error-include-nearby")?
    @get("fix-error-prefer-minimal").disabled = isBusy if @get("fix-error-prefer-minimal")?
    @fixErrorState

  clearAiDraft:()->
    @aiDraft = null
    @aiDraftByPath = {}
    @aiDraftPreviewByPath = {}
    @aiDraftImageById = {}
    @aiSelectedPath = null
    @setAiStatus ""
    @setAiWarnings []
    @renderAiSummary null
    @renderAiFileTree []
    @renderAiAssetGallery []
    @renderAiPreview null
    @setAiExplanation ""
    @updateAiGeneratorButtons()

  setAiStatus:(text,isError=false)->
    element = @get("ai-generator-status")
    return if not element?
    element.textContent = text or ""
    element.style.color = if isError then "#fecaca" else "rgba(191,219,254,.95)"

  setAiWarnings:(warnings)->
    container = @get("ai-generator-warnings")
    return if not container?
    container.innerHTML = ""
    return if not warnings? or warnings.length == 0
    for warning in warnings
      item = document.createElement "div"
      item.classList.add "warning"
      item.textContent = warning
      container.appendChild item

  setAiExplanation:(text)->
    element = @get("ai-generator-explanation-text")
    return if not element?
    element.textContent = text or ""

  loadAiProviders:(selectedId=null)->
    select = @get("ai-generator-provider")
    return Promise.resolve([]) if not select?
    fetch "/api/ai/providers/public?purpose=text",
      credentials: "same-origin"
    .then (response)=>
      response.text().then (text)=>
        data = null
        if text? and text.length > 0
          try
            data = JSON.parse text
          catch error
            data =
              error: text
        if not response.ok
          err = new Error((if data? then data.error else null) or response.statusText or "Request failed")
          err.response = data
          err.status = response.status
          throw err
        providers = if Array.isArray(data?.providers) then data.providers else []
        @aiProviderProfiles = providers
        wanted = if selectedId? then "#{selectedId}" else select.value
        select.innerHTML = ""
        select.appendChild new Option "Use server default",""
        for provider in providers
          label = provider.name + (if provider.modelId? and provider.modelId.length > 0 then " (#{provider.modelId})" else "")
          select.appendChild new Option label,"#{provider.id}"
        if wanted
          select.value = wanted
        else
          defaultProvider = null
          for provider in providers
            if provider.isDefault
              defaultProvider = provider
              break
          select.value = if defaultProvider? then "#{defaultProvider.id}" else ""
        providers
    ,(err)=>
      @aiProviderProfiles = []
      select.innerHTML = ""
      select.appendChild new Option "Use server default",""
      return []

  requestJson:(method,url,payload=null)->
    options =
      method: method
      credentials: "same-origin"
      headers:
        "Content-Type": "application/json"
    if payload?
      options.body = JSON.stringify payload
    fetch url,options
    .then (response)=>
      response.text().then (text)=>
        data = null
        if text? and text.length > 0
          try
            data = JSON.parse text
          catch error
            data =
              error: text
        if not response.ok
          err = new Error((if data? then data.error else null) or response.statusText or "Request failed")
          err.response = data
          throw err
        data

  updateAiProviderAdminVisibility:()->
    button = @get("ai-provider-admin-button")
    panel = @get("ai-provider-admin-panel")
    isAdmin = @app.user? and @app.user.flags? and @app.user.flags.admin
    if button?
      button.classList.toggle "hidden", not isAdmin
    if not panel?
      return
    if not isAdmin
      @aiProviderAdminOpen = false
      panel.classList.add "hidden"
      @updateAiProviderAdminNote()
      return
    panel.classList.toggle "hidden", not @aiProviderAdminOpen
    @updateAiProviderAdminNote()

  toggleAiProviderAdminPanel:()->
    return if not (@app.user? and @app.user.flags? and @app.user.flags.admin)
    @aiProviderAdminOpen = not @aiProviderAdminOpen
    @updateAiProviderAdminVisibility()
    if @aiProviderAdminOpen
      @loadAiAdminProviders(@aiProviderDraftId)

  setAiProviderAdminStatus:(text,isError=false)->
    element = @get("ai-provider-admin-status")
    return if not element?
    element.textContent = text or ""
    element.style.color = if isError then "#fecaca" else "rgba(191,219,254,.95)"

  findAiProviderAdminProfile:(providerId)->
    for provider in @aiAdminProviders or []
      if "#{provider.id}" == "#{providerId}"
        return provider
    null

  showAiProviderEditor:(provider)->
    @aiProviderDraftId = if provider? then "#{provider.id}" else null
    @get("ai-provider-name").value = if provider? then provider.name or "" else ""
    @get("ai-provider-type").value = if provider? then provider.type or "openai-compatible" else "openai-compatible"
    @get("ai-provider-purpose").value = if provider? then provider.purpose or "text" else "text"
    @get("ai-provider-base-url").value = if provider? then provider.baseUrl or "" else ""
    @get("ai-provider-model-id").value = if provider? then provider.modelId or "" else ""
    @get("ai-provider-system-prompt").value = if provider? then provider.systemPrompt or "" else ""
    @get("ai-provider-api-key").value = ""
    @get("ai-provider-temperature").value = if provider? and provider.temperature? then "#{provider.temperature}" else "0.3"
    @get("ai-provider-max-tokens").value = if provider? and provider.maxTokens? then "#{provider.maxTokens}" else "4000"
    @get("ai-provider-timeout-ms").value = if provider? and provider.timeoutMs? then "#{provider.timeoutMs}" else "60000"
    @get("ai-provider-enabled").checked = if provider? then provider.enabled != false else true
    @get("ai-provider-default").checked = if provider? then provider.isDefault == true else false
    @setAiProviderAdminStatus if provider? then "Editing provider #{provider.id}" else "Creating new provider"
    @renderAiProviderAdminList @aiAdminProviders or []
    @updateAiProviderAdminNote()

  updateAiProviderAdminNote:()->
    note = @get("ai-provider-admin-note")
    return if not note?
    isLocalMode = window.ms_realm? and window.ms_realm != "production"
    note.textContent = "Keys are stored in plaintext in local mode."
    note.classList.toggle "hidden", not isLocalMode

  collectAiProviderPayload:()->
    payload =
      name: @get("ai-provider-name").value.trim()
      type: @get("ai-provider-type").value
      purpose: @get("ai-provider-purpose").value
      baseUrl: @get("ai-provider-base-url").value.trim()
      modelId: @get("ai-provider-model-id").value.trim()
      systemPrompt: @get("ai-provider-system-prompt").value
      temperature: parseFloat(@get("ai-provider-temperature").value or "0.3")
      maxTokens: parseInt(@get("ai-provider-max-tokens").value or "4000",10)
      timeoutMs: parseInt(@get("ai-provider-timeout-ms").value or "60000",10)
      enabled: @get("ai-provider-enabled").checked
      isDefault: @get("ai-provider-default").checked
    apiKey = @get("ai-provider-api-key").value.trim()
    if apiKey.length > 0
      payload.apiKey = apiKey
    else if not @aiProviderDraftId?
      payload.apiKey = ""
    payload

  renderAiProviderAdminList:(providers)->
    container = @get("ai-provider-admin-list")
    return if not container?
    container.innerHTML = ""
    selectedId = @aiProviderDraftId
    for provider in providers or []
      row = document.createElement "div"
      row.classList.add "ai-provider-row"
      row.classList.add "selected" if "#{provider.id}" == "#{selectedId}"
      meta = document.createElement "div"
      meta.classList.add "ai-provider-row-meta"
      meta.innerHTML = "<strong></strong><span></span><span></span><span></span><span></span>"
      meta.childNodes[0].textContent = "#{provider.name}#{if provider.isDefault then " (default)" else ""}"
      meta.childNodes[1].textContent = "#{provider.type} / #{provider.purpose} / #{provider.modelId or ""}"
      meta.childNodes[2].textContent = provider.baseUrl or ""
      meta.childNodes[3].textContent = if provider.enabled == false then "disabled" else if provider.hasApiKey then "key stored" else "no key"
      meta.childNodes[4].textContent = if provider.hasSystemPrompt then "custom system prompt" else "default prompt"
      actions = document.createElement "div"
      actions.classList.add "ai-provider-row-actions"
      for action in [
        ["Edit","edit-provider"]
        ["Test","test-provider"]
        ["Default","set-default-provider"]
        ["Delete","delete-provider"]
      ]
        button = document.createElement "button"
        button.textContent = action[0]
        button.dataset.action = action[1]
        button.dataset.providerId = "#{provider.id}"
        actions.appendChild button
      row.appendChild meta
      row.appendChild actions
      container.appendChild row

  loadAiAdminProviders:(selectedId=null)->
    return Promise.resolve([]) if not (@app.user? and @app.user.flags? and @app.user.flags.admin)
    @setAiProviderAdminStatus "Loading provider profiles..."
    @requestJson("GET","/api/admin/ai/providers?purpose=text").then((data)=>
      providers = if Array.isArray(data?.providers) then data.providers else []
      @aiAdminProviders = providers
      @renderAiProviderAdminList providers
      chosen = null
      if selectedId?
        chosen = @findAiProviderAdminProfile selectedId
      else if @aiProviderDraftId?
        chosen = @findAiProviderAdminProfile @aiProviderDraftId
      else if providers.length > 0
        chosen = providers[0]
      if chosen?
        @showAiProviderEditor chosen
      @setAiProviderAdminStatus "Loaded #{providers.length} provider profiles."
      providers
    ,(err)=>
      @aiAdminProviders = []
      @renderAiProviderAdminList []
      @setAiProviderAdminStatus err.message or "Failed to load provider profiles",true
      return []
    )

  saveAiProvider:()->
    return if not (@app.user? and @app.user.flags? and @app.user.flags.admin)
    payload = @collectAiProviderPayload()
    if not payload.name.length or not payload.baseUrl.length or not payload.modelId.length
      @setAiProviderAdminStatus "Name, base URL, and model ID are required.",true
      return
    if @aiProviderDraftId?
      url = "/api/admin/ai/providers/#{@aiProviderDraftId}"
      method = "PATCH"
    else
      url = "/api/admin/ai/providers"
      method = "POST"
    @setAiProviderAdminStatus "Saving provider..."
    @requestJson(method,url,payload).then((data)=>
      provider = data?.provider or null
      @setAiProviderAdminStatus "Provider saved."
      selected = if provider? then provider.id else @aiProviderDraftId
      @loadAiAdminProviders selected
      @loadAiProviders selected
      if provider?
        @showAiProviderEditor provider
    ,(err)=>
      @setAiProviderAdminStatus err.message or "Failed to save provider",true
    )

  deleteAiProvider:(providerId)->
    return if not providerId?
    if not confirm "Delete this provider profile?"
      return
    @setAiProviderAdminStatus "Deleting provider..."
    @requestJson("DELETE","/api/admin/ai/providers/#{providerId}").then((data)=>
      @setAiProviderAdminStatus "Provider deleted."
      wasSelected = "#{@aiProviderDraftId}" == "#{providerId}"
      @aiProviderDraftId = null if wasSelected
      @showAiProviderEditor null if wasSelected
      @loadAiAdminProviders()
      @loadAiProviders()
    ,(err)=>
      @setAiProviderAdminStatus err.message or "Failed to delete provider",true
    )

  testAiProvider:(providerId)->
    return if not providerId?
    @setAiProviderAdminStatus "Testing provider..."
    @requestJson("POST","/api/admin/ai/providers/#{providerId}/test",{}).then((data)=>
      @setAiProviderAdminStatus "Test ok: #{data.providerName or data.providerId}"
    ,(err)=>
      @setAiProviderAdminStatus err.message or "Provider test failed",true
    )

  setDefaultAiProvider:(providerId)->
    return if not providerId?
    @setAiProviderAdminStatus "Setting default provider..."
    @requestJson("POST","/api/admin/ai/providers/#{providerId}/set-default",{}).then((data)=>
      @setAiProviderAdminStatus "Default provider updated."
      @loadAiAdminProviders providerId
      @loadAiProviders providerId
    ,(err)=>
      @setAiProviderAdminStatus err.message or "Failed to set default provider",true
    )

  updateAiGeneratorButtons:()->
    draftReady = @aiDraft?
    targetMode = if @get("ai-generator-target-mode")? then @get("ai-generator-target-mode").value else "apply_to_current_project"
    ideaText = if @get("ai-generator-idea")? then @get("ai-generator-idea").value.trim() else ""
    generateImages = if @get("ai-generator-generate-images")? then @get("ai-generator-generate-images").checked else false
    canGenerate = not @aiBusy
    canRegenerate = draftReady and not @aiBusy
    canExplain = draftReady and not @aiBusy
    canApply = draftReady and not @aiBusy and targetMode == "apply_to_current_project"
    for id in [
      "ai-generator-improve"
      "ai-generator-generate"
      "ai-generator-regenerate"
      "ai-generator-apply"
      "ai-generator-create-new"
      "ai-generator-explain"
    ]
      element = @get(id)
      continue if not element?
      switch id
        when "ai-generator-improve"
          element.disabled = ideaText.length == 0
        when "ai-generator-generate"
          element.disabled = not canGenerate
        when "ai-generator-regenerate"
          element.disabled = not canRegenerate
        when "ai-generator-apply"
          element.disabled = not canApply
        when "ai-generator-create-new"
          element.disabled = not (draftReady and not @aiBusy)
        when "ai-generator-explain"
          element.disabled = not canExplain
    for id in [
      "ai-generator-image-style"
      "ai-generator-transparent-sprites"
      "ai-generator-asset-resolution"
      "ai-generator-image-provider"
      "ai-generator-provider"
      "ai-generator-generate-images"
    ]
      element = @get(id)
      continue if not element?
      element.disabled = @aiBusy
    if @get("ai-generator-generate-images")?.checked
      @get("ai-generator-asset-gallery").style.display = "grid"
    else
      @get("ai-generator-asset-gallery").style.display = if draftReady and @aiDraft?.imageAssets?.length > 0 then "grid" else "none"
    for button in document.querySelectorAll ".ai-asset-actions button"
      button.disabled = @aiBusy

  setAiBusy:(loading)->
    @aiBusy = loading
    if loading
      @setAiStatus "Working on the draft..."
    @updateAiGeneratorButtons()

  isAiAbortError:(err)->
    return err?.name == "AbortError" or err?.code == 20

  cancelAiRequest:(message="Generation cancelled.")->
    if @aiRequestAbortController?
      @aiRequestAbortController.abort()
      @aiRequestAbortController = null
      @setAiBusy false
      @setAiStatus message
    @setSection "code",true

  renderAiSummary:(draft)->
    container = @get("ai-generator-summary")
    return if not container?
    container.innerHTML = ""
    if not draft?
      @get("ai-generator-summary-empty").style.display = "block"
      return
    @get("ai-generator-summary-empty").style.display = "none"
    rows = [
      ["Title", if draft.project? then draft.project.title else ""]
      ["Slug", if draft.project? then draft.project.slug else ""]
      ["Physics", draft.resolvedPhysicsMode or ""]
      ["Provider", if draft.provider? then "#{draft.provider.name} / #{draft.provider.modelId}" else ""]
      ["Difficulty", if draft.project? then draft.project.difficulty else ""]
      ["Controls", if draft.gameDesign? then (draft.gameDesign.controls or []).join(", ") else ""]
      ["Genre", if draft.gameDesign? then draft.gameDesign.genre else ""]
      ["Core loop", if draft.gameDesign? then draft.gameDesign.coreLoop else ""]
      ["Win condition", if draft.gameDesign? then draft.gameDesign.winCondition else ""]
      ["Lose condition", if draft.gameDesign? then draft.gameDesign.loseCondition else ""]
      ["Files", "#{if draft.preview? then draft.preview.length else 0} prepared"]
    ]
    for row in rows
      el = document.createElement "div"
      el.classList.add "ai-summary-row"
      el.innerHTML = "<strong></strong><span></span>"
      el.childNodes[0].textContent = "#{row[0]}:"
      el.childNodes[1].textContent = " #{row[1] or ""}"
      container.appendChild el

  renderAiFileTree:(files)->
    container = @get("ai-generator-file-tree")
    return if not container?
    container.innerHTML = ""
    selectedPath = @aiSelectedPath
    for entry in files or []
      item = document.createElement "div"
      item.classList.add "ai-file-item"
      item.classList.add "selected" if entry.path == selectedPath
      item.dataset.path = entry.path
      label = document.createElement "span"
      label.classList.add "path"
      label.textContent = entry.path
      badge = document.createElement "span"
      badge.classList.add "badge"
      badge.textContent = entry.status or "create"
      item.appendChild label
      item.appendChild badge
      container.appendChild item

  renderAiAssetGallery:(assets)->
    container = @get("ai-generator-asset-gallery")
    return if not container?
    container.innerHTML = ""
    selectedPath = @aiSelectedPath
    for asset in assets or []
      previewSource = @aiDraftByPath[asset.filename] or @aiDraftPreviewByPath[asset.filename] or {}
      card = document.createElement "div"
      card.classList.add "ai-asset-card"
      card.classList.add "selected" if selectedPath? and (selectedPath == asset.filename or selectedPath == asset.path)
      card.dataset.assetId = asset.id
      image = document.createElement "img"
      image.classList.add "ai-asset-thumb"
      image.src = previewSource.previewDataUrl or asset.previewDataUrl or if previewSource.contentBase64? then "data:image/png;base64,#{previewSource.contentBase64}" else if asset.contentBase64? then "data:image/png;base64,#{asset.contentBase64}" else ""
      image.alt = asset.id
      meta = document.createElement "div"
      meta.classList.add "ai-asset-meta"
      meta.innerHTML = "<strong></strong><span></span><span></span>"
      meta.childNodes[0].textContent = asset.id
      meta.childNodes[1].textContent = asset.filename
      meta.childNodes[2].textContent = asset.prompt or ""
      actions = document.createElement "div"
      actions.classList.add "ai-asset-actions"
      acceptLabel = if asset.accepted then "Accepted" else "Accept asset"
      for action in [
        ["Regenerate this asset","regenerate-asset"]
        ["Edit prompt","edit-asset-prompt"]
        [acceptLabel,"accept-asset"]
        ["Replace asset","replace-asset"]
      ]
        button = document.createElement "button"
        button.textContent = action[0]
        button.dataset.action = action[1]
        button.dataset.assetId = asset.id
        button.classList.add "accepted" if asset.accepted and action[1] == "accept-asset"
        actions.appendChild button
      card.appendChild image
      card.appendChild meta
      card.appendChild actions
      container.appendChild card

  renderAiPreview:(file)->
    container = @get("ai-generator-file-preview")
    meta = @get("ai-generator-preview-file-name")
    return if not container? or not meta?
    container.innerHTML = ""
    meta.textContent = ""
    if not file?
      container.textContent = "Select a file to inspect its contents."
      return
    meta.textContent = "#{file.path}#{if file.status? then " (#{file.status})" else ""}"
    if file.status == "delete"
      container.textContent = "This file will be deleted."
      return
    if file.previewDataUrl? or file.type == "image"
      image = document.createElement "img"
      image.classList.add "ai-preview-image"
      image.src = file.previewDataUrl or "data:image/png;base64,#{file.contentBase64 or ""}"
      image.alt = file.path
      container.appendChild image
      if file.preview?
        preview = document.createElement "div"
        preview.style.marginTop = "10px"
        preview.style.color = "rgba(255,255,255,.75)"
        preview.textContent = file.preview
        container.appendChild preview
      return
    text = document.createElement "pre"
    text.style.margin = "0"
    text.style.whiteSpace = "pre-wrap"
    text.style.wordBreak = "break-word"
    text.textContent = if file.content? then "#{file.content}" else (file.preview or "")
    container.appendChild text

  renderAiDraft:(draft)->
    @aiDraft = draft
    @aiDraftByPath = {}
    @aiDraftPreviewByPath = {}
    @aiDraftImageById = {}
    @aiSelectedPath = null
    if not draft?
      @setAiStatus ""
      @setAiWarnings []
      @renderAiSummary null
      @renderAiFileTree []
      @renderAiAssetGallery []
      @renderAiPreview null
      @setAiExplanation ""
      @updateAiGeneratorButtons()
      return
    previewFiles = if draft.preview? then draft.preview else []
    for file in previewFiles
      @aiDraftPreviewByPath[file.path] = file
    if draft.files?
      for file in draft.files
        @aiDraftByPath[file.path] = file
    if draft.imageAssets?
      for asset in draft.imageAssets
        @aiDraftImageById[asset.id] = asset
    @aiSelectedPath = if previewFiles.length > 0 then previewFiles[0].path else null
    @renderAiSummary draft
    @setAiWarnings draft.warnings or []
    @setAiStatus "Ready: #{if draft.project? then draft.project.title else "generated draft"} (#{draft.resolvedPhysicsMode or "manual"} physics)."
    @renderAiFileTree previewFiles
    @renderAiAssetGallery draft.imageAssets or []
    @loadAiProviders if draft.request? then draft.request.providerProfileId else null
    selected = @selectAiDraftFile @aiSelectedPath,true
    if not selected and previewFiles.length > 0
      @renderAiPreview previewFiles[0]
    @setAiExplanation ""
    @updateAiGeneratorButtons()

  selectAiDraftFile:(path,silent=false)->
    return false if not path?
    @aiSelectedPath = path
    if not @aiDraftPreviewByPath[path]? and not @aiDraftByPath[path]?
      @renderAiPreview(null) if not silent
      return false
    file = Object.assign {},@aiDraftByPath[path] or {},@aiDraftPreviewByPath[path] or {}
    @renderAiFileTree(if @aiDraft? then @aiDraft.preview else [])
    @renderAiPreview file
    return true

  selectAiDraftAsset:(assetId)->
    return false if not assetId?
    asset = @aiDraftImageById[assetId]
    return false if not asset?
    @aiSelectedPath = asset.filename
    @renderAiAssetGallery @aiDraft?.imageAssets or []
    if @aiDraftByPath[asset.filename]? or @aiDraftPreviewByPath[asset.filename]?
      @renderAiPreview Object.assign {},@aiDraftByPath[asset.filename] or {},@aiDraftPreviewByPath[asset.filename] or {}
    else
      @renderAiPreview null
    true

  handleAiAssetAction:(action,assetId)->
    return if not assetId?
    asset = @aiDraftImageById[assetId]
    return if not asset?
    switch action
      when "edit-asset-prompt"
        newPrompt = window.prompt "Edit asset prompt", asset.prompt or ""
        return if newPrompt == null
        asset.prompt = newPrompt.trim()
        @renderAiDraft @aiDraft
      when "accept-asset"
        asset.accepted = not asset.accepted
        @renderAiDraft @aiDraft
      when "replace-asset"
        replacement = window.prompt "Replace asset prompt", asset.prompt or ""
        return if replacement == null
        asset.prompt = replacement.trim()
        @regenerateAiImageAsset asset.id,asset.prompt
      when "regenerate-asset"
        @regenerateAiImageAsset asset.id,asset.prompt

  regenerateAiImageAsset:(assetId,prompt)->
    return if not @aiDraft?
    payload =
      draftId: @aiDraft.id
      assetId: assetId
      prompt: prompt
      imageProvider: if @get("ai-generator-image-provider")? then @get("ai-generator-image-provider").value else "placeholder"
      imageStyle: @get("ai-generator-image-style").value
      assetResolution: @get("ai-generator-asset-resolution").value
      transparentBackground: @get("ai-generator-transparent-sprites").value == "true"
      accepted: true
    @setAiBusy true
    @setAiStatus "Regenerating asset..."
    @postAiRequest("/api/ai/regenerate-image",payload).then((draft)=>
      @setAiBusy false
      @renderAiDraft draft
    ,(err)=>
      return if @isAiAbortError(err)
      @setAiBusy false
      @setAiStatus(err.message or "Image regeneration failed", true)
      @setAiWarnings [err.message or "Image regeneration failed"]
    )

  getAiRequestPayload:()->
    idea = @get("ai-generator-idea").value.trim()
    targetMode = if @get("ai-generator-target-mode")? then @get("ai-generator-target-mode").value else "apply_to_current_project"
    currentProjectId = if @app.project? then @app.project.id else null
    idea: idea
    language: @get("ai-generator-language").value
    physics: @get("ai-generator-physics").value
    difficulty: @get("ai-generator-difficulty").value
    artStyle: @get("ai-generator-art-style").value
    providerProfileId: if @get("ai-generator-provider")? and @get("ai-generator-provider").value.length > 0 then @get("ai-generator-provider").value else null
    generateImages: @get("ai-generator-generate-images").checked
    imageProvider: if @get("ai-generator-image-provider")? then @get("ai-generator-image-provider").value else "placeholder"
    imageStyle: @get("ai-generator-image-style").value
    transparentSprites: @get("ai-generator-transparent-sprites").value == "true"
    assetResolution: @get("ai-generator-asset-resolution").value
    aspectRatio: @get("ai-generator-aspect-ratio").value
    mode: targetMode
    targetProjectId: if targetMode == "apply_to_current_project" then currentProjectId else null
    constraints:
      maxFiles: 20
      maxFileSizeKb: 120
      includeDocs: true
      includeTutorialComments: true

  normalizeAiIdeaText:(text)->
    String(text or "").replace(/\s+/g, " ").trim()

  stripAiIdeaBoilerplate:(idea)->
    text = @normalizeAiIdeaText idea
    return "" if not text

    patterns = [
      /^(?:please\s+)?(?:create|make|build|generate|design|develop)\s+(?:a|an|the)?\s*(?:simple|basic|small|fun|cool|good|interesting)?\s*(?:2d|2-d|2d\s+)?(?:game|video game|starter|demo|prototype)\b[\s,:-]*/i
      /^(?:create|make|build|generate)\s+(?:a|an|the)?\s*(?:simple|basic)?\s*(?:2d|2-d|2d\s+)?game\b[\s,:-]*/i
      /^(?:game\s+idea|idea|prompt)\s*[\s,:-]*/i
    ]

    changed = true
    while changed
      changed = false
      for pattern in patterns
        nextText = text.replace pattern,""
        if nextText != text
          text = nextText.trim()
          changed = true

    text = text.replace /^(?:which|that|where|to|for|about)\s+/i,""
    text = text.replace /\bthe\s+the\b/gi,"the"
    text = text.replace /\s{2,}/g," "
    text.trim()

  buildImprovedAiIdeaPrompt:(idea)->
    rawIdea = @normalizeAiIdeaText idea
    return "" if not rawIdea

    cleanedIdea = @stripAiIdeaBoilerplate rawIdea
    if not cleanedIdea
      cleanedIdea = rawIdea

    selectedLanguage = if @get("ai-generator-language")? then @get("ai-generator-language").value else "microScript"
    languageLabel = if selectedLanguage == "microStudioJavaScript" then "microStudio JavaScript" else "microScript"
    physics = if @get("ai-generator-physics")? then @get("ai-generator-physics").value else "auto"
    difficulty = if @get("ai-generator-difficulty")? then @get("ai-generator-difficulty").value else "beginner"
    artStyle = if @get("ai-generator-art-style")? then @get("ai-generator-art-style").value else "placeholder"
    aspectRatio = if @get("ai-generator-aspect-ratio")? then @get("ai-generator-aspect-ratio").value else "16:9"
    isLearningOrSimulation = /learn|teach|understand|help|get to know|application|magnif|zoom|paper|text|read|simulation|simulate|educat/i.test cleanedIdea.toLowerCase()
    focus = if isLearningOrSimulation then "an educational or simulation-style interaction that teaches the subject through play" else "a playable starter that stays focused on the requested mechanic"

    [
      "Create a 2D game about #{cleanedIdea}."
      "Make it a #{languageLabel} starter that is playable in microStudio."
      "Treat the concept as #{focus}."
      "Core rules:"
      "- Preserve the actual mechanic and subject from the idea."
      "- Use controls that match the concept instead of forcing a generic arcade loop."
      "- Include a clear objective, restart flow, and visible success or failure feedback."
      "- Keep state bounded and the implementation small."
      "- Use microStudio-native APIs only: screen, keyboard, mouse, touch, audio, sprites, maps, and system."
      "- Avoid browser canvas and DOM APIs."
      "Settings:"
      "- Physics: #{physics}"
      "- Difficulty: #{difficulty}"
      "- Art style: #{artStyle}"
      "- Aspect ratio: #{aspectRatio}"
      "If the idea is educational or simulation-focused, emphasize the real-world behavior the player should learn by doing."
    ].join("\n")

  postAiRequest:(url,payload)->
    controller = null
    if window.AbortController?
      controller = new AbortController()
      @aiRequestAbortController = controller

    options =
      method: "POST"
      credentials: "same-origin"
      headers:
        "Content-Type": "application/json"
      body: JSON.stringify payload
    if controller?
      options.signal = controller.signal

    fetch url,options
    .then (response)=>
      response.text().then (text)=>
        data = null
        if text? and text.length > 0
          try
            data = JSON.parse text
          catch error
            data =
              error: text
        if not response.ok
          err = new Error((if data? then data.error else null) or response.statusText or "Request failed")
          err.response = data
          throw err
        data
    .finally =>
      if controller? and @aiRequestAbortController == controller
        @aiRequestAbortController = null

  generateAiDraft:()->
    payload = @getAiRequestPayload()
    if not payload.idea?.length
      @setAiStatus "Describe the game you want to generate first.",true
      return
    if payload.mode == "apply_to_current_project" and not payload.targetProjectId?
      @setAiStatus "Open a project before generating for the current project.",true
      return
    @setAiBusy true
    @setAiStatus "Generating draft..."
    @postAiRequest("/api/ai/game-generator",payload).then((draft)=>
      @setAiBusy false
      @renderAiDraft draft
      @selectAiDraftFile(if draft.preview? and draft.preview.length > 0 then draft.preview[0].path else null)
    ,(err)=>
      return if @isAiAbortError(err)
      @setAiBusy false
      @setAiStatus(err.message or "Generation failed", true)
      @setAiWarnings [err.message or "Generation failed"]
    )

  regenerateAiDraft:()->
    if not @aiDraft?
      @generateAiDraft()
      return
    payload = @getAiRequestPayload()
    payload.draftId = @aiDraft.id
    @setAiBusy true
    @setAiStatus "Regenerating draft..."
    @postAiRequest("/api/ai/regenerate-game",payload).then((draft)=>
      @setAiBusy false
      @renderAiDraft draft
      @selectAiDraftFile(if draft.preview? and draft.preview.length > 0 then draft.preview[0].path else null)
    ,(err)=>
      return if @isAiAbortError(err)
      @setAiBusy false
      @setAiStatus(err.message or "Regeneration failed", true)
      @setAiWarnings [err.message or "Regeneration failed"]
    )

  explainAiDraft:()->
    if not @aiDraft?
      @setAiStatus "Generate a draft first.",true
      return
    question = "Explain the game idea \"#{@get("ai-generator-idea").value.trim()}\" and how to extend the starter."
    payload =
      draftId: @aiDraft.id
      question: question
    @setAiBusy true
    @setAiStatus "Generating explanation..."
    @postAiRequest("/api/ai/explain-generated-game",payload).then((data)=>
      @setAiBusy false
      @setAiExplanation data.explanation or ""
      @setAiStatus "Explanation ready."
    ,(err)=>
      return if @isAiAbortError(err)
      @setAiBusy false
      @setAiStatus(err.message or "Explanation failed", true)
      @setAiExplanation ""
    )

  improveAiIdeaPrompt:()->
    ideaInput = @get("ai-generator-idea")
    return if not ideaInput?
    idea = ideaInput.value.trim()
    if not idea.length
      @setAiStatus "Write a game idea first, then improve it.", true
      return

    improved = @buildImprovedAiIdeaPrompt idea
    if not improved.length
      @setAiStatus "Could not improve the prompt.", true
      return

    ideaInput.value = improved
    ideaInput.focus()
    @updateAiGeneratorButtons()
    @setAiStatus "Expanded the prompt with gameplay rules and microStudio details."

  exportAiDraftJson:()->
    return @setAiStatus("Generate a draft first.",true) if not @aiDraft?
    @setAiBusy true
    @setAiStatus "Exporting draft JSON..."
    @postAiRequest("/api/ai/drafts/#{@aiDraft.id}/export",{}).then((draft)=>
      @setAiBusy false
      json = JSON.stringify draft,null,2
      blob = new Blob [json],
        type: "application/json"
      url = URL.createObjectURL blob
      link = document.createElement "a"
      link.href = url
      slug = if draft.project?.slug? and draft.project.slug.length > 0 then draft.project.slug else "ai-draft"
      link.download = "#{slug}-#{draft.id}.json"
      document.body.appendChild link
      link.click()
      link.remove()
      window.setTimeout ()=>
        URL.revokeObjectURL url
      ,0
      @setAiStatus "Draft JSON exported."
    ,(err)=>
      return if @isAiAbortError(err)
      @setAiBusy false
      @setAiStatus(err.message or "Export failed", true)
    )

  applyAiDraft:(mode)->
    return @setAiStatus("Generate a draft first.",true) if not @aiDraft?
    targetMode = mode or "apply_to_current_project"
    if targetMode == "apply_to_current_project" and @aiDraft.request? and @aiDraft.request.mode == "new_project"
      @setAiStatus "This draft is set up for a new project. Use Create as New Project.",true
      return
    if targetMode == "apply_to_current_project" and not @app.project?
      @setAiStatus "Open a project before applying to the current project.",true
      return
    payload =
      draftId: @aiDraft.id
      mode: targetMode
      targetProjectId: if targetMode == "apply_to_current_project" and @app.project? then @app.project.id else null
    applyToCurrentProject = targetMode == "apply_to_current_project"
    doApply = =>
      saveAndApply = =>
        @setAiBusy true
        @setAiStatus(if targetMode == "new_project" then "Creating new project..." else "Applying to current project...")
        @postAiRequest("/api/ai/apply-game",payload).then((result)=>
          @setAiBusy false
          @setAiStatus(if targetMode == "new_project" then "New project created." else "Draft applied.")
          if targetMode == "new_project"
            @app.pendingAutoOpenMainSource = true
            @app.updateProjectList result.projectId
          else if @app.project?
            @app.project.setLanguage result.project.language if result.project?.language?
            @app.editor.updateLanguage()
            @app.debug.updateDebuggerVisibility()
            @app.queueMainSourceAutoOpen @app.project
            @app.project.load()
            @app.updateProjectList()
          @app.showNotification(if targetMode == "new_project" then "AI project created" else "AI draft applied")
        ,(err)=>
          return if @isAiAbortError(err)
          @setAiBusy false
          @setAiStatus(err.message or "Apply failed", true)
          @setAiWarnings [err.message or "Apply failed"]
        )
      if applyToCurrentProject and @app.project? and @app.project.pending_changes.length > 0
        @app.project.savePendingChanges ()=>
          saveAndApply()
      else
        saveAndApply()
    overwriteCount = 0
    deleteCount = 0
    if @aiDraft.preview?
      overwriteCount = @aiDraft.preview.filter((item)->item.status == "overwrite").length
      deleteCount = @aiDraft.preview.filter((item)->item.status == "delete").length
    if applyToCurrentProject and (overwriteCount > 0 or deleteCount > 0)
      ConfirmDialog.confirm "This draft will overwrite #{overwriteCount} file(s) and delete #{deleteCount} file(s). Continue?",@app.translator.get("Apply"),@app.translator.get("Cancel"),()=>
        doApply()
    else
      doApply()

  setDisplay:(element,value)->
    document.getElementById(element).style.display = value

  focus:(element)->
    document.getElementById(element).focus()

  get:(id)->
    document.getElementById(id)

  setAction:(id,callback)->
    @get(id).addEventListener "click",(event)=>
      event.preventDefault()
      callback(event)

  show:(element)->
    @setDisplay element,"block"

  hide:(element)->
    @setDisplay element,"none"

  createLoginFunctions:()->
    s1 = document.getElementById("switch_to_create_account")
    s2 = document.getElementById("switch_to_log_in")
    s3 = document.getElementById("switch_from_forgot_to_login")
    s4 = document.getElementById("forgot-password-link")
    s1.addEventListener "click",()=>
      @setDisplay "create-account-panel","block"
      document.getElementById("login-panel").style.display = "none"
    s2.addEventListener "click",()=>
      document.getElementById("create-account-panel").style.display = "none"
      document.getElementById("login-panel").style.display = "block"
    s3.addEventListener "click",()=>
      document.getElementById("forgot-password-panel").style.display = "none"
      document.getElementById("login-panel").style.display = "block"
    s4.addEventListener "click",()=>
      document.getElementById("forgot-password-panel").style.display = "block"
      document.getElementById("login-panel").style.display = "none"

    document.getElementById("login-window").addEventListener "click",(event)=>
      event.stopPropagation()

    document.getElementById("login-overlay").addEventListener "mousedown",(event)=>
      document.getElementById("login-overlay").style.display = "none"

    document.getElementById("login-window").addEventListener "mousedown",(event)=>
      event.stopPropagation()

    @setAction "login-button",()=>
      @showLoginPanel()

    @setAction "guest-action-login",()=>
      @showLoginPanel()

    @setAction "guest-action-create",()=>
      @showCreateAccountPanel()

    @setAction "create-account-button",()=>
      @showCreateAccountPanel()

    @setAction "create-account-toggle-terms",()=>
      @toggleTerms()

    @setAction "guest-action-guest",()=>
      @app.createGuest()
      document.getElementById("login-overlay").style.display = "none"

    document.querySelector(".username").addEventListener "mouseup",(event)=>
      event.stopPropagation()

    document.querySelector(".username").addEventListener "click",(event)=>
      e = document.querySelector(".usermenu")
      if window.ms_standalone
        e.classList.add "standalone"
        e.classList.remove "regular"
      else if @app.user.flags.guest or not @app.user.email?
        e.classList.add "guest"
        e.classList.remove "regular"
      else
        e.classList.add "regular"
        e.classList.remove "guest"

      if e.style.height == "0px"
        num = 0
        for c in e.childNodes
          if c.offsetParent?
            num += 1
        e.style.height = "#{42*num}px"
        if ! @usermenuclose
          @usermenuclose = document.body.addEventListener "mouseup",(event)=>
            e.style.height = "0px"
      else
        e.style.height = "0px"

    document.querySelector(".usermenu .logout").addEventListener "click",(event)=>
      @app.disconnect()

    document.querySelector(".usermenu .settings").addEventListener "click",(event)=>
      @app.openUserSettings()

    document.querySelector(".usermenu .profile").addEventListener "click",(event)=>
      @app.openUserProfile()

    document.querySelector(".usermenu .progress").addEventListener "click",(event)=>
      @app.openUserProgress()

    document.querySelector("#header-progress-summary").addEventListener "click",(event)=>
      @app.openUserProgress()

    document.querySelector(".usermenu .create-account").addEventListener "click",(event)=>
      @showCreateAccountPanel()

    document.querySelector(".usermenu .discard-account").addEventListener "click",(event)=>
      @app.disconnect()

    document.querySelector("#language-setting").addEventListener "mouseup",(event)=>
      event.stopPropagation()

    @createMainMenuFunction()

    document.querySelector("#language-setting").addEventListener "click",(event)=>
      e = document.querySelector("#language-menu")
      if not e.classList.contains "language-menu-open"
        e.classList.add "language-menu-open"
        if ! @languagemenuclose
          @languagemenuclose = document.body.addEventListener "mouseup",(event)=>
            e.classList.remove "language-menu-open"
      else
        e.classList.remove "language-menu-open"

    for lang in window.ms_languages
      do (lang)=>
        if document.querySelector("#language-choice-#{lang}")?
          document.querySelector("#language-choice-#{lang}").addEventListener "click",(event)=>@setLanguage(lang)

        if document.querySelector("#switch-to-#{lang}")?
          document.querySelector("#switch-to-#{lang}").addEventListener "click",(event)=>
            event.preventDefault()
            @setLanguage(lang)

    @setAction "login-submit",()=>
      @app.login @get("login_nick").value,@get("login_password").value

    @setAction "create-account-submit",()=>
      if not @get("create-account-tos").checked
        return alert(@app.translator.get("You must accept the terms of use in order to create an account."))
      @app.createAccount @get("create_nick").value,@get("create_email").value,@get("create_password").value,@get("create-account-newsletter").checked

    @setAction "forgot-submit",()=>
      @app.sendPasswordRecovery(document.getElementById("forgot_email").value)

  showLoginPanel:()->
    @setDisplay "login-overlay","block"
    @show "login-panel"
    @hide "create-account-panel"
    @hide "forgot-password-panel"
    @hide "guest-panel"

  showCreateAccountPanel:()->
    @setDisplay "login-overlay","block"
    @hide "login-panel"
    @show "create-account-panel"
    @hide "forgot-password-panel"
    @hide "guest-panel"

  userConnected:(nick)->
    return if @nick == nick
    @hide "login-button"
    @hide "create-account-button"
    @nick = nick
    if @app.user.flags.guest or not @app.user.email?
      @get("user-nick").innerHTML = @app.translator.get("Guest")
      document.querySelector(".username i").classList.remove("fa-user")
      document.querySelector(".username i").classList.add("fa-user-clock")
      document.querySelector(".username").classList.add("guest")
    else
      document.querySelector(".username i").classList.add("fa-user")
      document.querySelector(".username i").classList.remove("fa-user-clock")
      document.querySelector(".username").classList.remove("guest")
      @get("user-nick").innerHTML = nick
      if @project?
        @updateProjectTitle()
        @get("project-icon").src = location.origin+"/#{@project.owner.nick}/#{@project.slug}/#{@project.code}/icon.png"

      if not @app.user.flags.validated
        @addWarningMessage( @app.translator.get("Remember to validate your e-mail address"), "fa-exclamation-circle", "validate_email_"+Math.floor( Date.now()/1000/3600/24/2 ), true )

    @get("user-nick").style.display = "inline-block"
    #@show "user-info"
    @show("login-info")
    @hide "login-overlay"

    @setMainSection "projects",location.pathname.length<4 # home page with language variation => record jump to /projects/

    # @addWarningMessage """Join <a target="_blank" href="https://itch.io/jam/microstudio-mini-jam-2">microStudio mini-jam #2</a>! From October 24/25. More info in the <a target="_blank" href="https://microstudio.dev/community/news/mini-jam-2/235/">Community Forum</a> and <a target="_blank" href="https://discord.gg/BDMqjxd">Discord</a>""","fa-info-circle","mini_jam_2_#{Math.floor(Date.now()/1000/3600/12)}",true

    if @app.user.info.size>@app.user.info.max_storage
      text = @app.translator.get "Your account is out of space!"
      text += " "+@app.translator.get("You are using %USED% of the %ALLOWED% you are allowed." ).replace("%USED%",@displayByteSize(@app.user.info.size)).replace("%ALLOWED%",@displayByteSize(@app.user.info.max_storage))
      text += " <a href='https://microstudio.dev/community/tips/your-account-is-out-of-space/109/' target='_blank'>#{@app.translator.get("More info...")}</a>"
      @addWarningMessage text,undefined,"out_of_storage",false
    @updateAiProviderVisibility()
    @loadAiProviders()
    @loadAiAdminProviders() if @app.user.flags? and @app.user.flags.admin
    #if not @project?
    #  @show "myprojects"
    #  @hide "projectview"
      #@get("menu-projects").style.display = "inline-block"
    #@setMainSection "projects"

  userDisconnected:()->
    @get("login-button").style.display = "block"
    @get("user-nick").innerHTML = "nick"
    #@hide "menu-projects"
    @hide "login-info"
    @nick = null
    @clearAiDraft()
    @project = null
    @aiAdminProviders = []
    @aiProviderDraftId = null
    @aiProviderAdminOpen = false
    @updateAiProviderVisibility()
    #@get("user-info").style.display = "none"

  showLoginButton:()->
    @get("login-button").style.display = "block"
    @get("create-account-button").style.display = "block"

  popMenu:()->
    document.querySelector("header").style.transform = "translateY(0%)"

  createProjectBox:(p)->
    element = document.createElement "a"
    element.classList.add "project-box"
    element.id = "project-box-#{p.slug}"
    element.href = "/projects/#{p.slug}/code/"

    element.dataset.title = p.title
    element.dataset.description = p.description
    element.dataset.tags = p.tags.join(",")
    if p.public
      element.dataset.public = p.public

    buttons = document.createElement "div"
    buttons.classList.add "buttons"
    element.appendChild buttons
    
    if p.size
      size = @displayByteSize(p.size)
      sizepill = document.createElement "div"
      sizepill.innerText = size
      sizepill.classList.add "pill","bg-blue","shadow5",'marginbottom10','marginright10'
      buttons.appendChild(sizepill)

    if p.public
      pill = document.createElement "div"
      pill.innerHTML = """<i class="fa fa-eye"></i> """ + @app.translator.get "public"
      pill.classList.add "pill","bg-purple","shadow5",'marginbottom10'
      buttons.appendChild pill

    export_href = "/#{p.owner.nick}/#{p.slug}/#{p.code}/export/project/"
    export_button = document.createElement "div"
    export_button.classList.add "button","export","shadow5"
    export_button.innerHTML = "<a href='#{export_href}' download='#{p.slug}_files.zip'><i class='fa fa-download'></i> #{@app.translator.get("Export")}</a>"

    buttons.appendChild export_button

    export_button.addEventListener "click",(event)=>
      event.stopPropagation()
      event.stopImmediatePropagation()

    clone_button = document.createElement "div"
    clone_button.classList.add "button","clone","shadow5"
    clone_button.innerHTML = "<i class='fa fa-copy'></i> #{@app.translator.get("Clone")}"

    buttons.appendChild clone_button

    clone_button.addEventListener "click",(event)=>
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      ConfirmDialog.confirm @app.translator.get("Do you want to clone this project?"),@app.translator.get("Clone"),@app.translator.get("Cancel"),()=>
        @app.cloneProject p

    delete_button = document.createElement "div"
    delete_button.classList.add "button","delete","shadow5"
    if p.owner.nick == @app.nick
      delete_button.innerHTML = "<i class='fa fa-trash-alt'></i> #{@app.translator.get("Delete")}"
    else
      delete_button.innerHTML = "<i class='fa fa-times'></i> #{@app.translator.get("Quit")}"

    buttons.appendChild delete_button

    delete_button.addEventListener "click",(event)=>
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      msg = if p.owner.nick == @app.nick then @app.translator.get("Really delete this project?") else @app.translator.get("Really quit this project?")
      ok = if p.owner.nick == @app.nick then @app.translator.get("Delete") else @app.translator.get("Quit")
      ConfirmDialog.confirm msg,ok,@app.translator.get("Cancel"),()=>
        @app.deleteProject p

    title = document.createElement "div"
    title.classList.add "project-title"
    title.innerText = p.title
    element.appendChild title

    element.appendChild document.createElement "br"

    icon = new Image
    icon.src = location.origin+"/#{p.owner.nick}/#{p.slug}/#{p.code}/icon.png"
    icon.classList.add "pixelated"
    element.appendChild icon

    if p.poster
      element.style.background = "linear-gradient(to bottom, hsla(200,20%,20%,0.6), hsla(200,20%,20%,0.9)),url(/#{p.owner.nick}/#{p.slug}/#{p.code}/poster.png)"
      element.style["background-size"] = "cover"
      element.style["background-opacity"] = .5

      icon.style.width = "104px"
      icon.style.height = "104px"
      icon.style["margin-top"] = "40px"
      icon.style["box-shadow"] = "0 0 10px 1px #000"

    element.addEventListener "click",(event)=>
      if not event.ctrlKey and not event.metaKey
        event.preventDefault()
        @app.openProject p

    element

  updateProjects:()->
    list = @get("project-list")
    list.innerHTML = ""
    return if not @app.projects?

    document.querySelector("#projects-search input").value = ""
    @app.projects.sort (a,b)-> b.last_modified-a.last_modified

    pending = []
    count = 0

    for p in @app.projects
      if p.owner.nick == @app.nick or p.accepted
        element = @createProjectBox p
        list.appendChild element
        count++
      else
        pending.push p

    if count == 0
      h2 = document.createElement "h2"
      h2.innerHTML = @app.translator.get("Your projects will be displayed here.")+"<br />"+@app.translator.get("Time to create your first project!")
      list.appendChild h2

    if pending.length>0
      div = document.createElement "div"
      div.classList.add "project-invites-list"

      div.innerHTML = "<h2><i class='fa fa-users'></i> Pending invitations</h2>"

      for p in pending
        e = document.createElement "div"
        e.classList.add "invite"

        e.innerHTML = """
        <div class="buttons">
           <div class="accept" title="Accept" onclick="app.appui.acceptInvite(#{p.id})"><i class="fa fa-check"></i></div><div class="reject" title="Reject" onclick="app.appui.rejectInvite(#{p.id})"><i class="fa fa-times"></i></div>
        </div>
        <img src="/#{p.owner.nick}/#{p.slug}/#{p.code}/icon.png"/> #{p.title} by #{p.owner.nick}
        """

        div.appendChild e



      list.insertBefore div,list.firstChild
      ## create list of projects to accept or reject

    if @logged_callback?
      c = @logged_callback
      @logged_callback = null
      c()
    else
      @app.app_state.projectsFetched()

    return

  acceptInvite:(projectid)->
    for p in @app.projects
      if p.id == projectid and p.owner.nick != @app.nick and not p.accepted
        @app.client.sendRequest
          name: "accept_invite"
          project: projectid
    return

  rejectInvite:(projectid)->
    for p in @app.projects
      if p.id == projectid and p.owner.nick != @app.nick
        @app.client.sendRequest
          name: "remove_project_user"
          user: @app.nick
          project: projectid
    return

  setProject:(@project,useraction=true)->
    @clearAiDraft()
    @updateProjectTitle()
    @get("project-icon").src = location.origin+"/#{@project.owner.nick}/#{@project.slug}/#{@project.code}/icon.png"
    tab = "code"
    if @project.tabs? and not @app.tab_manager.isTabActive "code"
      tab = "options"
      for t in @sections
        if @app.tab_manager.isTabActive t
          tab = t
          break
      
    @setSection tab,useraction

    @show "projectview"
    @hide "myprojects"
    @project.addListener @
    @code_splitbar.initPosition(50)
    @debug_splitbar.closed2 = true
    @debug_splitbar.update()
    @runtime_splitbar.initPosition(50)
    @server_splitbar.initPosition(50)
    @app.runwindow.terminal.start()
    @updateActiveUsers()
    @doc_splitbar.initPosition(50)
    @updateAiProviderVisibility()
    @loadAiProviders(if @aiDraft? and @aiDraft.request? then @aiDraft.request.providerProfileId else null)

  updateAiProviderVisibility:()->
    row = @get("ai-generator-image-provider-row")
    return if not row?
    isAdmin = @app.user? and @app.user.flags? and @app.user.flags.admin
    row.classList.toggle "hidden", not isAdmin
    if @get("ai-generator-image-provider")?
      @get("ai-generator-image-provider").disabled = not isAdmin
    @updateAiProviderAdminVisibility()

  updateProjectTitle:()->
    if @project?
      html = @project.title
      if @project.public
        html += """ <div class="pill bg-purple shadow5 marginleft10"><i class="fa fa-eye"></i> #{@app.translator.get("public")}</div>"""
      @get("project-name").innerHTML = html
      
  projectUpdate:(change)->
    if change == "spritelist"
      icon = @project.getSprite "icon"
      if icon?
        icon.addImage @get("project-icon"),32

        img = document.querySelector "#project-box-#{@project.slug} img"
        if img?
          icon.addImage img,144
    else if change == "title" or change == "public"
      @updateProjectTitle()
    else if change == "locks"
      @updateActiveUsers()

  updateActiveUsers:()->
    element = document.querySelector(".projectheader #active-project-users")
    list = element.childNodes
    names = {}
    for i in [list.length-1..0] by -1
      e = list[i]
      name = e.id.split("-")[2]
      if not @project.friends[name]?
        element.removeChild(e)
      else
        names[name] = true

    for key of @project.friends
      if not names[key]
        div = document.createElement "div"
        div.style = "background:#{@createFriendColor(key)}"
        div.id = "active-user-#{key}"
        i = document.createElement "i"
        i.classList.add "fa"
        i.classList.add "fa-user"
        div.appendChild i
        span = document.createElement "span"
        span.innerText = key
        div.appendChild span
        element.appendChild div

    return

  createFriendColor:(friend)->
    seed = 137
    for i in [0..friend.length-1] by 1
      seed = (seed+friend.charCodeAt(i)*31+97)%360
    return "hsl(#{seed},50%,50%)"

  startSaveStatus:()->
    @savetick = 0
    setInterval (()=>@checkSaveStatus()),500

  checkSaveStatus:()->
    return if not @project?
    e = document.getElementById("save-status")
    switch @save_status
      when "saving"
        if @project.pending_changes.length == 0
          @save_status = "saved"
          e.classList.remove "fa-ellipsis-h"
          e.classList.add "fa-check"
          e.style.color = "hsl(160,50%,70%)"
          e.style.opacity = 1
          e.style.transform = "scale(1.1)"
        else
          @savetick = (@savetick+1)%2
          t = .9+@savetick*.2
          e.style.transform = "scale(#{t})"
      when "saved"
        e.style.opacity = 0
        e.style.transform = "scale(.9)"
        @save_status = ""
      else
        if @project.pending_changes.length > 0
          @save_status = "saving"
          e.classList.add "fa-ellipsis-h"
          e.classList.remove "fa-check"
          e.style.color = "hsl(0,50%,70%)"
          e.style.opacity = 1
          e.style.transform = "scale(1)"

  toggleTerms:()->
    if @terms_shown
      @terms_shown = false
      @get("create-account-terms").style.display = "none"
    else
      @terms_shown = true
      @get("create-account-terms").style.display = "block"
      @app.about.load "terms",(text)=>
        @get("create-account-terms").innerHTML = DOMPurify.sanitize marked text

  showNotification:(text)->
    document.querySelector("#notification-bubble span").innerText = text
    document.getElementById("notification-container").style.transform = "translateY(0px)"
    setTimeout (()=>
      document.getElementById("notification-container").style.transform = "translateY(-150px)"
      ),5000

  setLanguage:(lang)->
    return if document.cookie? and document.cookie.indexOf("language=#{lang}")>=0
    date = new Date()
    date.setTime(date.getTime()+1000*3600*24*60)
    document.cookie = "language=#{lang};expires=#{date.toUTCString()};path=/"

    window.location = location.origin+(if lang != "en" then "/#{lang}/" else "")  #+"?t=#{Date.now()}"

  displayByteSize:(size)->
    if size<1000
      return "#{size} #{@app.translator.get("Bytes")}"
    else if size<10000
      return "#{(size/1000).toFixed(1)} #{@app.translator.get("Kb")}"
    else if size<1000000
      return "#{Math.floor(size/1000)} #{@app.translator.get("Kb")}"
    else if size<10000000
      return "#{(size/1000000).toFixed(1)} #{@app.translator.get("Mb")}"
    else if size<1000000000
      return "#{Math.floor(size/1000000)} #{@app.translator.get("Mb")}"
    else
      return "#{(size/1000000000).toFixed(1)} #{@app.translator.get("Gb")}"

  createUserTag:(nick,tier,pic=false,picmargin)->
    div = document.createElement "a"
    div.classList.add "usertag"
    if tier
      div.classList.add tier

    i = document.createElement "i"
    i.classList.add "fa"
    i.classList.add "fa-user"

    div.appendChild i
    span = document.createElement "span"
    span.innerText = nick
    div.appendChild span

    if tier
      icon = new Image
      icon.src = location.origin+"/microstudio/patreon/badges/sprites/#{tier}.png"
      icon.classList.add "pixelated"
      icon.style = "width: 32px; height: 32px;"
      icon.alt = icon.title = @app.getTierName tier
      div.appendChild icon

    div.href = "/#{nick}/"
    div.target = "_blank"

    div.addEventListener "click",(event)->event.stopPropagation()

    if pic
      pic = document.createElement "img"
      pic.src = "/#{nick}.png"
      pic.classList.add "profile"
      div.appendChild pic

      if picmargin
        div.style["margin-left"] = "#{picmargin}px"

    div

  setImportProgress:(progress)->
    document.getElementById("import-project-button").innerHTML = """<i class="fa fa-upload"></i> Uploading... """
    progress = Math.round(progress)
    document.getElementById("import-project-button").style.background = "linear-gradient(90deg,hsl(200,50%,40%) 0%,hsl(200,50%,40%) #{progress}%,hsl(200,20%,20%) #{progress}%)"

  resetImportButton:()->
    document.getElementById("import-project-button").innerHTML = """<i class="fa fa-upload"></i> #{@app.translator.get("Import Project")}"""
    document.getElementById("import-project-button").style.removeProperty "background"

  bumpElement:(select)->
    element = document.querySelector select
    if element?
      start = Date.now()
      interval = setInterval (()->
        t = (Date.now()-start)/300
        if t >= 1
          element.style.transform = "none"
          clearInterval interval
        else
          t = Math.pow(t,.8)
          s = 1+.5*Math.sin(t*Math.PI)
          d = -.5*Math.sin(t*Math.PI)*20
          element.style.transform = "scale(#{s}) rotateZ(#{d}deg)"
        ),16

  createFullscreenFeatures:()->
    button = document.getElementById("project-fullscreen")
    button.addEventListener "click",()=>
      if document.fullscreenElement
        document.exitFullscreen()
      else
        document.getElementById("projectview").requestFullscreen()
        document.getElementById("projectview").style.background = "hsl(200,20%,15%)"

    window.addEventListener "fullscreenchange",()=>
      if document.fullscreenElement
        button.classList.remove "fa-expand"
        button.classList.add "fa-compress"
      else
        button.classList.add "fa-expand"
        button.classList.remove "fa-compress"
        document.getElementById("projectview").style.background = "none"


  createMainMenuFunction:()->
    button = document.getElementById("main-menu-button")
    menu = document.querySelector ".titlemenu"
    closing = false
    displayed = false

    bump = ()=>
      t = Date.now()
      f = ()=>
        tt = Date.now()-t
        if tt < 250
          tt = 1-tt/250
          tt = Math.pow(tt,2)
          rr = tt
          tt = 1+tt*.5
          button.style.transform = "scale(#{tt},#{tt}) rotate(#{-rr*10}deg)"
          setTimeout f,16
        else
          button.style.transform = "none"

      f()

    button.addEventListener "click",(event)=>
      if menu.style.left != "0%" and not closing
        menu.style.left = "0%"
        bump()
      else
        menu.style.left = "-100%"
        bump()

    document.addEventListener "mouseup",()=>
      if button.offsetParent? and menu.style.left != "-100%"
        menu.style.left = "-100%"
        closing = true
        bump()
      else
        closing = false

    resize = ()=>
      if not button.offsetParent?
        menu.style.left = "0px"
        displayed = false
      else if menu.style.left != "0%"
        menu.style.left = "-100%"
        if not displayed
          displayed = true
          bump()

    window.addEventListener "resize",resize

    resize()

  createProjectSideBarCollapse:()->
    collapse_time = 0
    resize_until = Date.now()

    @makeProjectSideBarVisible = ()=>
      if document.getElementById("projectview").classList.contains "sidebar-collapsed"
        document.getElementById("projectview").classList.remove "sidebar-collapsed"
        window.dispatchEvent(new Event('resize'))
      if window.innerWidth < 600
        collapse_time = Date.now() + 3000

    window.addEventListener "resize",()=>
      if not document.getElementById("projectview").classList.contains("sidebar-collapsed") and window.innerWidth < 600
        collapse_time = Date.now() + 3000
      else if document.getElementById("projectview").classList.contains("sidebar-collapsed") and window.innerWidth >= 600
        @makeProjectSideBarVisible()

    setInterval (()=>
      if Date.now() < resize_until
        window.dispatchEvent(new Event('resize'))
        
      if collapse_time and Date.now() > collapse_time
        collapse_time = 0
        if window.innerWidth < 600
          document.getElementById("projectview").classList.add "sidebar-collapsed"
          window.dispatchEvent(new Event('resize'))
    ),500
      

  createProjectLikesButton:(element,project)->
    e = element.querySelector(".likes-button")
    if e
      e.parentNode.removeChild(e)
  
    likes = document.createElement "div"
    likes.classList.add "likes-button"
    likes.innerHTML = "<i class='fa fa-thumbs-up'></i> "+project.likes
    likes.classList.add("liked") if project.liked
    element.appendChild likes

    likes.addEventListener "click",()=>
      event.stopImmediatePropagation()
      if not @app.user.flags.validated
        return alert(@app.translator.get("Validate your e-mail address to enable votes."))
      @app.client.sendRequest {
        name:"toggle_like"
        project: project.id
      },(msg)=>
        if msg.name == "project_likes"
          project.likes = msg.likes
          project.liked = msg.liked
          @createProjectLikesButton(element,project)
