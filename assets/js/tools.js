/* ⛂ Archive — tools: autoclicker, tab cloak, panic key, toasts. */
(function () {
  "use strict";

  /* ---------------- toasts ---------------- */
  var toastRoot = null;
  function toast(msg, kind) {
    if (!toastRoot) toastRoot = document.getElementById("toast-root");
    if (!toastRoot) return;
    var el = document.createElement("div");
    el.className = "toast" + (kind ? " " + kind : "");
    el.textContent = msg;
    toastRoot.appendChild(el);
    setTimeout(function () { el.style.opacity = "0"; }, 3400);
    setTimeout(function () { el.remove(); }, 3800);
  }

  /* ---------------- settings store ---------------- */
  var DEFAULTS = {
    panicKey: "`",
    panicUrl: "https://classroom.google.com/",
    cloak: "off",
    acCps: 10,
    acMode: "follow"
  };
  function getSettings() {
    var s = DEFAULTS;
    try { s = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem("arc.settings") || "{}")); }
    catch (e) { }
    return s;
  }
  function saveSettings(patch) {
    var s = Object.assign(getSettings(), patch);
    try { localStorage.setItem("arc.settings", JSON.stringify(s)); } catch (e) { }
    return s;
  }

  /* ---------------- tab cloak ---------------- */
  var CLOAKS = {
    "off": { title: "\u26c2 Archive", icon: null },
    "classroom": { title: "Classes", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='8' fill='%232962ff'/><path d='M32 14 54 24 32 34 10 24z' fill='white'/><path d='M18 31v10c0 4 28 4 28 0V31l-14 7z' fill='white'/></svg>" },
    "drive": { title: "My Drive - Google Drive", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><path d='M10 42 24 16h16l14 26z' fill='%2300a94f'/><path d='M10 42h44L44 16z' fill='%2300cf72' opacity='.9'/></svg>" },
    "docs": { title: "Untitled document - Google Docs", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='8' fill='%231a73e8'/><rect x='16' y='12' width='22' height='28' fill='white'/><rect x='20' y='40' width='28' height='12' fill='%234285f4'/></svg>" },
    "canvas": { title: "Dashboard", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='8' fill='%23e02b35'/><circle cx='32' cy='32' r='16' fill='white' opacity='.92'/></svg>" },
    "clever": { title: "Clever | Portal", icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='8' fill='%23436cff'/><text x='32' y='42' font-size='28' text-anchor='middle' fill='white' font-family='Arial' font-weight='bold'>C</text></svg>" }
  };
  function applyCloak(name) {
    var c = CLOAKS[name] || CLOAKS.off;
    document.title = c.title;
    var link = document.querySelector('link[rel="icon"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = c.icon || "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><circle cx='32' cy='32' r='29' fill='%23141619' stroke='%23e6b450' stroke-width='6'/></svg>";
  }

  /* ---------------- panic key ---------------- */
  function wirePanic() {
    document.addEventListener("keydown", function (e) {
      var s = getSettings();
      if (!s.panicKey) return;
      if (e.key === s.panicKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        var tag = (e.target && e.target.tagName) || "";
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return; // don't fire while typing
        try { sessionStorage.clear(); } catch (err) { }
        location.replace(s.panicUrl || "https://classroom.google.com/");
      }
    });
  }
  wirePanic();

  /* ---------------- autoclicker ---------------- */
  var AC = {
    running: false,
    timer: null,
    cps: 10,
    mode: "follow", // follow | fixed
    fixedX: 0,
    fixedY: 0,
    panel: null,
    ring: null,

    ensurePanel: function () {
      if (this.panel) return;
      var self = this;
      var p = document.createElement("div");
      p.id = "ac-panel";
      p.hidden = true;
      p.innerHTML =
        '<div class="ac-head"><b><svg viewBox="0 0 24 24"><path d="M9 3.5v7L4.8 18a2.4 2.4 0 0 0 2 3.5h10.4a2.4 2.4 0 0 0 2-3.5L15 10.5v-7z"/><path d="M7 3.5h10"/></svg>Auto Clicker</b>' +
        '<button class="icon-btn ac-close" title="Hide"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>' +
        '<div class="ac-row"><span>Rate</span><input type="range" min="1" max="60" step="1" value="' + this.cps + '"><output>' + this.cps + ' cps</output></div>' +
        '<div class="ac-row"><span>Mode</span><div class="segmini">' +
        '<button data-m="follow" class="on">Follow cursor</button><button data-m="fixed">Fixed point</button></div></div>' +
        '<div class="ac-row"><button class="btn btn-secondary btn-sm ac-set" style="flex:1">Set point (click game)</button>' +
        '<button class="btn btn-primary btn-sm ac-toggle" style="flex:1">Start</button></div>' +
        '<div class="ac-note">Clicks the page and any game you uploaded. Hosted (Drive) games sit inside another origin, so browsers won\u2019t let a clicker reach them. Hotkey: <span class="kbd">Alt+A</span></div>';
      document.body.appendChild(p);
      this.panel = p;

      p.querySelector(".ac-close").onclick = function () { self.hide(); };
      var range = p.querySelector('input[type="range"]');
      var out = p.querySelector("output");
      range.oninput = function () {
        self.cps = +range.value;
        out.textContent = range.value + " cps";
        saveSettings({ acCps: self.cps });
      };
      p.querySelectorAll(".segmini button").forEach(function (b) {
        b.onclick = function () {
          p.querySelectorAll(".segmini button").forEach(function (x) { x.classList.remove("on"); });
          b.classList.add("on");
          self.mode = b.dataset.m;
          saveSettings({ acMode: self.mode });
        };
      });
      p.querySelector(".ac-set").onclick = function () {
        self.armed = true;
        toast("Now click anywhere to lock the click point.");
      };
      p.querySelector(".ac-toggle").onclick = function () { self.toggle(); };

      // drag by header
      var head = p.querySelector(".ac-head");
      var drag = null;
      head.addEventListener("pointerdown", function (e) {
        if (e.target.closest(".ac-close")) return;
        var r = p.getBoundingClientRect();
        drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
        head.setPointerCapture(e.pointerId);
      });
      head.addEventListener("pointermove", function (e) {
        if (!drag) return;
        p.style.left = Math.max(0, e.clientX - drag.dx) + "px";
        p.style.top = Math.max(0, e.clientY - drag.dy) + "px";
        p.style.right = "auto";
        p.style.bottom = "auto";
      });
      head.addEventListener("pointerup", function () { drag = null; });
    },

    show: function () {
      this.ensurePanel();
      var s = getSettings();
      this.cps = s.acCps; this.mode = s.acMode;
      this.panel.hidden = false;
    },
    hide: function () { if (this.panel) this.panel.hidden = true; },
    toggle: function () {
      this.running = !this.running;
      var btn = this.panel.querySelector(".ac-toggle");
      btn.textContent = this.running ? "Stop" : "Start";
      btn.classList.toggle("btn-danger", this.running);
      btn.classList.toggle("btn-primary", !this.running);
      if (this.running) this.start(); else this.stop();
    },

    start: function () {
      var self = this;
      this.stop();
      this.running = true;
      // visual ring
      this.ring = document.getElementById("ac-ring");
      if (this.ring) this.ring.hidden = false;
      this.timer = setInterval(function () { self.clickOnce(); }, Math.max(16, Math.round(1000 / this.cps)));
      // tell any sandbox-bridged game iframe to auto-click too
      Player.bridge(function (w) { try { w.postMessage({ __arc_ac: true, run: true, cps: self.cps, mode: self.mode, x: self.fixedX, y: self.fixedY }, "*"); } catch (e) { } });
    },
    stop: function () {
      this.running = false;
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this.ring) { this.ring.hidden = true; this.ring = null; }
      Player.bridge(function (w) { try { w.postMessage({ __arc_ac: true, run: false }, "*"); } catch (e) { } });
    },
    clickOnce: function () {
      var x = this.mode === "fixed" ? this.fixedX : this.lastX;
      var y = this.mode === "fixed" ? this.fixedY : this.lastY;
      if (x == null) return;
      var el = document.elementFromPoint(x, y);
      if (!el) return;
      var opts = { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0 };
      el.dispatchEvent(new PointerEvent("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PointerEvent("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
      if (this.ring) {
        var c = this.ring;
        c.style.left = (x - 22) + "px";
        c.style.top = (y - 22) + "px";
        var ctx = c.getContext("2d");
        if (ctx) {
          c.width = 44; c.height = 44;
          ctx.strokeStyle = "#e6b450"; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(22, 22, 9, 0, 7); ctx.stroke();
        }
      }
    }
  };
  document.addEventListener("mousemove", function (e) { AC.lastX = e.clientX; AC.lastY = e.clientY; }, { passive: true });
  document.addEventListener("mousedown", function (e) {
    if (AC.armed) {
      AC.armed = false;
      AC.mode = "fixed";
      AC.fixedX = e.clientX; AC.fixedY = e.clientY;
      if (AC.panel) {
        AC.panel.querySelectorAll(".segmini button").forEach(function (b) {
          b.classList.toggle("on", b.dataset.m === "fixed");
        });
      }
      toast("Click point locked.");
    }
  }, true);

  /* hotkeys */
  document.addEventListener("keydown", function (e) {
    if (e.altKey && (e.key === "a" || e.key === "A")) {
      e.preventDefault();
      if (AC.panel && !AC.panel.hidden) AC.toggle();
      else { AC.show(); toast("Auto clicker ready \u2014 press Start or Alt+A."); }
    }
  });

  window.Tools = {
    toast: toast,
    getSettings: getSettings,
    saveSettings: saveSettings,
    applyCloak: applyCloak,
    CLOAKS: CLOAKS,
    AC: AC
  };
})();
