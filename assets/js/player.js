/* ⛂ Archive — game player: embeds, display modes, fullscreen, tools bridge. */
(function () {
  "use strict";

  var MODES = [
    { id: "fit", label: "Fit", title: "Fit \u2014 fill the frame" },
    { id: "natural", label: "Original", title: "Original \u2014 960\u00d7540 centered" }
  ];

  /* self-contained games packed in games/bundle.json — fetched once,
     cached in memory, each game served as a same-origin blob page */
  var bundleMap = null, bundleJobs = [];
  function getBundle(cb) {
    if (bundleMap) { cb(bundleMap); return; }
    bundleJobs.push(cb);
    if (bundleJobs.length === 1) {
      fetch("games/bundle.json").then(function (r) { return r.json(); }).then(function (d) {
        bundleMap = d; bundleJobs.forEach(function (j) { j(d); }); bundleJobs = [];
      }).catch(function () {
        bundleJobs.forEach(function (j) { j(null); }); bundleJobs = [];
      });
    }
  }

  var Player = {
    current: null,
    mode: "fit",
    stageEl: null,
    iframeEl: null,

    urlFor: function (g) {
      if (g.kind === "drive") return window.ARCHIVE.drivePreview(g.id);
      if (g.kind === "link") return g.url;
      if (g.kind === "html") return g.blobUrl;
      if (g.kind === "local") return g.url;
      if (g.kind === "cdn") return g.url; // games/_cdn.html#<encoded cdn folder>
      if (g.kind === "bundled") return g.blobUrl; // same-origin blob page
      return null;
    },

    open: function (g) {
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
      if (g.kind === "bundled") {
        iframe.addEventListener("load", function () {
          try { iframe.contentWindow.focus(); } catch (e) { }
        });
      }
      // cdn games load through games/_cdn.html (same-origin launcher that
      // writes the CDN copy with a real document URL); other kinds load directly
      iframe.src = this.urlFor(g);
      stage.appendChild(iframe);

      var loaded = false;
      iframe.addEventListener("load", function () { loaded = true; loader.style.display = "none"; });
      setTimeout(function () { if (!loaded) { wrap.querySelector(".pload-open").style.display = "inline-flex"; } }, 9000);
      wrap.querySelector(".pload-open").onclick = function () { self.openDirect(); };
      wrap.querySelector(".pload-t").textContent =
        g.kind === "drive" ?
          "Loading\u2026 (if this stays blank, Drive can\u2019t run it \u2014 tap Direct)" :
        g.kind === "cdn" ?
          "Fetching game from CDN\u2026" :
        g.kind === "bundled" ?
          "Loading game\u2026" :
        (g.id && g.id.indexOf("gm:") === 0 ? "Loading\u2026 (first run downloads the game engine)" : "Loading\u2026");

      // toolbar actions
      wrap.querySelectorAll(".pbtn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var a = btn.dataset.a;
          if (a === "reload") {
            loader.style.display = "flex";
            loaded = false;
            var base = self.urlFor(g);
            iframe.removeAttribute("srcdoc");
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
      if (g.kind === "drive") url = window.ARCHIVE.driveView(g.id);
      else if (g.kind === "link") url = g.view || g.url;
      else if (g.kind === "html") url = g.blobUrl;
      else if (g.kind === "local") url = g.url;
      else if (g.kind === "cdn") url = g.url;
      else if (g.kind === "bundled") url = g.blobUrl;
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
        if (g && (g.kind === "html" || g.kind === "bundled") && g.blobUrl && g.blobRevoke !== false) {
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
          var A = window.ARCHIVE;
          if (driveId.indexOf("gm:") === 0) {
            // web-embedded game (self-contained HTML5 on a publisher CDN)
            cb({ kind: "link", id: g[0], key: g[1], name: g[2], genre: g[3], series: g[4], platform: g[5],
                 url: A.web[driveId], view: A.web[driveId] });
            return;
          }
          if (A.cdn && A.cdn[driveId]) {
            // launcher game streamed live from the jsdelivr CDN mirror
            var cbase = "https://cdn.jsdelivr.net/gh/" + A.cdn[driveId];
            var launch = "games/_cdn.html#" + encodeURIComponent(cbase);
            cb({ kind: "cdn", id: g[0], key: g[1], name: g[2], genre: g[3], series: g[4], platform: g[5],
                 url: launch, view: launch });
            return;
          }
          if (A.bundle && A.bundle.indexOf(g[1]) !== -1) {
            // self-contained game packed in games/bundle.json -> same-origin blob page
            getBundle(function (map) {
              if (!map || !map[g[1]]) { cb(null); return; }
              var url = URL.createObjectURL(new Blob([map[g[1]]], { type: "text/html" }));
              cb({ kind: "bundled", id: g[0], key: g[1], name: g[2], genre: g[3], series: g[4], platform: g[5],
                   url: url, blobUrl: url, blobRevoke: true });
            });
            return;
          }
          if (A.local && A.local.indexOf(g[1]) !== -1) {
            // game file bundled with the site (Drive copy refused to run)
            cb({ kind: "local", id: g[0], key: g[1], name: g[2], genre: g[3], series: g[4], platform: g[5],
                 url: "games/" + g[1] + ".html" });
            return;
          }
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
