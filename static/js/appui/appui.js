var AppUI;

AppUI = class AppUI {
  constructor(app1) {
    var advanced, j, k, len, len1, ref, ref1, s;
    this.app = app1;
    this.sections = ["code", "sprites", "maps", "assets", "sounds", "music", "doc", "sync", "options", "publish", "tabs", "ai-generator"];
    this.menuoptions = ["home", "explore", "projects", "help", "tutorials", "about", "usersettings"];
    ref = this.sections;
    for (j = 0, len = ref.length; j < len; j++) {
      s = ref[j];
      ((s) => {
        if (document.getElementById(`menuitem-${s}`) != null) {
          return document.getElementById(`menuitem-${s}`).addEventListener("click", (event) => {
            return this.setSection(s, true);
          });
        }
      })(s);
    }
    this.warning_messages = [];
    document.addEventListener("keydown", (e) => {
      if ((window.navigator.platform.match("Mac") ? e.metaKey : e.ctrlKey) && e.keyCode === 83) {
        e.preventDefault();
        switch (this.current_section) {
          case "code":
            return this.app.editor.checkSave(true);
          case "sprites":
            return this.app.sprite_editor.checkSave(true);
          case "maps":
            return this.app.map_editor.checkSave(true);
          case "doc":
            return this.app.doc_editor.checkSave(true);
          case "assets":
            return this.app.assets_manager.text_viewer.checkSave(true);
        }
      }
    });
    ref1 = this.menuoptions;
    for (k = 0, len1 = ref1.length; k < len1; k++) {
      s = ref1[k];
      ((s) => {
        var e;
        e = document.getElementById(`menu-${s}`);
        if (e != null) {
          return e.addEventListener("click", (event) => {
            if (window.ms_standalone && s === "explore") {
              return window.open("https://microstudio.dev/explore/", "_blank");
            } else if (window.ms_standalone && s === "home") {
              return window.open("https://microstudio.dev", "_blank");
            } else {
              return this.setMainSection(s, true);
            }
          });
        }
      })(s);
    }
    this.setAction("logo", () => {
      if (window.ms_standalone) {
        return window.open("https://microstudio.dev", "_blank");
      } else {
        return this.setMainSection("home", true);
      }
    });
    if (window.ms_standalone) {
      document.getElementById("menu-community").parentNode.href = "https://microstudio.dev/community/";
      document.getElementById("projectoptions-users-content").style.display = "none";
      document.getElementById("publish-box-online").style.display = "none";
      document.getElementById("usersetting-block-nickname").style.display = "none";
      document.getElementById("usersetting-block-email").style.display = "none";
      document.getElementById("usersetting-block-newsletter").style.display = "none";
      document.getElementById("usersetting-block-account-type").style.display = "none";
      document.body.classList.add("standalone");
    }
    //@setSection("options")
    this.createLoginFunctions();
    this.createAiGeneratorFunctions();
    this.updateAiProviderVisibility();
    advanced = document.getElementById("advanced-create-project-options-button");
    this.setAction("create-project-button", () => {
      this.show("create-project-overlay");
      this.focus("create-project-title");
      document.getElementById("createprojectoption-type").value = "app";
      document.getElementById("createprojectoption-language").value = window.ms_default_project_language || "microscript_v2";
      document.getElementById("createprojectoption-graphics").value = "M1";
      document.getElementById("createprojectoption-networking").checked = false;
      document.getElementById("create-project-option-lib-matterjs").checked = false;
      document.getElementById("create-project-option-lib-cannonjs").checked = false;
      return this.hideAdvanced();
    });
    this.hideAdvanced = () => {
      advanced.classList.remove("open");
      document.getElementById("advanced-create-project-options").style.display = "none";
      return advanced.childNodes[1].innerText = this.app.translator.get("Advanced");
    };
    advanced.addEventListener("click", () => {
      if (advanced.classList.contains("open")) {
        return this.hideAdvanced();
      } else {
        advanced.classList.add("open");
        document.getElementById("advanced-create-project-options").style.display = "block";
        return advanced.childNodes[1].innerText = this.app.translator.get("Hide advanced options");
      }
    });
    this.setAction("import-project-button", () => {
      var input;
      input = document.createElement("input");
      input.type = "file";
      input.accept = "application/zip";
      input.addEventListener("change", (event) => {
        var f, files;
        files = event.target.files;
        if (files.length >= 1) {
          f = files[0];
          return this.app.importProject(f);
        }
      });
      return input.click();
    });
    this.setAction("home-action-explore", () => {
      return this.setMainSection("explore");
    });
    this.setAction("home-action-create", () => {
      return this.setMainSection("projects");
    });
    document.getElementById("create-project-overlay").addEventListener("mousedown", (event) => {
      var b;
      if (event.target !== document.getElementById("create-project-overlay")) {
        return true;
      }
      b = document.getElementById("create-project-window").getBoundingClientRect();
      if (event.clientX < b.x || event.clientX > b.x + b.width || event.clientY < b.y || event.clientY > b.y + b.height) {
        this.hide("create-project-overlay");
      }
      return true;
    });
    this.setAction("create-project-submit", () => {
      var libs, slug, title;
      title = this.get("create-project-title").value;
      slug = RegexLib.slugify(title);
      if (title.length > 0 && slug.length > 0) {
        libs = [];
        if (document.getElementById("create-project-option-lib-matterjs").checked) {
          libs.push("matterjs");
        }
        if (document.getElementById("create-project-option-lib-cannonjs").checked) {
          libs.push("cannonjs");
        }
        this.app.createProject(title, slug, {
          type: document.getElementById("createprojectoption-type").value,
          language: document.getElementById("createprojectoption-language").value,
          graphics: document.getElementById("createprojectoption-graphics").value,
          networking: document.getElementById("createprojectoption-networking").checked,
          libs: libs
        });
        this.hide("create-project-overlay");
        return this.get("create-project-title").value = "";
      }
    });
    this.doc_splitbar = new SplitBar("doc-section", "horizontal");
    this.doc_splitbar.auto = 1;
    this.code_splitbar = new SplitBar("code-section", "horizontal");
    this.code_splitbar.auto = 1;
    this.runtime_splitbar = new SplitBar("runtime-container", "vertical");
    this.runtime_splitbar.auto = 1.5;
    this.runtime_splitbar.initPosition(67);
    this.server_splitbar = new SplitBar("runtime-terminal", "horizontal");
    this.server_splitbar.initPosition(50);
    this.server_splitbar.closed1 = true;
    this.debug_splitbar = new SplitBar("terminal-debug-container", "horizontal");
    this.debug_splitbar.closed2 = true;
    this.debug_splitbar.splitbar_size = 12;
    this.setAction("backtoprojects", () => {
      if (this.app.project != null) {
        return this.app.project.savePendingChanges(() => {
          return this.backToProjectList(true);
        });
      } else {
        return this.backToProjectList(true);
      }
    });
    this.get("create_nick").addEventListener("input", () => {
      var value;
      value = this.get("create_nick").value;
      if (value !== RegexLib.fixNick(value)) {
        return this.get("create_nick").value = RegexLib.fixNick(value);
      }
    });
    this.startSaveStatus();
    this.last_activity = Date.now();
    document.addEventListener("mousemove", () => {
      return this.last_activity = Date.now();
    });
    document.addEventListener("keydown", () => {
      return this.last_activity = Date.now();
    });
    document.querySelector("#projects-search input").addEventListener("input", () => {
      var l, len2, len3, list, m, ok, p, results, results1, search;
      search = document.querySelector("#projects-search input").value.toLowerCase();
      list = document.getElementById("project-list").childNodes;
      if (search.trim().length > 0) {
        results = [];
        for (l = 0, len2 = list.length; l < len2; l++) {
          p = list[l];
          if (p.dataset.title == null) {
            continue;
          }
          ok = p.dataset.title.toLowerCase().indexOf(search) >= 0;
          ok |= p.dataset.description.toLowerCase().indexOf(search) >= 0;
          ok |= p.dataset.tags.toLowerCase().indexOf(search) >= 0;
          ok |= p.dataset.public && "public".indexOf(search) >= 0;
          if (ok) {
            results.push(p.style.display = "inline-block");
          } else {
            results.push(p.style.display = "none");
          }
        }
        return results;
      } else {
        results1 = [];
        for (m = 0, len3 = list.length; m < len3; m++) {
          p = list[m];
          results1.push(p.style.display = "inline-block");
        }
        return results1;
      }
    });
    document.querySelector("#home-section").addEventListener("scroll", () => {
      var scroll;
      scroll = Math.min(60, document.querySelector("#home-section").scrollTop);
      return document.querySelector("#home-header-background").style.height = `${scroll}px`;
    });
    //document.querySelector("#home-section .part1").style["padding-top"] = "#{160-scroll}px"
    document.getElementById("myprojects").addEventListener("dragover", (event) => {
      return event.preventDefault();
    });
    document.getElementById("myprojects").addEventListener("drop", (event) => {
      event.preventDefault();
      if (event.dataTransfer.items && (event.dataTransfer.items[0] != null)) {
        return this.app.importProject(event.dataTransfer.items[0].getAsFile());
      }
    });
    this.createFullscreenFeatures();
    this.createProjectSideBarCollapse();
    setInterval((() => {
      return this.checkActivity();
    }), 10000);
    this.reboot_date = 1689163200000;
    this.checkRebootMessage();
  }

  checkRebootMessage() {
    var div, funk;
    if (this.reboot_date && Date.now() < this.reboot_date + 1000 * 60 * 2) {
      document.querySelector(".main-container").style.top = "100px";
      div = document.createElement("div");
      div.classList.add("meta-message");
      funk = () => {
        var hours, minutes;
        minutes = Math.max(0, this.reboot_date - Date.now()) / 60000;
        if (minutes >= 120) {
          hours = Math.floor(minutes / 60);
          return div.innerHTML = "<i class='fas fa-info-circle'></i> " + this.app.translator.get("microStudio will be down for server migration on %DATE% at %TIME%. Downtime will last a few minutes.").replace("%DATE%", new Date(this.reboot_date).toLocaleDateString()).replace("%TIME%", new Date(this.reboot_date).toLocaleTimeString());
        } else if (minutes >= 2) {
          minutes = Math.floor(minutes);
          return div.innerHTML = "<i class='fas fa-exclamation-circle'></i> " + this.app.translator.get("Downtime will start in %MINUTES% minutes").replace("%MINUTES%", minutes);
        } else {
          return div.innerHTML = "<i class='fas fa-exclamation-circle'></i> " + this.app.translator.get("Downtime will start immediately");
        }
      };
      funk();
      setInterval((() => {
        return funk();
      }), 30000);
      return document.body.appendChild(div);
    }
  }

  addWarningMessage(text, icon = "fa-exclamation-circle", id, dismissable) {
    var close, div, span;
    if (dismissable && id) {
      if (localStorage.getItem(id)) {
        return;
      }
    }
    div = document.createElement("div");
    div.classList.add("meta-message");
    span = document.createElement("span");
    span.innerHTML = `<i class='fas ${icon}'></i> ${text}`;
    if (dismissable) {
      close = document.createElement("i");
      close.classList.add("fa");
      close.classList.add("fa-times");
      close.addEventListener("click", () => {
        this.removeWarningMessage(div);
        if (id) {
          return localStorage.setItem(id, true);
        }
      });
      div.appendChild(close);
    }
    div.appendChild(span);
    this.warning_messages.push(div);
    document.querySelector(".main-container").style.top = `${60 + 40 * this.warning_messages.length}px`;
    document.body.appendChild(div);
    return this.layoutWarningMessages();
  }

  layoutWarningMessages() {
    var i, j, len, ref, results, w;
    ref = this.warning_messages;
    results = [];
    for (i = j = 0, len = ref.length; j < len; i = ++j) {
      w = ref[i];
      results.push(w.style.top = `${60 + i * 40}px`);
    }
    return results;
  }

  removeWarningMessage(div) {
    var index;
    if (document.body.contains(div)) {
      document.body.removeChild(div);
      index = this.warning_messages.indexOf(div);
      if (index >= 0) {
        this.warning_messages.splice(index, 1);
        document.querySelector(".main-container").style.top = `${60 + 40 * this.warning_messages.length}px`;
        return this.layoutWarningMessages();
      }
    }
  }

  checkActivity() {
    var t;
    t = Date.now() - this.last_activity;
    if (this.app.project != null) {
      if (t > 60 * 60 * 1000) {
        return this.backToProjectList(true);
      } else {
        return this.app.client.sendRequest({
          name: "ping"
        });
      }
    }
  }

  backToProjectList(useraction) {
    this.hide("projectview");
    this.show("myprojects");
    this.clearAiDraft();
    this.app.runwindow.projectClosed();
    this.app.debug.projectClosed();
    this.app.tab_manager.projectClosed();
    this.app.lib_manager.projectClosed();
    this.app.project = null;
    this.project = null;
    this.app.updateProjectList();
    if (useraction) {
      this.app.app_state.pushState("projects", "/projects/");
    }
    if (document.fullscreenElement) {
      return document.exitFullscreen();
    }
  }

  setSection(section, useraction) {
    var item, j, k, len, len1, list, menuitem, ref, s;
    if (this.makeProjectSideBarVisible != null) {
      this.makeProjectSideBarVisible();
    }
    this.current_section = section;
    ref = this.sections;
    for (j = 0, len = ref.length; j < len; j++) {
      s = ref[j];
      ((s) => {
        var element, menuitem;
        element = document.getElementById(`${s}-section`);
        menuitem = document.getElementById(`menuitem-${s}`);
        if ((element == null) || (menuitem == null)) {
          return;
        }
        if (s === section) {
          element.style.display = "block";
          menuitem.classList.add("selected");
          if (s === "tabs") {
            this.app.tab_manager.tabOpened();
          }
        } else {
          element.style.display = "none";
          menuitem.classList.remove("selected");
        }
      })(s);
    }
    menuitem = document.getElementById(`menuitem-${section}`);
    if (menuitem != null) {
      menuitem.classList.add("selected");
    }
    list = document.querySelectorAll(".menuitem-plugin");
    for (k = 0, len1 = list.length; k < len1; k++) {
      item = list[k];
      if (item.id !== `menuitem-${section}`) {
        item.classList.remove("selected");
      }
    }
    this.app.tab_manager.setTabView(section);
    if (section === "sprites") {
      this.app.sprite_editor.spriteview.windowResized();
    }
    if (section === "code") {
      this.code_splitbar.update();
      this.server_splitbar.update();
      this.debug_splitbar.update();
      this.runtime_splitbar.update();
      this.app.runwindow.windowResized();
      this.app.editor.editor.resize();
      this.app.editor.update();
    }
    if (section === "sprites") {
      this.app.sprite_editor.update();
    }
    if (section === "maps") {
      this.app.map_editor.update();
    }
    if (section === "doc") {
      this.doc_splitbar.update();
      this.app.doc_editor.editor.resize();
      this.app.doc_editor.checkTutorial();
    }
    if (section === "sounds") {
      this.app.sound_editor.update();
    }
    if (section === "music") {
      this.app.music_editor.update();
    }
    if (section === "assets") {
      this.app.assets_manager.update();
    }
    if (section === "sync") {
      this.app.sync.update();
    }
    if (section === "options") {
      this.app.options.update();
    }
    app.editor.editor.setReadOnly(section !== "code");
    app.doc_editor.editor.setReadOnly(section !== "doc");
    if (useraction && (this.app.project != null)) {
      this.app.app_state.pushState(`project.${this.app.project.slug}.${section}`, `/projects/${this.app.project.slug}/${section}/`);
    }
    return this.app.runwindow.hideAll();
  }

  accountRequired(callback) {
    this.logged_callback = callback;
    this.setDisplay("login-overlay", "block");
    this.hide("login-panel");
    this.hide("create-account-panel");
    this.hide("forgot-password-panel");
    return this.show("guest-panel");
  }

  setMainSection(section, useraction = false) {
    var j, len, name, p, ref, s;
    if (section === "projects" && (this.app.user == null)) {
      this.accountRequired();
      return;
    }
    if (useraction) {
      if (section === "home") {
        this.app.app_state.pushState("home", this.app.translator.lang === "fr" ? "/fr" : "/");
      } else if (section === "projects" && (this.project != null) && (this.current_section != null)) {
        this.app.app_state.pushState(`project.${this.project.slug}.${this.current_section}`, `/projects/${this.project.slug}/${this.current_section}/`);
      } else if (section === "explore" && this.app.explore.project) {
        p = this.app.explore.project;
        this.app.app_state.pushState("project_details", `/i/${p.owner}/${p.slug}/`, {
          project: p
        });
      } else {
        name = {
          "help": "documentation"
        }[section] || section;
        if (name === "documentation") {
          this.app.documentation.pushState();
        } else if (name === "tutorials") {
          this.app.tutorials.tutorials_page.pushState();
        } else {
          this.app.app_state.pushState(name, `/${name}/`);
        }
      }
    }
    ref = this.menuoptions;
    for (j = 0, len = ref.length; j < len; j++) {
      s = ref[j];
      ((s) => {
        var element, menuitem;
        element = document.getElementById(`${s}-section`);
        menuitem = document.getElementById(`menu-${s}`);
        if (s === section) {
          element.style.display = "block";
          if (menuitem != null) {
            return menuitem.classList.add("selected");
          }
        } else {
          element.style.display = "none";
          if (menuitem != null) {
            return menuitem.classList.remove("selected");
          }
        }
      })(s);
    }
    if (section === "projects" && (this.app.project == null)) {
      this.hide("projectview");
      this.show("myprojects");
    }
    if (section === "projects") {
      this.code_splitbar.update();
      this.server_splitbar.update();
      this.debug_splitbar.update();
      this.runtime_splitbar.update();
      this.app.runwindow.windowResized();
    }
    if (section === "explore") {
      this.app.explore.update();
    } else {
      this.app.explore.closed();
    }
    if (section === "help") {
      this.app.documentation.updateViewPos();
    }
    if (section === "about") {
      this.app.about.setSection("about");
    }
    if (section === "tutorials") {
      this.app.tutorials.load();
    }
    //@app.explore.closeDetails() if section != "explore"
    this.app.runwindow.hideAll();
  }

  createAiGeneratorFunctions() {
    var adminList, assetGallery, fileTree, i, len, path, ref;
    this.aiDraft = null;
    this.aiDraftByPath = {};
    this.aiDraftPreviewByPath = {};
    this.aiDraftImageById = {};
    this.aiSelectedPath = null;
    this.aiBusy = false;
    this.aiProviderProfiles = [];
    this.aiAdminProviders = [];
    this.aiProviderAdminOpen = false;
    this.aiProviderDraftId = null;
    this.setAction("ai-generator-generate", () => {
      return this.generateAiDraft();
    });
    this.setAction("ai-generator-regenerate", () => {
      return this.regenerateAiDraft();
    });
    this.setAction("ai-generator-explain", () => {
      return this.explainAiDraft();
    });
    this.setAction("ai-generator-export-json", () => {
      return this.exportAiDraftJson();
    });
    this.setAction("ai-generator-apply", () => {
      return this.applyAiDraft("apply_to_current_project");
    });
    this.setAction("ai-generator-create-new", () => {
      return this.applyAiDraft("new_project");
    });
    this.setAction("ai-generator-cancel", () => {
      return this.setSection("code", true);
    });
    this.setAction("ai-provider-admin-button", () => {
      return this.toggleAiProviderAdminPanel();
    });
    this.setAction("ai-provider-admin-refresh", () => {
      return this.loadAiAdminProviders();
    });
    this.setAction("ai-provider-save", () => {
      return this.saveAiProvider();
    });
    this.setAction("ai-provider-new", () => {
      return this.showAiProviderEditor(null);
    });
    this.setAction("ai-provider-cancel", () => {
      return this.showAiProviderEditor(null);
    });
    fileTree = this.get("ai-generator-file-tree");
    fileTree.addEventListener("click", (event) => {
      var target;
      target = event.target;
      while (target != null && target !== fileTree && !target.classList.contains("ai-file-item")) {
        target = target.parentNode;
      }
      if ((target != null) && target.classList.contains("ai-file-item")) {
        return this.selectAiDraftFile(target.dataset.path);
      }
    });
    assetGallery = this.get("ai-generator-asset-gallery");
    assetGallery.addEventListener("click", (event) => {
      var action, assetId, target;
      target = event.target;
      while (target != null && target !== assetGallery && !target.classList.contains("ai-asset-card")) {
        target = target.parentNode;
      }
      if (!(target != null) || !target.classList.contains("ai-asset-card")) {
        return;
      }
      assetId = target.dataset.assetId;
      action = null;
      if ((event.target != null) && (event.target.dataset != null)) {
        action = event.target.dataset.action;
      }
      if (action != null) {
        return this.handleAiAssetAction(action, assetId);
      } else if (assetId != null) {
        return this.selectAiDraftAsset(assetId);
      }
    });
    adminList = this.get("ai-provider-admin-list");
    if (adminList != null) {
      adminList.addEventListener("click", (event) => {
        var providerId, target;
        target = event.target;
        while (target != null && target !== adminList && !((target.dataset != null) && target.dataset.action)) {
          target = target.parentNode;
        }
        if (!(target != null) || !((target.dataset != null) && target.dataset.action)) {
          return;
        }
        providerId = target.dataset.providerId;
        switch (target.dataset.action) {
          case "edit-provider":
            return this.showAiProviderEditor(this.findAiProviderAdminProfile(providerId));
          case "test-provider":
            return this.testAiProvider(providerId);
          case "delete-provider":
            return this.deleteAiProvider(providerId);
          case "set-default-provider":
            return this.setDefaultAiProvider(providerId);
        }
      });
    }
    this.get("ai-generator-target-mode").addEventListener("change", () => {
      return this.updateAiGeneratorButtons();
    });
    this.get("ai-generator-generate-images").addEventListener("change", () => {
      return this.updateAiGeneratorButtons();
    });
    this.get("ai-generator-image-style").addEventListener("change", () => {
      return this.updateAiGeneratorButtons();
    });
    this.get("ai-generator-transparent-sprites").addEventListener("change", () => {
      return this.updateAiGeneratorButtons();
    });
    this.get("ai-generator-asset-resolution").addEventListener("change", () => {
      return this.updateAiGeneratorButtons();
    });
    this.get("ai-generator-image-provider").addEventListener("change", () => {
      return this.updateAiGeneratorButtons();
    });
    this.get("ai-generator-provider").addEventListener("change", () => {
      return this.updateAiGeneratorButtons();
    });
    ref = ["ai-generator-idea", "ai-generator-language", "ai-generator-physics", "ai-generator-difficulty", "ai-generator-art-style", "ai-generator-image-style", "ai-generator-aspect-ratio"];
    for (i = 0, len = ref.length; i < len; i++) {
      path = ref[i];
      this.get(path).addEventListener("input", () => {
        return this.updateAiGeneratorButtons();
      });
      this.get(path).addEventListener("change", () => {
        return this.updateAiGeneratorButtons();
      });
    }
    this.updateAiProviderVisibility();
    this.loadAiProviders();
    return this.renderAiDraft(null);
  }

  clearAiDraft() {
    this.aiDraft = null;
    this.aiDraftByPath = {};
    this.aiDraftPreviewByPath = {};
    this.aiDraftImageById = {};
    this.aiSelectedPath = null;
    this.setAiStatus("");
    this.setAiWarnings([]);
    this.renderAiSummary(null);
    this.renderAiFileTree([]);
    this.renderAiAssetGallery([]);
    this.renderAiPreview(null);
    this.setAiExplanation("");
    return this.updateAiGeneratorButtons();
  }

  setAiStatus(text, isError = false) {
    var element;
    element = this.get("ai-generator-status");
    if (element == null) {
      return;
    }
    element.textContent = text || "";
    element.style.color = isError ? "#fecaca" : "rgba(191,219,254,.95)";
  }

  setAiWarnings(warnings) {
    var container, i, item, len, warning;
    container = this.get("ai-generator-warnings");
    if (container == null) {
      return;
    }
    container.innerHTML = "";
    if (!(warnings != null ? warnings.length : void 0)) {
      return;
    }
    for (i = 0, len = warnings.length; i < len; i++) {
      warning = warnings[i];
      item = document.createElement("div");
      item.classList.add("warning");
      item.textContent = warning;
      container.appendChild(item);
    }
  }

  setAiExplanation(text) {
    var element;
    element = this.get("ai-generator-explanation-text");
    if (element == null) {
      return;
    }
    element.textContent = text || "";
  }

  loadAiProviders(selectedId = null) {
    var select;
    select = this.get("ai-generator-provider");
    if (select == null) {
      return Promise.resolve([]);
    }
    return fetch("/api/ai/providers/public?purpose=text", {
      credentials: "same-origin"
    }).then((response) => {
      return response.text().then((text) => {
        var data, err, providers, wanted;
        data = null;
        if (text != null && text.length > 0) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = {
              error: text
            };
          }
        }
        if (!response.ok) {
          err = new Error((data != null ? data.error : void 0) || response.statusText || "Request failed");
          err.response = data;
          throw err;
        }
        providers = Array.isArray(data != null ? data.providers : void 0) ? data.providers : [];
        this.aiProviderProfiles = providers;
        wanted = selectedId != null ? String(selectedId) : select.value;
        select.innerHTML = "";
        select.appendChild(new Option("Use server default", ""));
        for (var i = 0, len = providers.length; i < len; i++) {
          var provider = providers[i];
          select.appendChild(new Option(`${provider.name}${provider.modelId ? ` (${provider.modelId})` : ""}`, String(provider.id)));
        }
        if (wanted) {
          select.value = wanted;
        } else {
          selectedId = providers.find((provider) => provider.isDefault);
          select.value = selectedId != null ? String(selectedId.id) : "";
        }
        return providers;
      });
    }, (err) => {
      this.aiProviderProfiles = [];
      select.innerHTML = "";
      select.appendChild(new Option("Use server default", ""));
      return [];
    });
  }

  requestJson(method, url, payload = null) {
    var options;
    options = {
      method: method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      }
    };
    if (payload != null) {
      options.body = JSON.stringify(payload);
    }
    return fetch(url, options).then((response) => {
      return response.text().then((text) => {
        var data, err;
        data = null;
        if (text != null && text.length > 0) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = {
              error: text
            };
          }
        }
        if (!response.ok) {
          err = new Error((data != null ? data.error : void 0) || response.statusText || "Request failed");
          err.response = data;
          throw err;
        }
        return data;
      });
    });
  }

  updateAiGeneratorButtons() {
    var canApply, canExplain, canGenerate, canRegenerate, draftReady, element, i, len, ref, targetMode;
    draftReady = this.aiDraft != null;
    targetMode = this.get("ai-generator-target-mode") != null ? this.get("ai-generator-target-mode").value : "apply_to_current_project";
    canGenerate = !this.aiBusy;
    canRegenerate = draftReady && !this.aiBusy;
    canExplain = draftReady && !this.aiBusy;
    canApply = draftReady && !this.aiBusy && targetMode === "apply_to_current_project";
    ref = ["ai-generator-generate", "ai-generator-regenerate", "ai-generator-apply", "ai-generator-create-new", "ai-generator-explain"];
    for (i = 0, len = ref.length; i < len; i++) {
      element = this.get(ref[i]);
      if (element == null) {
        continue;
      }
      switch (ref[i]) {
        case "ai-generator-generate":
          element.disabled = !canGenerate;
          break;
        case "ai-generator-regenerate":
          element.disabled = !canRegenerate;
          break;
        case "ai-generator-apply":
          element.disabled = !canApply;
          break;
        case "ai-generator-create-new":
          element.disabled = !(draftReady && !this.aiBusy);
          break;
        case "ai-generator-explain":
          element.disabled = !canExplain;
      }
    }
    ref = ["ai-generator-image-style", "ai-generator-transparent-sprites", "ai-generator-asset-resolution", "ai-generator-image-provider", "ai-generator-provider", "ai-generator-generate-images"];
    for (i = 0, len = ref.length; i < len; i++) {
      element = this.get(ref[i]);
      if (element == null) {
        continue;
      }
      element.disabled = this.aiBusy;
    }
    if ((this.get("ai-generator-generate-images") != null) && this.get("ai-generator-generate-images").checked) {
      this.get("ai-generator-asset-gallery").style.display = "grid";
    } else {
      this.get("ai-generator-asset-gallery").style.display = this.aiDraft != null && (this.aiDraft.imageAssets != null) && this.aiDraft.imageAssets.length > 0 ? "grid" : "none";
    }
    ref = document.querySelectorAll(".ai-asset-actions button");
    for (i = 0, len = ref.length; i < len; i++) {
      element = ref[i];
      element.disabled = this.aiBusy;
    }
  }

  setAiBusy(loading) {
    this.aiBusy = loading;
    if (loading) {
      this.setAiStatus("Working on the draft...");
    }
    return this.updateAiGeneratorButtons();
  }

  renderAiSummary(draft) {
    var container, entry, row, rows;
    container = this.get("ai-generator-summary");
    if (container == null) {
      return;
    }
    container.innerHTML = "";
    if (draft == null) {
      this.get("ai-generator-summary-empty").style.display = "block";
      return;
    }
    this.get("ai-generator-summary-empty").style.display = "none";
    rows = [
      ["Title", draft.project != null ? draft.project.title : ""],
      ["Slug", draft.project != null ? draft.project.slug : ""],
      ["Physics", draft.resolvedPhysicsMode || ""],
      ["Provider", draft.provider != null ? `${draft.provider.name} / ${draft.provider.modelId}` : ""],
      ["Difficulty", draft.project != null ? draft.project.difficulty : ""],
      ["Controls", draft.gameDesign != null ? (draft.gameDesign.controls || []).join(", ") : ""],
      ["Genre", draft.gameDesign != null ? draft.gameDesign.genre : ""],
      ["Core loop", draft.gameDesign != null ? draft.gameDesign.coreLoop : ""],
      ["Win condition", draft.gameDesign != null ? draft.gameDesign.winCondition : ""],
      ["Lose condition", draft.gameDesign != null ? draft.gameDesign.loseCondition : ""],
      ["Images", `${(draft.imageAssets != null ? draft.imageAssets.length : 0)} prepared`],
      ["Files", `${(draft.preview != null ? draft.preview.length : 0)} prepared`]
    ];
    for (entry of rows) {
      row = document.createElement("div");
      row.classList.add("ai-summary-row");
      row.innerHTML = "<strong></strong><span></span>";
      row.childNodes[0].textContent = `${entry[0]}:`;
      row.childNodes[1].textContent = ` ${entry[1] || ""}`;
      container.appendChild(row);
    }
  }

  renderAiFileTree(files) {
    var badge, container, entry, i, item, len, label, ref, selectedPath, statusText;
    container = this.get("ai-generator-file-tree");
    if (container == null) {
      return;
    }
    container.innerHTML = "";
    selectedPath = this.aiSelectedPath;
    ref = files || [];
    for (i = 0, len = ref.length; i < len; i++) {
      entry = ref[i];
      item = document.createElement("div");
      item.classList.add("ai-file-item");
      if (entry.path === selectedPath) {
        item.classList.add("selected");
      }
      item.dataset.path = entry.path;
      label = document.createElement("span");
      label.classList.add("path");
      label.textContent = entry.path;
      badge = document.createElement("span");
      badge.classList.add("badge");
      statusText = entry.status || "create";
      badge.textContent = statusText;
      item.appendChild(label);
      item.appendChild(badge);
      container.appendChild(item);
    }
  }

  renderAiAssetGallery(assets) {
    var action, actions, asset, card, container, i, image, j, label, len, len1, meta, previewSource, ref, ref1, selectedPath, status, title;
    container = this.get("ai-generator-asset-gallery");
    if (container == null) {
      return;
    }
    container.innerHTML = "";
    selectedPath = this.aiSelectedPath;
    ref = assets || [];
    for (i = 0, len = ref.length; i < len; i++) {
      asset = ref[i];
      previewSource = this.aiDraftByPath[asset.filename] || this.aiDraftPreviewByPath[asset.filename] || {};
      card = document.createElement("div");
      card.classList.add("ai-asset-card");
      if ((selectedPath != null) && (selectedPath === asset.filename || selectedPath === asset.path)) {
        card.classList.add("selected");
      }
      card.dataset.assetId = asset.id;
      image = document.createElement("img");
      image.classList.add("ai-asset-thumb");
      image.src = previewSource.previewDataUrl || asset.previewDataUrl || (previewSource.contentBase64 != null ? `data:image/png;base64,${previewSource.contentBase64}` : asset.contentBase64 != null ? `data:image/png;base64,${asset.contentBase64}` : "");
      image.alt = asset.id;
      meta = document.createElement("div");
      meta.classList.add("ai-asset-meta");
      meta.innerHTML = "<strong></strong><span></span><span></span>";
      meta.childNodes[0].textContent = asset.id;
      meta.childNodes[1].textContent = asset.filename;
      meta.childNodes[2].textContent = asset.prompt || "";
      actions = document.createElement("div");
      actions.classList.add("ai-asset-actions");
      acceptLabel = asset.accepted ? "Accepted" : "Accept asset";
      ref1 = [["Regenerate this asset", "regenerate-asset"], ["Edit prompt", "edit-asset-prompt"], [acceptLabel, "accept-asset"], ["Replace asset", "replace-asset"]];
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        action = ref1[j];
        title = action[0];
        status = action[1];
        label = document.createElement("button");
        label.textContent = title;
        label.dataset.action = status;
        label.dataset.assetId = asset.id;
        if (asset.accepted && status === "accept-asset") {
          label.classList.add("accepted");
        }
        actions.appendChild(label);
      }
      card.appendChild(image);
      card.appendChild(meta);
      card.appendChild(actions);
      container.appendChild(card);
    }
  }

  renderAiPreview(file) {
    var container, image, meta, preview, text;
    container = this.get("ai-generator-file-preview");
    meta = this.get("ai-generator-preview-file-name");
    if (container == null || meta == null) {
      return;
    }
    container.innerHTML = "";
    meta.textContent = "";
    if (file == null) {
      container.textContent = "Select a file to inspect its contents.";
      return;
    }
    meta.textContent = `${file.path}${file.status ? ` (${file.status})` : ""}`;
    if (file.status === "delete") {
      container.textContent = "This file will be deleted.";
      return;
    }
    if ((file.previewDataUrl != null) || file.type === "image") {
      image = document.createElement("img");
      image.classList.add("ai-preview-image");
      image.src = file.previewDataUrl || `data:image/png;base64,${file.contentBase64 || ""}`;
      image.alt = file.path;
      container.appendChild(image);
      if (file.preview) {
        preview = document.createElement("div");
        preview.style.marginTop = "10px";
        preview.style.color = "rgba(255,255,255,.75)";
        preview.textContent = file.preview;
        container.appendChild(preview);
      }
      return;
    }
    text = document.createElement("pre");
    text.style.margin = "0";
    text.style.whiteSpace = "pre-wrap";
    text.style.wordBreak = "break-word";
    text.textContent = file.content != null ? String(file.content) : (file.preview || "");
    container.appendChild(text);
  }

  renderAiDraft(draft) {
    var asset, file, i, len, previewFiles, selected;
    this.aiDraft = draft;
    this.aiDraftByPath = {};
    this.aiDraftPreviewByPath = {};
    this.aiDraftImageById = {};
    this.aiSelectedPath = null;
    if (draft == null) {
      this.setAiStatus("");
      this.setAiWarnings([]);
      this.renderAiSummary(null);
      this.renderAiFileTree([]);
      this.renderAiAssetGallery([]);
      this.renderAiPreview(null);
      this.setAiExplanation("");
      return this.updateAiGeneratorButtons();
    }
    previewFiles = Array.isArray(draft.preview) ? draft.preview : [];
    for (i = 0, len = previewFiles.length; i < len; i++) {
      file = previewFiles[i];
      this.aiDraftPreviewByPath[file.path] = file;
    }
    if (Array.isArray(draft.files)) {
      for (i = 0, len = draft.files.length; i < len; i++) {
        file = draft.files[i];
        this.aiDraftByPath[file.path] = file;
      }
    }
    if (Array.isArray(draft.imageAssets)) {
      for (i = 0, len = draft.imageAssets.length; i < len; i++) {
        asset = draft.imageAssets[i];
        this.aiDraftImageById[asset.id] = asset;
      }
    }
    this.aiSelectedPath = previewFiles.length > 0 ? previewFiles[0].path : null;
    this.renderAiSummary(draft);
    this.setAiWarnings(draft.warnings || []);
    this.setAiStatus(`Ready: ${draft.project != null ? draft.project.title : "generated draft"} (${draft.resolvedPhysicsMode || "manual"} physics).`);
    this.renderAiFileTree(previewFiles);
    this.renderAiAssetGallery(draft.imageAssets || []);
    this.loadAiProviders(draft.request != null ? draft.request.providerProfileId : null);
    selected = this.selectAiDraftFile(this.aiSelectedPath, true);
    if (!selected && previewFiles.length > 0) {
      this.renderAiPreview(previewFiles[0]);
    }
    this.setAiExplanation("");
    return this.updateAiGeneratorButtons();
  }

  selectAiDraftFile(path, silent = false) {
    var file;
    if (path == null) {
      return false;
    }
    this.aiSelectedPath = path;
    if ((this.aiDraftPreviewByPath[path] == null) && (this.aiDraftByPath[path] == null)) {
      if (!silent) {
        this.renderAiPreview(null);
      }
      return false;
    }
    file = Object.assign({}, this.aiDraftByPath[path] || {}, this.aiDraftPreviewByPath[path] || {});
    this.renderAiFileTree((this.aiDraft != null ? this.aiDraft.preview : []));
    this.renderAiPreview(file);
    return true;
  }

  selectAiDraftAsset(assetId) {
    var asset;
    if (assetId == null) {
      return false;
    }
    asset = this.aiDraftImageById[assetId];
    if (asset == null) {
      return false;
    }
    this.aiSelectedPath = asset.filename;
    this.renderAiAssetGallery((this.aiDraft != null ? this.aiDraft.imageAssets : []) || []);
    if ((this.aiDraftByPath[asset.filename] != null) || (this.aiDraftPreviewByPath[asset.filename] != null)) {
      this.renderAiPreview(Object.assign({}, this.aiDraftByPath[asset.filename] || {}, this.aiDraftPreviewByPath[asset.filename] || {}));
    } else {
      this.renderAiPreview(null);
    }
    return true;
  }

  handleAiAssetAction(action, assetId) {
    var asset, newPrompt, payload, replacement;
    if (assetId == null) {
      return;
    }
    asset = this.aiDraftImageById[assetId];
    if (asset == null) {
      return;
    }
    switch (action) {
      case "edit-asset-prompt":
        newPrompt = window.prompt("Edit asset prompt", asset.prompt || "");
        if (newPrompt == null) {
          return;
        }
        asset.prompt = newPrompt.trim();
        return this.renderAiDraft(this.aiDraft);
      case "accept-asset":
        asset.accepted = !asset.accepted;
        return this.renderAiDraft(this.aiDraft);
      case "replace-asset":
        replacement = window.prompt("Replace asset prompt", asset.prompt || "");
        if (replacement == null) {
          return;
        }
        asset.prompt = replacement.trim();
        return this.regenerateAiImageAsset(asset.id, asset.prompt);
      case "regenerate-asset":
        return this.regenerateAiImageAsset(asset.id, asset.prompt);
    }
  }

  regenerateAiImageAsset(assetId, prompt) {
    var payload;
    if (this.aiDraft == null) {
      return;
    }
    payload = {
      draftId: this.aiDraft.id,
      assetId: assetId,
      prompt: prompt,
      imageProvider: this.get("ai-generator-image-provider") != null ? this.get("ai-generator-image-provider").value : "placeholder",
      imageStyle: this.get("ai-generator-image-style").value,
      assetResolution: this.get("ai-generator-asset-resolution").value,
      transparentBackground: this.get("ai-generator-transparent-sprites").value === "true",
      accepted: true
    };
    this.setAiBusy(true);
    this.setAiStatus("Regenerating asset...");
    return this.postAiRequest("/api/ai/regenerate-image", payload).then((draft) => {
      this.setAiBusy(false);
      return this.renderAiDraft(draft);
    }, (err) => {
      this.setAiBusy(false);
      this.setAiStatus(err.message || "Image regeneration failed", true);
      return this.setAiWarnings([err.message || "Image regeneration failed"]);
    });
  }

  getAiRequestPayload() {
    var currentProjectId, idea, payload, targetMode;
    idea = this.get("ai-generator-idea").value.trim();
    targetMode = this.get("ai-generator-target-mode").value || "apply_to_current_project";
    currentProjectId = this.app.project != null ? this.app.project.id : null;
    payload = {
      idea: idea,
      language: this.get("ai-generator-language").value,
      physics: this.get("ai-generator-physics").value,
      difficulty: this.get("ai-generator-difficulty").value,
      artStyle: this.get("ai-generator-art-style").value,
      providerProfileId: this.get("ai-generator-provider") != null && this.get("ai-generator-provider").value.length > 0 ? this.get("ai-generator-provider").value : null,
      generateImages: this.get("ai-generator-generate-images").checked,
      imageProvider: this.get("ai-generator-image-provider") != null ? this.get("ai-generator-image-provider").value : "placeholder",
      imageStyle: this.get("ai-generator-image-style").value,
      transparentSprites: this.get("ai-generator-transparent-sprites").value === "true",
      assetResolution: this.get("ai-generator-asset-resolution").value,
      aspectRatio: this.get("ai-generator-aspect-ratio").value,
      mode: targetMode,
      targetProjectId: targetMode === "apply_to_current_project" ? currentProjectId : null,
      constraints: {
        maxFiles: 32,
        maxFileSizeKb: 256,
        includeDocs: true,
        includeTutorialComments: true
      }
    };
    return payload;
  }

  postAiRequest(url, payload) {
    return fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }).then((response) => {
      return response.text().then((text) => {
        var data, err;
        data = null;
        if (text != null && text.length > 0) {
          try {
            data = JSON.parse(text);
          } catch (error) {
            data = {
              error: text
            };
          }
        }
        if (!response.ok) {
          err = new Error((data != null ? data.error : void 0) || response.statusText || "Request failed");
          err.response = data;
          throw err;
        }
        return data;
      });
    });
  }

  generateAiDraft() {
    var payload;
    payload = this.getAiRequestPayload();
    if (!(payload.idea != null ? payload.idea.length : void 0)) {
      this.setAiStatus("Describe the game you want to generate first.", true);
      return;
    }
    if (payload.mode === "apply_to_current_project" && payload.targetProjectId == null) {
      this.setAiStatus("Open a project before generating for the current project.", true);
      return;
    }
    this.setAiBusy(true);
    this.setAiStatus("Generating draft...");
    return this.postAiRequest("/api/ai/game-generator", payload).then((draft) => {
      this.setAiBusy(false);
      this.renderAiDraft(draft);
      return this.selectAiDraftFile(draft.preview != null && draft.preview.length > 0 ? draft.preview[0].path : null);
    }, (err) => {
      this.setAiBusy(false);
      this.setAiStatus(err.message || "Generation failed", true);
      return this.setAiWarnings([err.message || "Generation failed"]);
    });
  }

  regenerateAiDraft() {
    var payload;
    if (this.aiDraft == null) {
      return this.generateAiDraft();
    }
    payload = this.getAiRequestPayload();
    payload.draftId = this.aiDraft.id;
    this.setAiBusy(true);
    this.setAiStatus("Regenerating draft...");
    return this.postAiRequest("/api/ai/regenerate-game", payload).then((draft) => {
      this.setAiBusy(false);
      this.renderAiDraft(draft);
      return this.selectAiDraftFile(draft.preview != null && draft.preview.length > 0 ? draft.preview[0].path : null);
    }, (err) => {
      this.setAiBusy(false);
      this.setAiStatus(err.message || "Regeneration failed", true);
      return this.setAiWarnings([err.message || "Regeneration failed"]);
    });
  }

  explainAiDraft() {
    var payload, question;
    if (this.aiDraft == null) {
      this.setAiStatus("Generate a draft first.", true);
      return;
    }
    question = `Explain the game idea "${this.get("ai-generator-idea").value.trim()}" and how to extend the starter.`;
    payload = {
      draftId: this.aiDraft.id,
      question: question
    };
    this.setAiBusy(true);
    this.setAiStatus("Generating explanation...");
    return this.postAiRequest("/api/ai/explain-generated-game", payload).then((data) => {
      this.setAiBusy(false);
      this.setAiExplanation(data.explanation || "");
      return this.setAiStatus("Explanation ready.");
    }, (err) => {
      this.setAiBusy(false);
      this.setAiStatus(err.message || "Explanation failed", true);
      return this.setAiExplanation("");
    });
  }

  exportAiDraftJson() {
    var json;
    if (this.aiDraft == null) {
      return this.setAiStatus("Generate a draft first.", true);
    }
    this.setAiBusy(true);
    this.setAiStatus("Exporting draft JSON...");
    return this.postAiRequest(`/api/ai/drafts/${this.aiDraft.id}/export`, {}).then((draft) => {
      var blob, link, slug, url;
      this.setAiBusy(false);
      json = JSON.stringify(draft, null, 2);
      blob = new Blob([json], {
        type: "application/json"
      });
      url = URL.createObjectURL(blob);
      link = document.createElement("a");
      link.href = url;
      slug = ((draft.project != null ? draft.project.slug : null) != null) && draft.project.slug.length > 0 ? draft.project.slug : "ai-draft";
      link.download = `${slug}-${draft.id}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        return URL.revokeObjectURL(url);
      }, 0);
      return this.setAiStatus("Draft JSON exported.");
    }, (err) => {
      this.setAiBusy(false);
      return this.setAiStatus(err.message || "Export failed", true);
    });
  }

  applyAiDraft(mode) {
    var applyToCurrentProject, doApply, payload, project, targetMode, withConfirm;
    if (this.aiDraft == null) {
      this.setAiStatus("Generate a draft first.", true);
      return;
    }
    targetMode = mode || "apply_to_current_project";
    if (targetMode === "apply_to_current_project" && this.aiDraft.request != null && this.aiDraft.request.mode === "new_project") {
      this.setAiStatus("This draft is set up for a new project. Use Create as New Project.", true);
      return;
    }
    if (targetMode === "apply_to_current_project") {
      project = this.app.project;
      if (project == null) {
        this.setAiStatus("Open a project before applying to the current project.", true);
        return;
      }
    }
    payload = {
      draftId: this.aiDraft.id,
      mode: targetMode,
      targetProjectId: targetMode === "apply_to_current_project" && this.app.project != null ? this.app.project.id : null
    };
    applyToCurrentProject = targetMode === "apply_to_current_project";
    withConfirm = () => {
      var deleteCount, overwriteCount;
      overwriteCount = 0;
      deleteCount = 0;
      if (this.aiDraft != null && Array.isArray(this.aiDraft.preview)) {
        overwriteCount = this.aiDraft.preview.filter((item) => item.status === "overwrite").length;
        deleteCount = this.aiDraft.preview.filter((item) => item.status === "delete").length;
      }
      if (applyToCurrentProject && (overwriteCount > 0 || deleteCount > 0)) {
        return ConfirmDialog.confirm(`This draft will overwrite ${overwriteCount} file(s) and delete ${deleteCount} file(s). Continue?`, this.app.translator.get("Apply"), this.app.translator.get("Cancel"), () => {
          return doApply();
        });
      } else {
        return doApply();
      }
    };
    doApply = () => {
      var saveAndApply;
      saveAndApply = () => {
        this.setAiBusy(true);
        this.setAiStatus(targetMode === "new_project" ? "Creating new project..." : "Applying to current project...");
        return this.postAiRequest("/api/ai/apply-game", payload).then((result) => {
          this.setAiBusy(false);
          this.setAiStatus(targetMode === "new_project" ? "New project created." : "Draft applied.");
          if (targetMode === "new_project") {
            this.app.updateProjectList(result.projectId);
          } else if (this.app.project != null) {
            this.app.project.load();
            this.app.updateProjectList();
          }
          return this.app.showNotification(targetMode === "new_project" ? "AI project created" : "AI draft applied");
        }, (err) => {
          this.setAiBusy(false);
          this.setAiStatus(err.message || "Apply failed", true);
          return this.setAiWarnings([err.message || "Apply failed"]);
        });
      };
      if (applyToCurrentProject && this.app.project != null && this.app.project.pending_changes.length > 0) {
        return this.app.project.savePendingChanges(() => {
          return saveAndApply();
        });
      } else {
        return saveAndApply();
      }
    };
    return withConfirm();
  }

  setDisplay(element, value) {
    return document.getElementById(element).style.display = value;
  }

  focus(element) {
    return document.getElementById(element).focus();
  }

  get(id) {
    return document.getElementById(id);
  }

  setAction(id, callback) {
    return this.get(id).addEventListener("click", (event) => {
      event.preventDefault();
      return callback(event);
    });
  }

  show(element) {
    return this.setDisplay(element, "block");
  }

  hide(element) {
    return this.setDisplay(element, "none");
  }

  createLoginFunctions() {
    var j, lang, len, ref, s1, s2, s3, s4;
    s1 = document.getElementById("switch_to_create_account");
    s2 = document.getElementById("switch_to_log_in");
    s3 = document.getElementById("switch_from_forgot_to_login");
    s4 = document.getElementById("forgot-password-link");
    s1.addEventListener("click", () => {
      this.setDisplay("create-account-panel", "block");
      return document.getElementById("login-panel").style.display = "none";
    });
    s2.addEventListener("click", () => {
      document.getElementById("create-account-panel").style.display = "none";
      return document.getElementById("login-panel").style.display = "block";
    });
    s3.addEventListener("click", () => {
      document.getElementById("forgot-password-panel").style.display = "none";
      return document.getElementById("login-panel").style.display = "block";
    });
    s4.addEventListener("click", () => {
      document.getElementById("forgot-password-panel").style.display = "block";
      return document.getElementById("login-panel").style.display = "none";
    });
    document.getElementById("login-window").addEventListener("click", (event) => {
      return event.stopPropagation();
    });
    document.getElementById("login-overlay").addEventListener("mousedown", (event) => {
      return document.getElementById("login-overlay").style.display = "none";
    });
    document.getElementById("login-window").addEventListener("mousedown", (event) => {
      return event.stopPropagation();
    });
    this.setAction("login-button", () => {
      return this.showLoginPanel();
    });
    this.setAction("guest-action-login", () => {
      return this.showLoginPanel();
    });
    this.setAction("guest-action-create", () => {
      return this.showCreateAccountPanel();
    });
    this.setAction("create-account-button", () => {
      return this.showCreateAccountPanel();
    });
    this.setAction("create-account-toggle-terms", () => {
      return this.toggleTerms();
    });
    this.setAction("guest-action-guest", () => {
      this.app.createGuest();
      return document.getElementById("login-overlay").style.display = "none";
    });
    document.querySelector(".username").addEventListener("mouseup", (event) => {
      return event.stopPropagation();
    });
    document.querySelector(".username").addEventListener("click", (event) => {
      var c, e, j, len, num, ref;
      e = document.querySelector(".usermenu");
      if (window.ms_standalone) {
        e.classList.add("standalone");
        e.classList.remove("regular");
      } else if (this.app.user.flags.guest || (this.app.user.email == null)) {
        e.classList.add("guest");
        e.classList.remove("regular");
      } else {
        e.classList.add("regular");
        e.classList.remove("guest");
      }
      if (e.style.height === "0px") {
        num = 0;
        ref = e.childNodes;
        for (j = 0, len = ref.length; j < len; j++) {
          c = ref[j];
          if (c.offsetParent != null) {
            num += 1;
          }
        }
        e.style.height = `${42 * num}px`;
        if (!this.usermenuclose) {
          return this.usermenuclose = document.body.addEventListener("mouseup", (event) => {
            return e.style.height = "0px";
          });
        }
      } else {
        return e.style.height = "0px";
      }
    });
    document.querySelector(".usermenu .logout").addEventListener("click", (event) => {
      return this.app.disconnect();
    });
    document.querySelector(".usermenu .settings").addEventListener("click", (event) => {
      return this.app.openUserSettings();
    });
    document.querySelector(".usermenu .profile").addEventListener("click", (event) => {
      return this.app.openUserProfile();
    });
    document.querySelector(".usermenu .progress").addEventListener("click", (event) => {
      return this.app.openUserProgress();
    });
    document.querySelector("#header-progress-summary").addEventListener("click", (event) => {
      return this.app.openUserProgress();
    });
    document.querySelector(".usermenu .create-account").addEventListener("click", (event) => {
      return this.showCreateAccountPanel();
    });
    document.querySelector(".usermenu .discard-account").addEventListener("click", (event) => {
      return this.app.disconnect();
    });
    document.querySelector("#language-setting").addEventListener("mouseup", (event) => {
      return event.stopPropagation();
    });
    this.createMainMenuFunction();
    document.querySelector("#language-setting").addEventListener("click", (event) => {
      var e;
      e = document.querySelector("#language-menu");
      if (!e.classList.contains("language-menu-open")) {
        e.classList.add("language-menu-open");
        if (!this.languagemenuclose) {
          return this.languagemenuclose = document.body.addEventListener("mouseup", (event) => {
            return e.classList.remove("language-menu-open");
          });
        }
      } else {
        return e.classList.remove("language-menu-open");
      }
    });
    ref = window.ms_languages;
    for (j = 0, len = ref.length; j < len; j++) {
      lang = ref[j];
      ((lang) => {
        if (document.querySelector(`#language-choice-${lang}`) != null) {
          document.querySelector(`#language-choice-${lang}`).addEventListener("click", (event) => {
            return this.setLanguage(lang);
          });
        }
        if (document.querySelector(`#switch-to-${lang}`) != null) {
          return document.querySelector(`#switch-to-${lang}`).addEventListener("click", (event) => {
            event.preventDefault();
            return this.setLanguage(lang);
          });
        }
      })(lang);
    }
    this.setAction("login-submit", () => {
      return this.app.login(this.get("login_nick").value, this.get("login_password").value);
    });
    this.setAction("create-account-submit", () => {
      if (!this.get("create-account-tos").checked) {
        return alert(this.app.translator.get("You must accept the terms of use in order to create an account."));
      }
      return this.app.createAccount(this.get("create_nick").value, this.get("create_email").value, this.get("create_password").value, this.get("create-account-newsletter").checked);
    });
    return this.setAction("forgot-submit", () => {
      return this.app.sendPasswordRecovery(document.getElementById("forgot_email").value);
    });
  }

  showLoginPanel() {
    this.setDisplay("login-overlay", "block");
    this.show("login-panel");
    this.hide("create-account-panel");
    this.hide("forgot-password-panel");
    return this.hide("guest-panel");
  }

  showCreateAccountPanel() {
    this.setDisplay("login-overlay", "block");
    this.hide("login-panel");
    this.show("create-account-panel");
    this.hide("forgot-password-panel");
    return this.hide("guest-panel");
  }

  userConnected(nick) {
    var text;
    if (this.nick === nick) {
      return;
    }
    this.hide("login-button");
    this.hide("create-account-button");
    this.nick = nick;
    if (this.app.user.flags.guest || (this.app.user.email == null)) {
      this.get("user-nick").innerHTML = this.app.translator.get("Guest");
      document.querySelector(".username i").classList.remove("fa-user");
      document.querySelector(".username i").classList.add("fa-user-clock");
      document.querySelector(".username").classList.add("guest");
    } else {
      document.querySelector(".username i").classList.add("fa-user");
      document.querySelector(".username i").classList.remove("fa-user-clock");
      document.querySelector(".username").classList.remove("guest");
      this.get("user-nick").innerHTML = nick;
      if (this.project != null) {
        this.updateProjectTitle();
        this.get("project-icon").src = location.origin + `/${this.project.owner.nick}/${this.project.slug}/${this.project.code}/icon.png`;
      }
      if (!this.app.user.flags.validated) {
        this.addWarningMessage(this.app.translator.get("Remember to validate your e-mail address"), "fa-exclamation-circle", "validate_email_" + Math.floor(Date.now() / 1000 / 3600 / 24 / 2), true);
      }
    }
    this.get("user-nick").style.display = "inline-block";
    //@show "user-info"
    this.show("login-info");
    this.hide("login-overlay");
    this.setMainSection("projects", location.pathname.length < 4); // home page with language variation => record jump to /projects/
    
    // @addWarningMessage """Join <a target="_blank" href="https://itch.io/jam/microstudio-mini-jam-2">microStudio mini-jam #2</a>! From October 24/25. More info in the <a target="_blank" href="https://microstudio.dev/community/news/mini-jam-2/235/">Community Forum</a> and <a target="_blank" href="https://discord.gg/BDMqjxd">Discord</a>""","fa-info-circle","mini_jam_2_#{Math.floor(Date.now()/1000/3600/12)}",true
    if (this.app.user.info.size > this.app.user.info.max_storage) {
      text = this.app.translator.get("Your account is out of space!");
      text += " " + this.app.translator.get("You are using %USED% of the %ALLOWED% you are allowed.").replace("%USED%", this.displayByteSize(this.app.user.info.size)).replace("%ALLOWED%", this.displayByteSize(this.app.user.info.max_storage));
      text += ` <a href='https://microstudio.dev/community/tips/your-account-is-out-of-space/109/' target='_blank'>${this.app.translator.get("More info...")}</a>`;
      this.addWarningMessage(text, void 0, "out_of_storage", false);
    }
    this.updateAiProviderVisibility();
    this.loadAiProviders();
  }

  //if not @project?
  //  @show "myprojects"
  //  @hide "projectview"
  //@get("menu-projects").style.display = "inline-block"
  //@setMainSection "projects"
  userDisconnected() {
    this.get("login-button").style.display = "block";
    this.get("user-nick").innerHTML = "nick";
    //@hide "menu-projects"
    this.hide("login-info");
    this.nick = null;
    this.clearAiDraft();
    this.updateAiProviderVisibility();
    return this.project = null;
  }

  //@get("user-info").style.display = "none"
  showLoginButton() {
    this.get("login-button").style.display = "block";
    return this.get("create-account-button").style.display = "block";
  }

  popMenu() {
    return document.querySelector("header").style.transform = "translateY(0%)";
  }

  createProjectBox(p) {
    var buttons, clone_button, delete_button, element, export_button, export_href, icon, pill, size, sizepill, title;
    element = document.createElement("a");
    element.classList.add("project-box");
    element.id = `project-box-${p.slug}`;
    element.href = `/projects/${p.slug}/code/`;
    element.dataset.title = p.title;
    element.dataset.description = p.description;
    element.dataset.tags = p.tags.join(",");
    if (p.public) {
      element.dataset.public = p.public;
    }
    buttons = document.createElement("div");
    buttons.classList.add("buttons");
    element.appendChild(buttons);
    if (p.size) {
      size = this.displayByteSize(p.size);
      sizepill = document.createElement("div");
      sizepill.innerText = size;
      sizepill.classList.add("pill", "bg-blue", "shadow5", 'marginbottom10', 'marginright10');
      buttons.appendChild(sizepill);
    }
    if (p.public) {
      pill = document.createElement("div");
      pill.innerHTML = "<i class=\"fa fa-eye\"></i> " + this.app.translator.get("public");
      pill.classList.add("pill", "bg-purple", "shadow5", 'marginbottom10');
      buttons.appendChild(pill);
    }
    export_href = `/${p.owner.nick}/${p.slug}/${p.code}/export/project/`;
    export_button = document.createElement("div");
    export_button.classList.add("button", "export", "shadow5");
    export_button.innerHTML = `<a href='${export_href}' download='${p.slug}_files.zip'><i class='fa fa-download'></i> ${this.app.translator.get("Export")}</a>`;
    buttons.appendChild(export_button);
    export_button.addEventListener("click", (event) => {
      event.stopPropagation();
      return event.stopImmediatePropagation();
    });
    clone_button = document.createElement("div");
    clone_button.classList.add("button", "clone", "shadow5");
    clone_button.innerHTML = `<i class='fa fa-copy'></i> ${this.app.translator.get("Clone")}`;
    buttons.appendChild(clone_button);
    clone_button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      return ConfirmDialog.confirm(this.app.translator.get("Do you want to clone this project?"), this.app.translator.get("Clone"), this.app.translator.get("Cancel"), () => {
        return this.app.cloneProject(p);
      });
    });
    delete_button = document.createElement("div");
    delete_button.classList.add("button", "delete", "shadow5");
    if (p.owner.nick === this.app.nick) {
      delete_button.innerHTML = `<i class='fa fa-trash-alt'></i> ${this.app.translator.get("Delete")}`;
    } else {
      delete_button.innerHTML = `<i class='fa fa-times'></i> ${this.app.translator.get("Quit")}`;
    }
    buttons.appendChild(delete_button);
    delete_button.addEventListener("click", (event) => {
      var msg, ok;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      msg = p.owner.nick === this.app.nick ? this.app.translator.get("Really delete this project?") : this.app.translator.get("Really quit this project?");
      ok = p.owner.nick === this.app.nick ? this.app.translator.get("Delete") : this.app.translator.get("Quit");
      return ConfirmDialog.confirm(msg, ok, this.app.translator.get("Cancel"), () => {
        return this.app.deleteProject(p);
      });
    });
    title = document.createElement("div");
    title.classList.add("project-title");
    title.innerText = p.title;
    element.appendChild(title);
    element.appendChild(document.createElement("br"));
    icon = new Image;
    icon.src = location.origin + `/${p.owner.nick}/${p.slug}/${p.code}/icon.png`;
    icon.classList.add("pixelated");
    element.appendChild(icon);
    if (p.poster) {
      element.style.background = `linear-gradient(to bottom, hsla(200,20%,20%,0.6), hsla(200,20%,20%,0.9)),url(/${p.owner.nick}/${p.slug}/${p.code}/poster.png)`;
      element.style["background-size"] = "cover";
      element.style["background-opacity"] = .5;
      icon.style.width = "104px";
      icon.style.height = "104px";
      icon.style["margin-top"] = "40px";
      icon.style["box-shadow"] = "0 0 10px 1px #000";
    }
    element.addEventListener("click", (event) => {
      if (!event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        return this.app.openProject(p);
      }
    });
    return element;
  }

  updateProjects() {
    var c, count, div, e, element, h2, j, k, len, len1, list, p, pending, ref;
    list = this.get("project-list");
    list.innerHTML = "";
    if (this.app.projects == null) {
      return;
    }
    document.querySelector("#projects-search input").value = "";
    this.app.projects.sort(function(a, b) {
      return b.last_modified - a.last_modified;
    });
    pending = [];
    count = 0;
    ref = this.app.projects;
    for (j = 0, len = ref.length; j < len; j++) {
      p = ref[j];
      if (p.owner.nick === this.app.nick || p.accepted) {
        element = this.createProjectBox(p);
        list.appendChild(element);
        count++;
      } else {
        pending.push(p);
      }
    }
    if (count === 0) {
      h2 = document.createElement("h2");
      h2.innerHTML = this.app.translator.get("Your projects will be displayed here.") + "<br />" + this.app.translator.get("Time to create your first project!");
      list.appendChild(h2);
    }
    if (pending.length > 0) {
      div = document.createElement("div");
      div.classList.add("project-invites-list");
      div.innerHTML = "<h2><i class='fa fa-users'></i> Pending invitations</h2>";
      for (k = 0, len1 = pending.length; k < len1; k++) {
        p = pending[k];
        e = document.createElement("div");
        e.classList.add("invite");
        e.innerHTML = `<div class="buttons">\n   <div class="accept" title="Accept" onclick="app.appui.acceptInvite(${p.id})"><i class="fa fa-check"></i></div><div class="reject" title="Reject" onclick="app.appui.rejectInvite(${p.id})"><i class="fa fa-times"></i></div>\n</div>\n<img src="/${p.owner.nick}/${p.slug}/${p.code}/icon.png"/> ${p.title} by ${p.owner.nick}`;
        div.appendChild(e);
      }
      list.insertBefore(div, list.firstChild);
    }
    //# create list of projects to accept or reject
    if (this.logged_callback != null) {
      c = this.logged_callback;
      this.logged_callback = null;
      c();
    } else {
      this.app.app_state.projectsFetched();
    }
  }

  acceptInvite(projectid) {
    var j, len, p, ref;
    ref = this.app.projects;
    for (j = 0, len = ref.length; j < len; j++) {
      p = ref[j];
      if (p.id === projectid && p.owner.nick !== this.app.nick && !p.accepted) {
        this.app.client.sendRequest({
          name: "accept_invite",
          project: projectid
        });
      }
    }
  }

  rejectInvite(projectid) {
    var j, len, p, ref;
    ref = this.app.projects;
    for (j = 0, len = ref.length; j < len; j++) {
      p = ref[j];
      if (p.id === projectid && p.owner.nick !== this.app.nick) {
        this.app.client.sendRequest({
          name: "remove_project_user",
          user: this.app.nick,
          project: projectid
        });
      }
    }
  }

  setProject(project1, useraction = true) {
    var j, len, ref, t, tab;
    this.project = project1;
    this.clearAiDraft();
    this.updateProjectTitle();
    this.get("project-icon").src = location.origin + `/${this.project.owner.nick}/${this.project.slug}/${this.project.code}/icon.png`;
    tab = "code";
    if ((this.project.tabs != null) && !this.app.tab_manager.isTabActive("code")) {
      tab = "options";
      ref = this.sections;
      for (j = 0, len = ref.length; j < len; j++) {
        t = ref[j];
        if (this.app.tab_manager.isTabActive(t)) {
          tab = t;
          break;
        }
      }
    }
    this.setSection(tab, useraction);
    this.show("projectview");
    this.hide("myprojects");
    this.project.addListener(this);
    this.code_splitbar.initPosition(50);
    this.debug_splitbar.closed2 = true;
    this.debug_splitbar.update();
    this.runtime_splitbar.initPosition(50);
    this.server_splitbar.initPosition(50);
    this.app.runwindow.terminal.start();
    this.updateActiveUsers();
    this.updateAiProviderVisibility();
    this.loadAiProviders((this.aiDraft != null && this.aiDraft.request != null ? this.aiDraft.request.providerProfileId : null) || null);
    return this.doc_splitbar.initPosition(50);
  }

  updateAiProviderVisibility() {
    var isAdmin, row;
    row = this.get("ai-generator-image-provider-row");
    if (row == null) {
      return;
    }
    isAdmin = (this.app.user != null) && (this.app.user.flags != null) && this.app.user.flags.admin;
    row.classList.toggle("hidden", !isAdmin);
    if (this.get("ai-generator-image-provider") != null) {
      this.get("ai-generator-image-provider").disabled = !isAdmin;
    }
    return this.updateAiProviderAdminNote();
  }

  updateAiProviderAdminNote() {
    var isLocalMode, note;
    note = this.get("ai-provider-admin-note");
    if (note == null) {
      return;
    }
    isLocalMode = (window.ms_realm != null) && window.ms_realm !== "production";
    note.textContent = "Keys are stored in plaintext in local mode.";
    return note.classList.toggle("hidden", !isLocalMode);
  }

  toggleAiProviderAdminPanel() {
    if (!((this.app.user != null) && (this.app.user.flags != null) && this.app.user.flags.admin)) {
      return;
    }
    this.aiProviderAdminOpen = !this.aiProviderAdminOpen;
    this.updateAiProviderAdminVisibility();
    if (this.aiProviderAdminOpen) {
      return this.loadAiAdminProviders(this.aiProviderDraftId);
    }
  }

  setAiProviderAdminStatus(text, isError = false) {
    var element;
    element = this.get("ai-provider-admin-status");
    if (element == null) {
      return;
    }
    element.textContent = text || "";
    return element.style.color = isError ? "#fecaca" : "rgba(191,219,254,.95)";
  }

  findAiProviderAdminProfile(providerId) {
    var i, len, provider, ref;
    ref = this.aiAdminProviders || [];
    for (i = 0, len = ref.length; i < len; i++) {
      provider = ref[i];
      if (`${provider.id}` === `${providerId}`) {
        return provider;
      }
    }
    return null;
  }

  showAiProviderEditor(provider) {
    this.aiProviderDraftId = provider != null ? `${provider.id}` : null;
    this.get("ai-provider-name").value = provider != null ? provider.name || "" : "";
    this.get("ai-provider-type").value = provider != null ? provider.type || "openai-compatible" : "openai-compatible";
    this.get("ai-provider-purpose").value = provider != null ? provider.purpose || "text" : "text";
    this.get("ai-provider-base-url").value = provider != null ? provider.baseUrl || "" : "";
    this.get("ai-provider-model-id").value = provider != null ? provider.modelId || "" : "";
    this.get("ai-provider-system-prompt").value = provider != null ? provider.systemPrompt || "" : "";
    this.get("ai-provider-api-key").value = "";
    this.get("ai-provider-temperature").value = (provider != null) && (provider.temperature != null) ? `${provider.temperature}` : "0.3";
    this.get("ai-provider-max-tokens").value = (provider != null) && (provider.maxTokens != null) ? `${provider.maxTokens}` : "4000";
    this.get("ai-provider-timeout-ms").value = (provider != null) && (provider.timeoutMs != null) ? `${provider.timeoutMs}` : "60000";
    this.get("ai-provider-enabled").checked = provider != null ? provider.enabled !== false : true;
    this.get("ai-provider-default").checked = provider != null ? provider.isDefault === true : false;
    this.setAiProviderAdminStatus(provider != null ? `Editing provider ${provider.id}` : "Creating new provider");
    this.renderAiProviderAdminList(this.aiAdminProviders || []);
    return this.updateAiProviderAdminNote();
  }

  collectAiProviderPayload() {
    var apiKey, payload;
    payload = {
      name: this.get("ai-provider-name").value.trim(),
      type: this.get("ai-provider-type").value,
      purpose: this.get("ai-provider-purpose").value,
      baseUrl: this.get("ai-provider-base-url").value.trim(),
      modelId: this.get("ai-provider-model-id").value.trim(),
      systemPrompt: this.get("ai-provider-system-prompt").value,
      temperature: parseFloat(this.get("ai-provider-temperature").value || "0.3"),
      maxTokens: parseInt(this.get("ai-provider-max-tokens").value || "4000", 10),
      timeoutMs: parseInt(this.get("ai-provider-timeout-ms").value || "60000", 10),
      enabled: this.get("ai-provider-enabled").checked,
      isDefault: this.get("ai-provider-default").checked
    };
    apiKey = this.get("ai-provider-api-key").value.trim();
    if (apiKey.length > 0) {
      payload.apiKey = apiKey;
    } else if (this.aiProviderDraftId == null) {
      payload.apiKey = "";
    }
    return payload;
  }

  renderAiProviderAdminList(providers) {
    var action, actions, button, container, i, len, meta, provider, ref, row, selectedId;
    container = this.get("ai-provider-admin-list");
    if (container == null) {
      return;
    }
    container.innerHTML = "";
    selectedId = this.aiProviderDraftId;
    ref = providers || [];
    for (i = 0, len = ref.length; i < len; i++) {
      provider = ref[i];
      row = document.createElement("div");
      row.classList.add("ai-provider-row");
      if (`${provider.id}` === `${selectedId}`) {
        row.classList.add("selected");
      }
      meta = document.createElement("div");
      meta.classList.add("ai-provider-row-meta");
      meta.innerHTML = "<strong></strong><span></span><span></span><span></span><span></span>";
      meta.childNodes[0].textContent = `${provider.name}${provider.isDefault ? " (default)" : ""}`;
      meta.childNodes[1].textContent = `${provider.type} / ${provider.purpose} / ${provider.modelId || ""}`;
      meta.childNodes[2].textContent = provider.baseUrl || "";
      meta.childNodes[3].textContent = provider.enabled === false ? "disabled" : provider.hasApiKey ? "key stored" : "no key";
      meta.childNodes[4].textContent = provider.hasSystemPrompt ? "custom system prompt" : "default prompt";
      actions = document.createElement("div");
      actions.classList.add("ai-provider-row-actions");
      for (action of [["Edit", "edit-provider"], ["Test", "test-provider"], ["Default", "set-default-provider"], ["Delete", "delete-provider"]]) {
        button = document.createElement("button");
        button.textContent = action[0];
        button.dataset.action = action[1];
        button.dataset.providerId = `${provider.id}`;
        actions.appendChild(button);
      }
      row.appendChild(meta);
      row.appendChild(actions);
      container.appendChild(row);
    }
  }

  loadAiAdminProviders(selectedId = null) {
    if (!((this.app.user != null) && (this.app.user.flags != null) && this.app.user.flags.admin)) {
      return Promise.resolve([]);
    }
    this.setAiProviderAdminStatus("Loading provider profiles...");
    return this.requestJson("GET", "/api/admin/ai/providers?purpose=text").then((data) => {
      var chosen, providers;
      providers = Array.isArray(data != null ? data.providers : void 0) ? data.providers : [];
      this.aiAdminProviders = providers;
      this.renderAiProviderAdminList(providers);
      chosen = null;
      if (selectedId != null) {
        chosen = this.findAiProviderAdminProfile(selectedId);
      } else if (this.aiProviderDraftId != null) {
        chosen = this.findAiProviderAdminProfile(this.aiProviderDraftId);
      } else if (providers.length > 0) {
        chosen = providers[0];
      }
      if (chosen != null) {
        this.showAiProviderEditor(chosen);
      }
      this.setAiProviderAdminStatus(`Loaded ${providers.length} provider profiles.`);
      return providers;
    }, (err) => {
      this.aiAdminProviders = [];
      this.renderAiProviderAdminList([]);
      this.setAiProviderAdminStatus((err != null ? err.message : void 0) || "Failed to load provider profiles", true);
      return [];
    });
  }

  saveAiProvider() {
    var method, payload, url;
    if (!((this.app.user != null) && (this.app.user.flags != null) && this.app.user.flags.admin)) {
      return;
    }
    payload = this.collectAiProviderPayload();
    if (!payload.name.length || !payload.baseUrl.length || !payload.modelId.length) {
      this.setAiProviderAdminStatus("Name, base URL, and model ID are required.", true);
      return;
    }
    if (this.aiProviderDraftId != null) {
      url = `/api/admin/ai/providers/${this.aiProviderDraftId}`;
      method = "PATCH";
    } else {
      url = "/api/admin/ai/providers";
      method = "POST";
    }
    this.setAiProviderAdminStatus("Saving provider...");
    return this.requestJson(method, url, payload).then((data) => {
      var provider, selected;
      provider = (data != null ? data.provider : void 0) || null;
      this.setAiProviderAdminStatus("Provider saved.");
      selected = provider != null ? provider.id : this.aiProviderDraftId;
      this.loadAiAdminProviders(selected);
      this.loadAiProviders(selected);
      if (provider != null) {
        return this.showAiProviderEditor(provider);
      }
    }, (err) => {
      return this.setAiProviderAdminStatus((err != null ? err.message : void 0) || "Failed to save provider", true);
    });
  }

  deleteAiProvider(providerId) {
    if (providerId == null) {
      return;
    }
    if (!confirm("Delete this provider profile?")) {
      return;
    }
    this.setAiProviderAdminStatus("Deleting provider...");
    return this.requestJson("DELETE", `/api/admin/ai/providers/${providerId}`).then((data) => {
      var wasSelected;
      this.setAiProviderAdminStatus("Provider deleted.");
      wasSelected = `${this.aiProviderDraftId}` === `${providerId}`;
      if (wasSelected) {
        this.aiProviderDraftId = null;
        this.showAiProviderEditor(null);
      }
      this.loadAiAdminProviders();
      return this.loadAiProviders();
    }, (err) => {
      return this.setAiProviderAdminStatus((err != null ? err.message : void 0) || "Failed to delete provider", true);
    });
  }

  testAiProvider(providerId) {
    if (providerId == null) {
      return;
    }
    this.setAiProviderAdminStatus("Testing provider...");
    return this.requestJson("POST", `/api/admin/ai/providers/${providerId}/test`, {}).then((data) => {
      return this.setAiProviderAdminStatus(`Test ok: ${data.providerName || data.providerId}`);
    }, (err) => {
      return this.setAiProviderAdminStatus((err != null ? err.message : void 0) || "Provider test failed", true);
    });
  }

  setDefaultAiProvider(providerId) {
    if (providerId == null) {
      return;
    }
    this.setAiProviderAdminStatus("Setting default provider...");
    return this.requestJson("POST", `/api/admin/ai/providers/${providerId}/set-default`, {}).then((data) => {
      this.setAiProviderAdminStatus("Default provider updated.");
      this.loadAiAdminProviders(providerId);
      return this.loadAiProviders(providerId);
    }, (err) => {
      return this.setAiProviderAdminStatus((err != null ? err.message : void 0) || "Failed to set default provider", true);
    });
  }

  updateProjectTitle() {
    var html;
    if (this.project != null) {
      html = this.project.title;
      if (this.project.public) {
        html += ` <div class="pill bg-purple shadow5 marginleft10"><i class="fa fa-eye"></i> ${this.app.translator.get("public")}</div>`;
      }
      return this.get("project-name").innerHTML = html;
    }
  }

  projectUpdate(change) {
    var icon, img;
    if (change === "spritelist") {
      icon = this.project.getSprite("icon");
      if (icon != null) {
        icon.addImage(this.get("project-icon"), 32);
        img = document.querySelector(`#project-box-${this.project.slug} img`);
        if (img != null) {
          return icon.addImage(img, 144);
        }
      }
    } else if (change === "title" || change === "public") {
      return this.updateProjectTitle();
    } else if (change === "locks") {
      return this.updateActiveUsers();
    }
  }

  updateActiveUsers() {
    var div, e, element, i, j, key, list, name, names, ref, span;
    element = document.querySelector(".projectheader #active-project-users");
    list = element.childNodes;
    names = {};
    for (i = j = ref = list.length - 1; j >= 0; i = j += -1) {
      e = list[i];
      name = e.id.split("-")[2];
      if (this.project.friends[name] == null) {
        element.removeChild(e);
      } else {
        names[name] = true;
      }
    }
    for (key in this.project.friends) {
      if (!names[key]) {
        div = document.createElement("div");
        div.style = `background:${this.createFriendColor(key)}`;
        div.id = `active-user-${key}`;
        i = document.createElement("i");
        i.classList.add("fa");
        i.classList.add("fa-user");
        div.appendChild(i);
        span = document.createElement("span");
        span.innerText = key;
        div.appendChild(span);
        element.appendChild(div);
      }
    }
  }

  createFriendColor(friend) {
    var i, j, ref, seed;
    seed = 137;
    for (i = j = 0, ref = friend.length - 1; j <= ref; i = j += 1) {
      seed = (seed + friend.charCodeAt(i) * 31 + 97) % 360;
    }
    return `hsl(${seed},50%,50%)`;
  }

  startSaveStatus() {
    this.savetick = 0;
    return setInterval((() => {
      return this.checkSaveStatus();
    }), 500);
  }

  checkSaveStatus() {
    var e, t;
    if (this.project == null) {
      return;
    }
    e = document.getElementById("save-status");
    switch (this.save_status) {
      case "saving":
        if (this.project.pending_changes.length === 0) {
          this.save_status = "saved";
          e.classList.remove("fa-ellipsis-h");
          e.classList.add("fa-check");
          e.style.color = "hsl(160,50%,70%)";
          e.style.opacity = 1;
          return e.style.transform = "scale(1.1)";
        } else {
          this.savetick = (this.savetick + 1) % 2;
          t = .9 + this.savetick * .2;
          return e.style.transform = `scale(${t})`;
        }
        break;
      case "saved":
        e.style.opacity = 0;
        e.style.transform = "scale(.9)";
        return this.save_status = "";
      default:
        if (this.project.pending_changes.length > 0) {
          this.save_status = "saving";
          e.classList.add("fa-ellipsis-h");
          e.classList.remove("fa-check");
          e.style.color = "hsl(0,50%,70%)";
          e.style.opacity = 1;
          return e.style.transform = "scale(1)";
        }
    }
  }

  toggleTerms() {
    if (this.terms_shown) {
      this.terms_shown = false;
      return this.get("create-account-terms").style.display = "none";
    } else {
      this.terms_shown = true;
      this.get("create-account-terms").style.display = "block";
      return this.app.about.load("terms", (text) => {
        return this.get("create-account-terms").innerHTML = DOMPurify.sanitize(marked(text));
      });
    }
  }

  showNotification(text) {
    document.querySelector("#notification-bubble span").innerText = text;
    document.getElementById("notification-container").style.transform = "translateY(0px)";
    return setTimeout((() => {
      return document.getElementById("notification-container").style.transform = "translateY(-150px)";
    }), 5000);
  }

  setLanguage(lang) {
    var date;
    if ((document.cookie != null) && document.cookie.indexOf(`language=${lang}`) >= 0) {
      return;
    }
    date = new Date();
    date.setTime(date.getTime() + 1000 * 3600 * 24 * 60);
    document.cookie = `language=${lang};expires=${date.toUTCString()};path=/`;
    return window.location = location.origin + (lang !== "en" ? `/${lang}/` : ""); //+"?t=#{Date.now()}"
  }

  displayByteSize(size) {
    if (size < 1000) {
      return `${size} ${this.app.translator.get("Bytes")}`;
    } else if (size < 10000) {
      return `${(size / 1000).toFixed(1)} ${this.app.translator.get("Kb")}`;
    } else if (size < 1000000) {
      return `${Math.floor(size / 1000)} ${this.app.translator.get("Kb")}`;
    } else if (size < 10000000) {
      return `${(size / 1000000).toFixed(1)} ${this.app.translator.get("Mb")}`;
    } else if (size < 1000000000) {
      return `${Math.floor(size / 1000000)} ${this.app.translator.get("Mb")}`;
    } else {
      return `${(size / 1000000000).toFixed(1)} ${this.app.translator.get("Gb")}`;
    }
  }

  createUserTag(nick, tier, pic = false, picmargin) {
    var div, i, icon, span;
    div = document.createElement("a");
    div.classList.add("usertag");
    if (tier) {
      div.classList.add(tier);
    }
    i = document.createElement("i");
    i.classList.add("fa");
    i.classList.add("fa-user");
    div.appendChild(i);
    span = document.createElement("span");
    span.innerText = nick;
    div.appendChild(span);
    if (tier) {
      icon = new Image;
      icon.src = location.origin + `/microstudio/patreon/badges/sprites/${tier}.png`;
      icon.classList.add("pixelated");
      icon.style = "width: 32px; height: 32px;";
      icon.alt = icon.title = this.app.getTierName(tier);
      div.appendChild(icon);
    }
    div.href = `/${nick}/`;
    div.target = "_blank";
    div.addEventListener("click", function(event) {
      return event.stopPropagation();
    });
    if (pic) {
      pic = document.createElement("img");
      pic.src = `/${nick}.png`;
      pic.classList.add("profile");
      div.appendChild(pic);
      if (picmargin) {
        div.style["margin-left"] = `${picmargin}px`;
      }
    }
    return div;
  }

  setImportProgress(progress) {
    document.getElementById("import-project-button").innerHTML = "<i class=\"fa fa-upload\"></i> Uploading... ";
    progress = Math.round(progress);
    return document.getElementById("import-project-button").style.background = `linear-gradient(90deg,hsl(200,50%,40%) 0%,hsl(200,50%,40%) ${progress}%,hsl(200,20%,20%) ${progress}%)`;
  }

  resetImportButton() {
    document.getElementById("import-project-button").innerHTML = `<i class="fa fa-upload"></i> ${this.app.translator.get("Import Project")}`;
    return document.getElementById("import-project-button").style.removeProperty("background");
  }

  bumpElement(select) {
    var element, interval, start;
    element = document.querySelector(select);
    if (element != null) {
      start = Date.now();
      return interval = setInterval((function() {
        var d, s, t;
        t = (Date.now() - start) / 300;
        if (t >= 1) {
          element.style.transform = "none";
          return clearInterval(interval);
        } else {
          t = Math.pow(t, .8);
          s = 1 + .5 * Math.sin(t * Math.PI);
          d = -.5 * Math.sin(t * Math.PI) * 20;
          return element.style.transform = `scale(${s}) rotateZ(${d}deg)`;
        }
      }), 16);
    }
  }

  createFullscreenFeatures() {
    var button;
    button = document.getElementById("project-fullscreen");
    button.addEventListener("click", () => {
      if (document.fullscreenElement) {
        return document.exitFullscreen();
      } else {
        document.getElementById("projectview").requestFullscreen();
        return document.getElementById("projectview").style.background = "hsl(200,20%,15%)";
      }
    });
    return window.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        button.classList.remove("fa-expand");
        return button.classList.add("fa-compress");
      } else {
        button.classList.add("fa-expand");
        button.classList.remove("fa-compress");
        return document.getElementById("projectview").style.background = "none";
      }
    });
  }

  createMainMenuFunction() {
    var bump, button, closing, displayed, menu, resize;
    button = document.getElementById("main-menu-button");
    menu = document.querySelector(".titlemenu");
    closing = false;
    displayed = false;
    bump = () => {
      var f, t;
      t = Date.now();
      f = () => {
        var rr, tt;
        tt = Date.now() - t;
        if (tt < 250) {
          tt = 1 - tt / 250;
          tt = Math.pow(tt, 2);
          rr = tt;
          tt = 1 + tt * .5;
          button.style.transform = `scale(${tt},${tt}) rotate(${-rr * 10}deg)`;
          return setTimeout(f, 16);
        } else {
          return button.style.transform = "none";
        }
      };
      return f();
    };
    button.addEventListener("click", (event) => {
      if (menu.style.left !== "0%" && !closing) {
        menu.style.left = "0%";
        return bump();
      } else {
        menu.style.left = "-100%";
        return bump();
      }
    });
    document.addEventListener("mouseup", () => {
      if ((button.offsetParent != null) && menu.style.left !== "-100%") {
        menu.style.left = "-100%";
        closing = true;
        return bump();
      } else {
        return closing = false;
      }
    });
    resize = () => {
      if (button.offsetParent == null) {
        menu.style.left = "0px";
        return displayed = false;
      } else if (menu.style.left !== "0%") {
        menu.style.left = "-100%";
        if (!displayed) {
          displayed = true;
          return bump();
        }
      }
    };
    window.addEventListener("resize", resize);
    return resize();
  }

  createProjectSideBarCollapse() {
    var collapse_time, resize_until;
    collapse_time = 0;
    resize_until = Date.now();
    this.makeProjectSideBarVisible = () => {
      if (document.getElementById("projectview").classList.contains("sidebar-collapsed")) {
        document.getElementById("projectview").classList.remove("sidebar-collapsed");
        window.dispatchEvent(new Event('resize'));
      }
      if (window.innerWidth < 600) {
        return collapse_time = Date.now() + 3000;
      }
    };
    window.addEventListener("resize", () => {
      if (!document.getElementById("projectview").classList.contains("sidebar-collapsed") && window.innerWidth < 600) {
        return collapse_time = Date.now() + 3000;
      } else if (document.getElementById("projectview").classList.contains("sidebar-collapsed") && window.innerWidth >= 600) {
        return this.makeProjectSideBarVisible();
      }
    });
    return setInterval((() => {
      if (Date.now() < resize_until) {
        window.dispatchEvent(new Event('resize'));
      }
      if (collapse_time && Date.now() > collapse_time) {
        collapse_time = 0;
        if (window.innerWidth < 600) {
          document.getElementById("projectview").classList.add("sidebar-collapsed");
          return window.dispatchEvent(new Event('resize'));
        }
      }
    }), 500);
  }

  createProjectLikesButton(element, project) {
    var e, likes;
    e = element.querySelector(".likes-button");
    if (e) {
      e.parentNode.removeChild(e);
    }
    likes = document.createElement("div");
    likes.classList.add("likes-button");
    likes.innerHTML = "<i class='fa fa-thumbs-up'></i> " + project.likes;
    if (project.liked) {
      likes.classList.add("liked");
    }
    element.appendChild(likes);
    return likes.addEventListener("click", () => {
      event.stopImmediatePropagation();
      if (!this.app.user.flags.validated) {
        return alert(this.app.translator.get("Validate your e-mail address to enable votes."));
      }
      return this.app.client.sendRequest({
        name: "toggle_like",
        project: project.id
      }, (msg) => {
        if (msg.name === "project_likes") {
          project.likes = msg.likes;
          project.liked = msg.liked;
          return this.createProjectLikesButton(element, project);
        }
      });
    });
  }

};
