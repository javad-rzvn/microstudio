this.LibManager = class LibManager {
  constructor(app) {
    this.app = app;
    this.known_libs = {};
  }

  projectOpened() {}

  // @active_libs = {}
  // @updateLibSelection()
  tabOpened() {
    this.active_libs = {};
    return this.updateLibSelection();
  }

  createLibBox(project) {
    var desc, div, e, i, id, len, list, nick, path, user;
    console.info(project);
    nick = typeof project.owner === "string" ? project.owner : project.owner.nick;
    id = project.id;
    path = `/${nick}/${project.slug}`;
    if (project.code != null) {
      path += `/${project.code}`;
    }
    this.known_libs[id] = {
      nick: nick,
      slug: project.slug,
      title: project.title,
      code: project.code,
      url: `${location.origin}${path}/`,
      language: project.language
    };
    div = document.createElement("div");
    div.classList.add("lib-box");
    div.dataset.id = id;
    desc = project.description;
    if (desc.length > 300) {
      desc = desc.substring(0, 300) + " (...)";
    }
    div.innerHTML = `<img class="pixelated icon" src="${location.origin}${path}/sprites/icon.png"/>\n<div class="description md dark">\n  <div class="plugin-author"></div>\n  <h4>${project.title}</h4>\n  <p>${DOMPurify.sanitize(marked(desc))}</p>\n  <div class="docbutton"><i class="fa fa-book-open"></i> ${this.app.translator.get("Documentation")}</div>\n${(project.code == null ? `<a class="docbutton" href="${location.origin}/i/${nick}/${project.slug}/" target="_blank"><i class="fa fa-eye"></i> ${this.app.translator.get("Library Details")}</a>` : "")}\n  <i class="fa fa-check check"></i>\n</div>`;
    list = div.getElementsByTagName("a");
    for (i = 0, len = list.length; i < len; i++) {
      e = list[i];
      e.target = "_blank";
      e.addEventListener("click", (event) => {
        return event.stopPropagation();
      });
    }
    if (project.owner_info) {
      user = this.app.appui.createUserTag(nick, project.owner_info.tier, project.owner_info.profile_image, 20);
    } else if (project.owner.nick === this.app.user.nick) {
      user = this.app.appui.createUserTag(this.app.user.nick, this.app.user.flags.tier || "", this.app.user.flags.profile_image, 20);
    } else {
      user = this.app.appui.createUserTag(project.owner.nick, "", false, 20);
    }
    div.querySelector(".plugin-author").appendChild(user);
    div.id = `lib-box-${id}`;
    div.addEventListener("click", () => {
      if (div.querySelector("input") !== document.activeElement) {
        return this.toggleLib(id);
      }
    });
    div.querySelector(".docbutton").addEventListener("click", (event) => {
      event.stopPropagation();
      return this.openDoc(id);
    });
    return div;
  }

  toggleLib(id) {
    if (this.isLibActive(id)) {
      return this.setLibActive(id, false);
    } else {
      return this.setLibActive(id, true);
    }
  }

  resetLibs() {
    return this.libs_fetched = false;
  }

  fetchAvailableLibs(callback) {
    var box, i, len, p, ref, your_libs, your_list;
    if (this.libs_fetched) {
      return callback();
    }
    this.libs_fetched = true;
    your_libs = document.querySelector("#your-libs");
    your_list = document.querySelector("#your-libs .lib-list");
    your_list.innerHTML = "";
    ref = this.app.projects;
    for (i = 0, len = ref.length; i < len; i++) {
      p = ref[i];
      if (p.type === "library") {
        box = this.createLibBox(p);
        your_list.appendChild(box);
      }
    }
    if (your_list.childNodes.length === 0) {
      your_libs.style.display = "none";
    } else {
      your_libs.style.display = "block";
    }
    return this.app.client.sendRequest({
      name: "get_public_libraries"
    }, (msg) => {
      var j, len1, public_libs, public_list, ref1;
      console.info(msg.list);
      public_libs = document.querySelector("#public-libs");
      public_list = document.querySelector("#public-libs .lib-list");
      ref1 = msg.list;
      for (j = 0, len1 = ref1.length; j < len1; j++) {
        p = ref1[j];
        if (this.known_libs[p.id] == null) {
          box = this.createLibBox(p);
          public_list.appendChild(box);
        }
      }
      if (public_list.childNodes.length === 0) {
        public_libs.style.display = "none";
      } else {
        public_libs.style.display = "block";
      }
      return callback();
    });
  }

  updateLibSelection() {
    return this.fetchAvailableLibs(() => {
      var e, i, key, len, lib, libs, list, ref, value;
      list = document.querySelectorAll(".lib-box");
      libs = this.app.project.libraries || {};
      for (i = 0, len = list.length; i < len; i++) {
        e = list[i];
        if (libs[e.dataset.id]) {
          e.classList.add("selected");
        } else {
          e.classList.remove("selected");
        }
        lib = this.known_libs[e.dataset.id];
        if ((lib != null) && lib.language.split("_")[0] === this.app.project.language.split("_")[0]) {
          e.style.display = "block";
        } else {
          e.style.display = "none";
        }
      }
      for (key in libs) {
        value = libs[key];
        if (!this.active_libs[key]) {
          this.active_libs[key] = value;
          this.createLibUI(key);
        }
      }
      ref = this.active_libs;
      for (key in ref) {
        value = ref[key];
        if (!libs[key]) {
          delete this.active_libs[key];
          this.app.documentation.removeLib(key);
        }
      }
    });
  }

  isLibActive(id) {
    var libs, p;
    p = this.app.project;
    if (!p) {
      return false;
    }
    libs = p.libraries || {};
    return libs[id] != null;
  }

  setLibActive(id, active) {
    var p;
    p = this.app.project;
    if (p.libraries == null) {
      p.libraries = {};
    }
    if (active) {
      p.libraries[id] = {
        active: true
      };
    } else {
      delete p.libraries[id];
    }
    this.updateLibSelection();
    if (active) {
      this.install(id);
    } else {
      this.remove(id);
    }
    return this.app.client.sendRequest({
      name: "set_project_option",
      project: this.app.project.id,
      option: "libraries",
      value: p.libraries
    }, (msg) => {});
  }

  createLibUI(id) {
    var data, doc_url, path;
    data = this.known_libs[id];
    if (data == null) {
      return;
    }
    if (data.code != null) {
      path = `${data.nick}/${data.slug}/${data.code}`;
    } else {
      path = `${data.nick}/${data.slug}`;
    }
    doc_url = `${location.origin}/${path}/doc/doc.md`;
    return this.app.documentation.addLib(id, data.title, doc_url);
  }

  openDoc(id) {
    var data, doc_url, path;
    this.createLibUI(id);
    data = this.known_libs[id];
    if (data == null) {
      return;
    }
    if (data.code != null) {
      path = `${data.nick}/${data.slug}/${data.code}`;
    } else {
      path = `${data.nick}/${data.slug}`;
    }
    doc_url = `${location.origin}/${path}/doc/doc.md`;
    this.app.documentation.setSection(id, (() => {}), doc_url);
    return this.app.appui.setMainSection("help", true);
  }

  projectClosed() {
    this.app.documentation.removeAllLibs();
  }

  install(id) {
    var lib, sourceRoot;
    lib = this.known_libs[id];
    if (lib != null) {
      sourceRoot = String(lib.language || "").toLowerCase() === "javascript" ? "js" : "ms";
      return this.app.client.sendRequest({
        name: "list_project_files",
        project: id,
        folder: sourceRoot
      }, (msg) => {
        var f, files, i, j, k, len, len1, len2, ref, ref1, results;
        console.info(msg.files);
        files = [];
        ref = msg.files;
        for (i = 0, len = ref.length; i < len; i++) {
          f = ref[i];
          if (f.file.startsWith("lib-")) {
            files.push(f);
          }
        }
        if (files.length === 0) {
          ref1 = msg.files;
          for (j = 0, len1 = ref1.length; j < len1; j++) {
            f = ref1[j];
            if (!f.file.includes("demo") && !f.file.includes("main") && !f.file.includes("test") && !f.file.includes("example")) {
              files.push(f);
            }
          }
        }
        if (files.length === 0) {
          files = msg.files;
        }
        results = [];
        for (k = 0, len2 = files.length; k < len2; k++) {
          f = files[k];
          results.push(((f) => {
            var name;
            name = f.file;
            if (name.startsWith("lib-")) {
              name = name.substring(4);
            }
            name = `lib-${RegexLib.fixFilename(lib.nick)}-${RegexLib.fixFilename(lib.slug)}-${name.substring(0, name.length - 3)}`;
            return this.app.client.sendRequest({
              name: "read_project_file",
              project: id,
              file: this.app.project.sourcePath(f.file)
            }, (msg) => {
              console.info(msg.content);
              return this.app.project.writeSourceFile(name, msg.content);
            });
          })(f));
        }
        return results;
      });
    }
  }

  remove(id) {
    var file, i, j, len, len1, lib, list, ref, results, start;
    lib = this.known_libs[id];
    if (lib != null) {
      start = `lib-${RegexLib.fixFilename(lib.nick)}-${RegexLib.fixFilename(lib.slug)}`;
      list = [];
      ref = this.app.project.source_list;
      for (i = 0, len = ref.length; i < len; i++) {
        file = ref[i];
        if (file.name.startsWith(start)) {
          list.push(file);
        }
      }
      results = [];
      for (j = 0, len1 = list.length; j < len1; j++) {
        file = list[j];
        results.push(this.app.client.sendRequest({
          name: "delete_project_file",
          project: this.app.project.id,
          file: this.app.project.sourcePath(file.name)
        }, (msg) => {
          console.info(msg);
          return this.app.project.updateSourceList();
        }));
      }
      return results;
    }
  }

};
