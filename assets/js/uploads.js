/* ⛂ Archive — uploads: batch links (Drive aware) + sanitized HTML files (IndexedDB). */
(function () {
  "use strict";
  var DB_NAME = "arc-uploads", STORE = "games";

  /* ---------- IndexedDB (tiny promise wrapper) ---------- */
  function db() {
    return new Promise(function (res, rej) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE, { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  function tx(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction(STORE, mode);
        var s = t.objectStore(STORE);
        var out = fn(s);
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  /* ---------- link parsing ---------- */
  function normalizeLink(url) {
    url = (url || "").trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    var m;
    // drive file link -> preview embed
    m = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i);
    if (m) return { url: "https://drive.google.com/file/d/" + m[1] + "/preview", view: "https://drive.google.com/file/d/" + m[1] + "/view" };
    // drive open?id=
    m = url.match(/drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)/i);
    if (m) return { url: "https://drive.google.com/file/d/" + m[1] + "/preview", view: "https://drive.google.com/file/d/" + m[1] + "/view" };
    // docs/draws/etc - not embeddable reliably
    if (/docs\.google\.com\/(document|spreadsheets|presentation)/i.test(url)) return null;
    return { url: url, view: url };
  }
  function nameFromUrl(url) {
    try {
      var u = new URL(url);
      if (/drive\.google\.com/.test(u.hostname)) return "Drive game";
      var last = u.pathname.split("/").filter(Boolean).pop() || u.hostname;
      return decodeURIComponent(last.replace(/\.html?$/i, "").replace(/[-_]+/g, " ")).slice(0, 60) || u.hostname;
    } catch (e) { return "Link"; }
  }
  function parseLinks(text) {
    var out = [], seen = {};
    var tokens = (text || "").split(/[\s\n\r,;]+/);
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (!/^https?:\/\/|^[\w-]+\.google\.com|^drive\.google\.com/i.test(t)) continue;
      var norm = normalizeLink(t);
      if (!norm) { out.push({ bad: t }); continue; }
      if (seen[norm.url]) continue;
      seen[norm.url] = 1;
      out.push({
        id: "up" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        key: null, // assigned when added
        name: nameFromUrl(norm.url),
        kind: "link",
        url: norm.url,
        view: norm.view,
        size: 0,
        added: Date.now()
      });
    }
    return out;
  }

  /* ---------- HTML sanitizer ---------- */
  var BAD_SCRIPT = [
    /coinhive|coinhive\.com|minero|cryptoloot|jsecoin|deepminer|aeon\-stm|coin\-hive|crypto[lL]oot/i,
    /document\.cookie[\s\S]{0,120}(fetch|XMLHttpRequest|sendBeacon|\$\.(get|post)|axios)/i,
    /(fetch|XMLHttpRequest|sendBeacon|\$\.(get|post)|axios)[\s\S]{0,120}document\.cookie/i,
    /top\.location\s*(\.href)?\s*=\s*['"]https?\/\//i,
    /window\.top\.location\s*(\.href)?\s*=\s*['"]https?\/\//i,
    /eval\s*\(\s*atob\s*\(\s*['"][A-Za-z0-9+/=]{200,}/i
  ];
  function sanitizeHtml(html) {
    var removed = [];
    // strip suspicious <script> blocks (checks body AND the tag attributes/src)
    html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, function (whole, attrs, body) {
      var hay = attrs + "\n" + body;
      for (var i = 0; i < BAD_SCRIPT.length; i++) {
        if (BAD_SCRIPT[i].test(hay)) { removed.push("script#" + (removed.length + 1)); return ""; }
      }
      return whole;
    });
    // external meta refresh
    html = html.replace(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*>/gi, function (m) {
      if (/url\s*=\s*['"]?https?:\/\//i.test(m)) { removed.push("meta-refresh"); return ""; }
      return m;
    });
    return { html: html, removed: removed };
  }

  /* ---------- compat + tools shim (injected into uploaded games) ---------- */
  var SHIM = '<script>(function(){try{window.localStorage.getItem("__arc_t");}catch(e){var mem={};var mk=function(){return{getItem:function(k){return k in mem?mem[k]:null;},setItem:function(k,v){mem[k]=String(v);},removeItem:function(k){delete mem[k];},clear:function(){mem={};},key:function(i){return Object.keys(mem)[i]||null;}};};try{Object.defineProperty(window,"localStorage",{value:mk(),configurable:true});Object.defineProperty(window,"sessionStorage",{value:mk(),configurable:true});}catch(e2){window.localStorage=mk();window.sessionStorage=mk();}}var run=false,cps=10,mode="follow",fx=0,fy=0,mx=0,my=0,t=null;addEventListener("mousemove",function(e){mx=e.clientX;my=e.clientY;},true);function ck(x,y){var el=document.elementFromPoint(x,y);if(!el)return;var o={bubbles:true,cancelable:true,view:window,clientX:x,clientY:y,button:0};try{el.dispatchEvent(new PointerEvent("pointerdown",o));el.dispatchEvent(new MouseEvent("mousedown",o));el.dispatchEvent(new PointerEvent("pointerup",o));el.dispatchEvent(new MouseEvent("mouseup",o));el.dispatchEvent(new MouseEvent("click",o));}catch(e){}}addEventListener("message",function(e){var d=e.data;if(!d||!d.__arc_ac)return;run=!!d.run;cps=d.cps||10;mode=d.mode||"follow";fx=d.x||0;fy=d.y||0;if(t){clearInterval(t);t=null;}if(run){t=setInterval(function(){ck(mode==="fixed"?fx:mx,mode==="fixed"?fy:my);},Math.max(16,Math.round(1000/cps)));}});})();<\/script>';

  function buildGameHtml(html) {
    var shim = SHIM;
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head([^>]*)>/i, function (m) { return m + shim; });
    else if (/<html[^>]*>/i.test(html)) html = html.replace(/<html([^>]*)>/i, function (m) { return m + "<head>" + shim + "</head>"; });
    else html = shim + html;
    return html;
  }

  /* ---------- public API ---------- */
  var Uploads = {
    parseLinks: parseLinks,
    normalizeLink: normalizeLink,

    addLinks: function (text) {
      var items = parseLinks(text);
      var good = items.filter(function (x) { return !x.bad; });
      if (!good.length) return Promise.resolve({ added: 0, bad: items.length });
      return tx("readwrite", function (s) {
        good.forEach(function (it) { s.put(it); });
      }).then(function () { return { added: good.length, bad: items.length - good.length }; });
    },

    addFiles: function (files) {
      var self = this;
      var jobs = Array.prototype.map.call(files, function (f) {
        return new Promise(function (res) {
          var reader = new FileReader();
          reader.onload = function () {
            var text = String(reader.result || "");
            var sane = sanitizeHtml(text);
            res({
              id: "up" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
              name: f.name.replace(/\.html?$/i, "").slice(0, 60) || "Uploaded game",
              kind: "html",
              html: sane.html,
              size: f.size,
              added: Date.now(),
              sanitized: sane.removed.length
            });
          };
          reader.onerror = function () { res(null); };
          reader.readAsText(f);
        });
      });
      return Promise.all(jobs).then(function (items) {
        var ok = items.filter(Boolean);
        var sanCount = ok.filter(function (i) { return i.sanitized > 0; }).length;
        return tx("readwrite", function (s) {
          ok.forEach(function (it) { s.put(it); });
        }).then(function () { return { added: ok.length, sanitized: sanCount }; });
      });
    },

    all: function () {
      return tx("readonly", function (s) {
        return new Promise(function (res) {
          var r = s.getAll();
          r.onsuccess = function () { res(r.result || []); };
          r.onerror = function () { res([]); };
        });
      }).then(function (list) {
        return list.sort(function (a, b) { return b.added - a.added; });
      }).catch(function () { return []; });
    },

    get: function (id) {
      return tx("readonly", function (s) {
        return new Promise(function (res) {
          var r = s.get(id);
          r.onsuccess = function () { res(r.result || null); };
          r.onerror = function () { res(null); };
        });
      }).catch(function () { return null; });
    },

    remove: function (id) {
      return tx("readwrite", function (s) { s.delete(id); });
    },

    rename: function (id, name) {
      var self = this;
      return this.get(id).then(function (it) {
        if (!it) return;
        it.name = name.slice(0, 60);
        return tx("readwrite", function (s) { s.put(it); });
      });
    },

    /* build a playable blob url (with shim injected) */
    serve: function (item) {
      var html = buildGameHtml(item.html || "");
      var blob = new Blob([html], { type: "text/html" });
      return URL.createObjectURL(blob);
    },

    exportAll: function () {
      return this.all().then(function (list) { return JSON.stringify(list, null, 1); });
    },
    importAll: function (json) {
      var self = this;
      try {
        var list = JSON.parse(json);
        if (!Array.isArray(list)) throw new Error("bad");
        return tx("readwrite", function (s) {
          list.forEach(function (it) { if (it && it.id && (it.kind === "html" || it.kind === "link")) s.put(it); });
        }).then(function () { return list.length; });
      } catch (e) { return Promise.reject(new Error("Not a valid backup file.")); }
    }
  };

  window.Uploads = Uploads;
})();
