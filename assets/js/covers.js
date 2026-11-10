/* ⛂ Archive — cover service.
   Zero bundled images: covers come from Wikipedia (CORS-safe, keyless) with a
   strict relevance filter — only pages whose description says "video game"
   (or "video game series"/"media franchise" for series tiles) are accepted,
   so tiles never get random junk. Results are cached in localStorage;
   dev-mode overrides always win. */
(function () {
  "use strict";

  var CACHE_KEY = "arc.covers";
  var cache = {};       // key -> url | "" ("" = searched, nothing relevant found)
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}") || {}; } catch (e) { cache = {}; }

  var overrides = {};   // key -> url (set by dev mode)
  var listeners = {};   // key -> [artEl, ...]
  var pending = {};     // key -> true while a fetch is running
  var queue = [];
  var active = 0;
  var MAX_ACTIVE = 3;

  function persist() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { }
  }

  var STOP = { "the": 1, "and": 1, "of": 1, "with": 1, "for": 1, "a": 1 };
  function norm(s) {
    return (s || "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function sigWords(s) {
    return s.split(" ").filter(function (w) { return w.length > 2 && !STOP[w]; });
  }
  /* strict matcher: the title's first significant word must equal the name's,
     and every name word must appear in the title as a whole word.
     (blocks "Traffic Racer"->"Ridge Racer", "Slope"->"Steep Slope Sliders",
     "2048"->"Wipeout 2048", "Smash Karts"->"Shrek Smash n Crash" ...) */
  function wordHits(title, name) {
    var t = norm(title);
    if (!t) return false;
    var tw = sigWords(t);
    if (!tw.length) return false;
    var variants = [];
    var cleaned = norm(name);
    if (cleaned) variants.push(cleaned);
    var cut = (name || "").search(/[:\/]/);
    if (cut > 2) { var head = norm(name.slice(0, cut)); if (head) variants.push(head); }
    for (var v = 0; v < variants.length; v++) {
      var words = sigWords(variants[v]);
      if (!words.length) continue;
      // single-word names (Granny, Brotato, Slope, 2048) only match the exact article
      if (words.length === 1 && t !== variants[v]) continue;
      if (tw[0] !== words[0]) continue;
      var ok = true;
      for (var i = 0; i < words.length; i++) {
        if (tw.indexOf(words[i]) < 0) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }

  function relevantDesc(desc) {
    var d = (desc || "").toLowerCase();
    return d.indexOf("video game") >= 0 || d.indexOf("media franchise") >= 0;
  }

  /* step 1: search titles + descriptions (no thumbnails in search results) */
  function restSearch(name, cb) {
    var q = /[a-z]$/i.test(name) ? name + " video game" : name;
    fetch("https://en.wikipedia.org/w/rest.php/v1/search/page?q=" + encodeURIComponent(q) + "&limit=8")
      .then(function (r) { return r.json(); })
      .then(function (d) { cb((d && d.pages) || []); })
      .catch(function () { cb([]); });
  }

  /* step 2: page summary carries the thumbnail */
  function summary(pageKey, cb) {
    fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(pageKey))
      .then(function (r) { return r.json(); })
      .then(function (d) { cb(d); })
      .catch(function () { cb(null); });
  }

  function resolveCover(name, isSeries, done) {
    restSearch(name, function (pages) {
      var cands = pages.filter(function (p) {
        if (!relevantDesc(p.description)) return false;
        if (!isSeries && (p.description || "").toLowerCase().indexOf("media franchise") >= 0 &&
            (p.description || "").toLowerCase().indexOf("video game") < 0) return false;
        return wordHits(p.title, name);
      }).slice(0, 3);
      if (!cands.length) return done(null);
      // if any candidate is an exact title match, trust it (image or none) —
      // never fall through to a lesser match like "FF VII" -> "FF VII Remake"
      var cleaned = norm(name);
      var exact = null;
      for (var ci = 0; ci < cands.length; ci++) {
        if (norm(cands[ci].title) === cleaned) { exact = cands[ci]; break; }
      }
      if (exact) cands = [exact];
      var i = 0;
      (function next() {
        if (i >= cands.length) return done(null);
        var c = cands[i++];
        summary(c.key, function (s) {
          if (s && s.thumbnail && s.thumbnail.source &&
              relevantDesc(s.description || c.description)) return done({ url: s.thumbnail.source, title: s.title, desc: s.description || c.description });
          next();
        });
      })();
    });
  }

  function notify(key) {
    var raw = overrides[key] || cache[key] || "";
    var url = raw ? String(raw).split("?")[0] : "";   // strip utm cruft from wiki thumbs
    (listeners[key] || []).forEach(function (art) {
      if (!art.isConnected) return;
      paint(art, url || null);
    });
  }

  function paint(art, url) {
    var img = art.querySelector("img");
    if (url) {
      if (img) { img.src = url; img.hidden = false; }
      else {
        img = document.createElement("img");
        img.src = url; img.alt = ""; img.loading = "lazy";
        img.addEventListener("error", function () {
          img.remove();
          var t = art.querySelector(".tile");
          if (t) t.hidden = false;
        });
        var tile = art.querySelector(".tile");
        if (tile) tile.replaceWith(img); else art.insertBefore(img, art.firstChild);
      }
      var t2 = art.querySelector(".tile"); if (t2) t2.hidden = true;
    } else {
      if (img) img.remove();
      var tile2 = art.querySelector(".tile");
      if (tile2) tile2.hidden = false;
    }
  }

  function enqueue(key, name, isSeries) {
    queue.push({ key: key, name: name, series: !!isSeries });
    pump();
  }

  function pump() {
    while (active < MAX_ACTIVE && queue.length) {
      var job = queue.shift();
      if (cache[job.key] !== undefined || overrides[job.key]) continue;
      active++;
      pending[job.key] = true;
      resolveCover(job.name, job.series, function (res) {
        cache[job.key] = res ? res.url : "";
        persist();
        delete pending[job.key];
        notify(job.key);
        active--;
        pump();
      });
    }
  }

  var Covers = {
    /* register an .art element for a game; returns the url to paint now (or null) */
    bind: function (key, name, artEl) {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(artEl);
      var preset = window.ARCHIVE && window.ARCHIVE.webCovers ? window.ARCHIVE.webCovers[key] : null;
      var url = overrides[key] || cache[key] || preset || null;
      if (url) return url;
      if (cache[key] === undefined && !pending[key] && !overrides[key] && !preset) {
        enqueue(key, name, String(key).indexOf("series:") === 0);
      }
      return null;
    },

    /* dev-mode override (also used by cover picker) */
    setOverride: function (key, url) {
      if (url) overrides[key] = url; else delete overrides[key];
      notify(key);
    },
    loadOverrides: function (map) {
      overrides = map || {};
      for (var k in overrides) notify(k);
    },
    getOverride: function (key) { return overrides[key] || null; },

    /* candidate list for the dev cover picker */
    candidates: function (name, cb) {
      restSearch(name, function (pages) {
        var cands = pages.filter(function (p) { return relevantDesc(p.description) && wordHits(p.title, name); }).slice(0, 6);
        if (!cands.length) return cb([]);
        var out = [], left = cands.length;
        cands.forEach(function (c) {
          summary(c.key, function (s) {
            if (s && s.thumbnail && s.thumbnail.source) {
              out.push({ title: s.title || c.title, desc: s.description || c.description || "", url: s.thumbnail.source });
            }
            if (--left === 0) cb(out);
          });
        });
      });
    },

    cached: function (key) { return overrides[key] || cache[key] || null; },
    _paint: paint
  };

  window.Covers = Covers;
})();
