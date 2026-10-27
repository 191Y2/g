/* ⛂ Archive — game player: embeds, display modes, fullscreen, tools bridge. */
(function () {
  "use strict";

  var MODES = [
    { id: "fit", label: "Fit", title: "Fit \u2014 fill the frame" },
    { id: "natural", label: "Original", title: "Original \u2014 960\u00d7540 centered" }
  ];

  var Player = {
    current: null,
    mode: "fit",
    stageEl: null,
    iframeEl: null,
    localManifest: null,   // slug -> "g" once games/manifest.json loads

    loadManifest: function () {
      if (this.localManifest !== null) return Promise.resolve(this.localManifest);
      var self = this;
      return fetch("games/manifest.json", { cache: "no-cache" })
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(function (m) { self.localManifest = m || {}; return self.localManifest; })
        .catch(function () { self.localManifest = {}; return self.localManifest; });
    },

    urlFor: function (g) {
      if (g.kind === "drive") {
        // local copy first (school networks block Drive); Drive is the fallback
        if (g.key && this.localManifest && this.localManifest[g.key] === "g") {
          return window.ARCHIVE.localPath(g.key);
        }
        return window.ARCHIVE.drivePreview(g.id);
      }
      if (g.kind === "link") return g.url;
      if (g.kind === "html") return g.blobUrl;
      return null;
    },

    open: function (g) {
      var self = this;
      var go = function () { self._open(g); };
      if (g.kind === "drive" && this.localManifest === null) {
        this.loadManifest().then(go, go);
      } else { go(); }
    },

    _open: function (g) {
      var self = this;
      this.current = g;
      this.mode = "fit";
      var view = document.getElementById("view");
      view.innerHTML = "";
      view.scrollTop = 0;

      var wrap = document.createElement("div");
      wrap.className = "player";
      wrap.innerHTML =
        '<div class="pbar">' +
        '  <a class="back" href="' + backHref(g) + '"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>Back</a>' +
        '  <span class="ptitle"></span>' +
        '  <span class="pspacer"></span>' +
        '  <button class="pbtn" data-a="reload" title="Reload game"><svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3v4h-4"/></svg>Reload</button>' +
        '  <button class="pbtn" data-a="mode" title="Display mode">Mode: Fit</button>' +
        '  <button class="pbtn" data-a="fs" title="Fullscreen (F)"><svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>Fullscreen</button>' +
        '  <button class="pbtn" data-a="ac" title="Auto clicker"><svg viewBox="0 0 24 24"><path d="M9 3.5v7L4.8 18a2.4 2.4 0 0 0 2 3.5h10.4a2.4 2.4 0 0 0 2-3.5L15 10.5v-7z"/><path d="M7 3.5h10"/></svg>Clicker</button>' +
        '  <button class="pbtn" data-a="direct" title="Open the source in a new tab"><svg viewBox="0 0 24 24"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 13v6H5V6h6"/></svg>Direct</button>' +
        '</div>' +
        '<div class="pstage fit">' +
        '  <div class="pload"><div class="spinner"></div><div class="pload-t">Loading\u2026</div>' +
        '  <button class="btn btn-secondary btn-sm pload-open" style="display:none">Open the game directly</button></div>' +
        '</div>';
      view.appendChild(wrap);

      wrap.querySelector(".ptitle").textContent = g.name;
      var stage = wrap.querySelector(".pstage");
      var loader = wrap.querySelector(".pload");
      this.stageEl = stage;
      var iframe = document.createElement("iframe");
      this.iframeEl = iframe;
      iframe.setAttribute("allow", "fullscreen; autoplay; gamepad; pointer-lock; clipboard-write");
      iframe.setAttribute("allowfullscreen", "true");
      if (g.kind === "html") {
        // uploaded files: fully isolated origin (no same-origin), shim inside provides storage + tools
        iframe.setAttribute("sandbox", "allow-scripts allow-forms allow-pointer-lock allow-popups allow-downloads allow-modals");
      }
      iframe.src = this.urlFor(g);
      stage.appendChild(iframe);

      var loaded = false;
      iframe.addEventListener("load", function () { loaded = true; loader.style.display = "none"; });
      setTimeout(function () { if (!loaded) { wrap.querySelector(".pload-open").style.display = "inline-flex"; } }, 12000);
      wrap.querySelector(".pload-open").onclick = function () { self.openDirect(); };
      wrap.querySelector(".pload-t").textContent = "Loading\u2026";

      // toolbar actions
      wrap.querySelectorAll(".pbtn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var a = btn.dataset.a;
          if (a === "reload") {
            loader.style.display = "flex";
            loaded = false;
            var base = self.urlFor(g);
            iframe.src = "about:blank";
            setTimeout(function () { iframe.src = base; }, 40);
          } else if (a === "mode") {
            self.mode = self.mode === "fit" ? "natural" : "fit";
            stage.classList.toggle("natural", self.mode === "natural");
            btn.textContent = "Mode: " + (self.mode === "fit" ? "Fit" : "Original");
          } else if (a === "fs") {
            self.fullscreen(stage);
          } else if (a === "ac") {
            var T = window.Tools;
            if (T.AC.panel && !T.AC.panel.hidden) T.AC.hide(); else { T.AC.show(); T.toast("Auto clicker ready."); }
          } else if (a === "direct") {
            self.openDirect();
          }
        });
      });

      // F for fullscreen when player visible
      this._key = function (e) {
        if (e.key === "f" || e.key === "F") {
          var tag = (e.target && e.target.tagName) || "";
          if (tag === "INPUT" || tag === "TEXTAREA") return;
          self.fullscreen(stage);
        }
      };
      document.addEventListener("keydown", this._key);
      this._wrap = wrap;
    },

    fullscreen: function (stage) {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (stage.requestFullscreen) stage.requestFullscreen().catch(function () { });
    },

    openDirect: function () {
      var g = this.current;
      var url = null;
      if (g.kind === "drive") {
        url = (g.key && this.localManifest && this.localManifest[g.key] === "g")
          ? window.ARCHIVE.localPath(g.key) : window.ARCHIVE.driveView(g.id);
      }
      else if (g.kind === "link") url = g.view || g.url;
      else if (g.kind === "html") url = g.blobUrl;
      if (url) window.open(url, "_blank");
    },

    /* send a message to the game iframe (used by autoclicker bridge) */
    bridge: function (fn) {
      if (this.iframeEl && this.iframeEl.contentWindow) {
        try { fn(this.iframeEl.contentWindow); } catch (e) { }
      }
    },

    close: function () {
      if (this._key) document.removeEventListener("keydown", this._key);
      if (this.iframeEl) {
        var g = this.current;
        if (g && g.kind === "html" && g.blobUrl && g.blobRevoke !== false) {
          try { URL.revokeObjectURL(g.blobUrl); } catch (e) { }
        }
      }
      this.iframeEl = null;
      this.stageEl = null;
      this._key = null;
    },

    /* helper: resolve an archive game object to a playable object */
    resolve: function (driveId, cb) {
      var games = window.ARCHIVE.games;
      for (var i = 0; i < games.length; i++) {
        if (games[i][0] === driveId) {
          var g = games[i];
          cb({ kind: "drive", id: g[0], key: g[1], name: g[2], genre: g[3], series: g[4], platform: g[5] });
          return;
        }
      }
      cb(null);
    }
  };

  function backHref(g) {
    if (g.series) return "#/series/" + g.series;
    return "#/library";
  }

  window.Player = Player;
})();
