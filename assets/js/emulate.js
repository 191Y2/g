/* ⛂ Archive — Emulation: run your own ROMs locally via EmulatorJS (loaded on demand). */
(function () {
  "use strict";

  var EMU_LOADER = "https://cdn.emulatorjs.org/stable/data/loader.js";
  var CORE_BASE = "https://cdn.emulatorjs.org/stable/data/";

  var Emu = {
    loaded: false,
    loading: false,

    page: function (view, params) {
      var self = this;
      view.innerHTML =
        '<div class="page">' +
        '  <div class="page-head"><div><div class="sub">Drop a ROM, it runs right here \u2014 nothing is uploaded anywhere.</div></div></div>' +
        '  <div class="section" id="emu-drop-wrap">' +
        '    <div class="emu-zone" id="emu-drop">' +
        '      <svg viewBox="0 0 24 24"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>' +
        '      <b style="color:var(--text)">Drop a ROM file here</b>' +
        '      <div style="font-size:12.5px;margin-top:6px">or click to browse \u00b7 .gba .nes .snes .smc .n64 .z64 .nds .gb .gbc .bin .cue .iso .zip \u2026</div>' +
        '    </div>' +
        '    <input type="file" id="emu-file" hidden>' +
        '  </div>' +
        '  <div class="section" style="display:none" id="emu-stage-wrap">' +
        '    <div class="section-head"><h3>Now playing</h3><button class="btn btn-secondary btn-sm" id="emu-eject">Eject</button></div>' +
        '    <div id="emu-stage"><div id="emu-mount"></div></div>' +
        '  </div>' +
        '  <div class="section">' +
        '    <div class="section-head"><h3>Built-in retro shelf</h3></div>' +
        '    <p style="color:var(--muted);font-size:13.5px;margin-bottom:12px">The archive also ships pre-wrapped classics you can launch instantly \u2014 pick a console:</p>' +
        '    <div class="consoles" id="emu-consoles"></div>' +
        '  </div>' +
        '</div>';

      var drop = view.querySelector("#emu-drop");
      var file = view.querySelector("#emu-file");
      drop.addEventListener("click", function () { file.click(); });
      ["dragover", "dragenter"].forEach(function (n) {
        drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add("drag"); });
      });
      ["dragleave", "drop"].forEach(function (n) {
        drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove("drag"); });
      });
      drop.addEventListener("drop", function (e) {
        var f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) self.play(f, view);
      });
      file.addEventListener("change", function () {
        if (file.files[0]) self.play(file.files[0], view);
      });
      view.querySelector("#emu-eject").addEventListener("click", function () {
        view.querySelector("#emu-stage-wrap").style.display = "none";
        view.querySelector("#emu-drop-wrap").style.display = "block";
        var mount = view.querySelector("#emu-mount");
        mount.innerHTML = "";
      });

      // console shelf -> library filtered by platform
      var consoles = [
        ["nes", "NES", "68 games"], ["snes", "Super Nintendo", "62 games"],
        ["genesis", "Genesis", "67 games"], ["gba", "Game Boy / GBA", "148 games"],
        ["nds", "Nintendo DS", "105 games"], ["n64", "Nintendo 64", "64 games"],
        ["ps1", "PlayStation", "66 games"], ["arcade", "Arcade", "112 games"],
        ["dos", "MS-DOS", "21 games"], ["gamegear", "Game Gear", "15 games"],
        ["sms", "Master System", "8 games"], ["jaguar", "Jaguar", "10 games"],
        ["saturn", "Saturn", "3 games"], ["ws", "WonderSwan", "8 games"],
        ["atari", "Atari 2600", "11 games"], ["segacd", "Sega CD", "3 games"],
        ["flash", "Flash era", "480 games"]
      ];
      var counts = {};
      window.ARCHIVE.games.forEach(function (g) { counts[g[5]] = (counts[g[5]] || 0) + 1; });
      var grid = view.querySelector("#emu-consoles");
      consoles.forEach(function (c) {
        var n = counts[c[0]] || 0;
        if (!n) return;
        var el = document.createElement("div");
        el.className = "console-card";
        el.innerHTML = "<b>" + c[1] + "</b><span>" + n + " games</span>";
        el.addEventListener("click", function () { location.hash = "#/library?platform=" + c[0]; });
        grid.appendChild(el);
      });
    },

    play: function (file, view) {
      var self = this;
      var name = file.name;
      view.querySelector("#emu-drop-wrap").style.display = "none";
      view.querySelector("#emu-stage-wrap").style.display = "block";
      var mount = view.querySelector("#emu-mount");
      mount.innerHTML = '<div class="pload" style="position:relative;height:420px"><div class="spinner"></div><div>Fetching emulator core\u2026</div></div>';

      var start = function () {
        var url = URL.createObjectURL(file);
        mount.innerHTML = '<div id="emulatorjs-game"></div>';
        window.EJS_player = "#emulatorjs-game";
        window.EJS_core = self.guessCore(name);
        window.EJS_gameUrl = url;
        window.EJS_startOnLoaded = true;
        window.EJS_pathtodata = CORE_BASE;
        // reload loader each time (it re-inits)
        var old = document.getElementById("emu-loader-script");
        if (old) old.remove();
        var s = document.createElement("script");
        s.id = "emu-loader-script";
        s.src = EMU_LOADER;
        s.onerror = function () {
          mount.innerHTML = '<div class="empty">Could not reach the EmulatorJS CDN. If your network blocks cdn.emulatorjs.org, ROMs can\u2019t run here \u2014 but every built-in retro game on this site already works from its own bundled copy.</div>';
        };
        document.body.appendChild(s);
      };

      if (this.loaded) { start(); return; }
      // loader script sets window.EJS_* then loads; first time just call start (script tag loads it)
      this.loaded = true;
      start();
    },

    guessCore: function (name) {
      var ext = (name.split(".").pop() || "").toLowerCase();
      var map = {
        gba: "gba", gb: "gb", gbc: "gb", nes: "nes", fds: "nes", snes: "snes", smc: "snes",
        sfc: "snes", n64: "n64", z64: "n64", v64: "n64", nds: "nds", bin: "psx",
        cue: "psx", iso: "psx", pbp: "psx", md: "segaMD", gen: "segaMD", smd: "segaMD",
        sms: "segaMS", gg: "segaGG", jag: "jaguar", ws: "ws", wsc: "ws",
        atari: "atari2600", a26: "atari2600", arcade: "arcade", zip: ""
      };
      // zip: let EmulatorJS detect
      return map[ext] !== undefined ? map[ext] : "";
    }
  };

  window.Emu = Emu;
})();
