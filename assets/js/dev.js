/* ⛂ Archive — developer mode: catalog editing, cover finder (web image search
   with strict relevance filtering), cloud sync (Firebase Realtime Database REST).
   Loads for everyone (covers + removals sync to all devices); editing UI only
   activates after the one-time developer code is entered on a device. */
(function () {
  "use strict";

  var DEV_HASH = "a5796b895ae13048bff511419cf826bb43e9817e712289e89e563ec6af8b9499"; // sha256("arc.dev1:<code>")

  /* ---------------- tiny sha256 (same as auth) ---------------- */
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = "";
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = [], k = [], primeCounter = 0;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, .5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return "";
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words.length] = ((asciiBitLength / maxWord) | 0);
    words[words.length] = (asciiBitLength);
    for (j = 0; j < words.length;) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i]
          + (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        var temp2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(temp1 + temp2) | 0].concat(hash);
        hash[4] = (hash[4] + temp1) | 0;
      }
      for (i = 0; i < 8; i++) hash[i] = (hash[i] + oldHash[i]) | 0;
    }
    for (i = 0; i < 8; i++) {
      for (j = 3; j + 1; j--) {
        var b = (hash[i] >> (j * 8)) & 255;
        result += ((b < 16) ? 0 : "") + b.toString(16);
      }
    }
    return result;
  }

  function deviceFp() {
    // reuse auth's fingerprint logic (kept independent on purpose)
    var parts = [navigator.userAgent, navigator.language,
      (screen.width || 0) + "x" + (screen.height || 0), screen.colorDepth || 0,
      new Date().getTimezoneOffset(), navigator.hardwareConcurrency || 0, navigator.platform || ""
    ].join("|");
    return sha256(parts).slice(0, 40);
  }

  /* ---------------- local state ---------------- */
  var LS_DEV = "arc.devmode", LS_COVERS = "arc.covers", LS_HIST = "arc.coverHistory",
    LS_DROP = "arc.dropped", LS_FB = "arc.fb", LS_CSE = "arc.cse";

  function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }

  var covers = lsGet(LS_COVERS, {});        // slug -> url
  var historyMap = lsGet(LS_HIST, {});      // slug -> [url,...] (stack; last = current)
  var dropped = lsGet(LS_DROP, {});         // slug -> 1
  var fb = lsGet(LS_FB, null);              // {databaseURL}
  var cse = lsGet(LS_CSE, null);            // {key, cx}
  var active = false;
  var cloudOk = null;                       // null=unknown, true/false

  /* ---------------- cloud (Firebase Realtime Database, plain REST) ----------------
     Realtime Database REST endpoints send Access-Control-Allow-Origin: *, so no
     SDK and no proxy is needed — fetch() works from any static host.            */
  function fbBase() { return fb && fb.databaseURL ? String(fb.databaseURL).replace(/\/+$/, "") : null; }

  function cloud(method, path, body) {
    var base = fbBase();
    if (!base) return Promise.reject(new Error("no-firebase"));
    return fetch(base + path + ".json", {
      method: method,
      headers: body != null ? { "Content-Type": "application/json" } : undefined,
      body: body != null ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      cloudOk = true;
      return r.status === 204 ? null : r.json();
    });
  }

  function pushCover(slug, url) {
    if (!fbBase()) return;
    cloud(url ? "PUT" : "DELETE", "/state/covers/" + encodeURIComponent(slug), url)
      .catch(function () { cloudOk = false; });
  }
  function pushDrop(slug, on) {
    if (!fbBase()) return;
    cloud(on ? "PUT" : "DELETE", "/state/dropped/" + encodeURIComponent(slug), on ? 1 : null)
      .catch(function () { cloudOk = false; });
  }

  function pullState() {
    if (!fbBase()) return;
    cloud("GET", "/state").then(function (st) {
      if (!st) return;
      var changed = false;
      if (st.covers && typeof st.covers === "object") {
        for (var k in st.covers) { if (st.covers[k] && covers[k] !== st.covers[k]) { covers[k] = st.covers[k]; changed = true; } }
      }
      if (st.dropped && typeof st.dropped === "object") {
        for (var d in st.dropped) { if (st.dropped[d] && !dropped[d]) { dropped[d] = 1; changed = true; } }
      }
      if (changed) {
        lsSet(LS_COVERS, covers); lsSet(LS_DROP, dropped);
        if (window.App && window.App.rerender) window.App.rerender();
      }
    }).catch(function () { cloudOk = false; });
  }

  /* ---------------- image search (strict relevance) ----------------
     Tiers: (1) Google CSE if the dev pasted a key, (2) Wikipedia REST search —
     box art for notable games, (3) Openverse. Every candidate must pass a token
     overlap filter against the game name, or it is thrown away — the picker
     would rather show "no results" than a photo of chocolate.                  */
  var STOP = { the: 1, a: 1, an: 1, of: 1, and: 1, vs: 1, for: 1, in: 1, on: 1, to: 1, at: 1, is: 1, it: 1 };

  function toks(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9']+/g, " ").trim().split(/\s+/)
      .filter(function (t) { return t.length > 1 && !STOP[t]; });
  }
  function relevance(nameTokens, text) {
    if (!nameTokens.length) return 0;
    var tt = toks(text);
    var set = {}; tt.forEach(function (t) { set[t] = 1; });
    var hits = 0;
    nameTokens.forEach(function (t) { if (set[t]) hits++; });
    return hits / nameTokens.length;
  }
  function keepCandidate(c, nameTokens) {
    if (!c || !c.url || /^data:/.test(c.url)) return false;
    var rel = relevance(nameTokens, (c.label || "") + " " + (c.desc || ""));
    var need = nameTokens.length <= 2 ? 1 : Math.ceil(nameTokens.length / 2);
    var hitCount = Math.round(rel * nameTokens.length);
    if (rel < 0.5 || hitCount < need) return false;
    var w = c.w || 0, h = c.h || 0;
    if (w && h) {
      if (Math.min(w, h) < 140) return false;
      var ar = w / h;
      if (ar > 3 || ar < 0.25) return false;
    }
    c._rel = rel;
    return true;
  }
  function dedupe(list) {
    var seen = {}, out = [];
    list.forEach(function (c) {
      if (!seen[c.url]) { seen[c.url] = 1; out.push(c); }
    });
    return out;
  }
  function jsonFetch(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  function tierCSE(q, nameTokens) {
    if (!cse || !cse.key || !cse.cx) return Promise.resolve([]);
    var u = "https://www.googleapis.com/customsearch/v1?key=" + encodeURIComponent(cse.key) +
      "&cx=" + encodeURIComponent(cse.cx) + "&searchType=image&num=10&q=" + encodeURIComponent(q);
    return jsonFetch(u).then(function (d) {
      return (d.items || []).map(function (it) {
        return { url: it.link, w: it.image && it.image.width, h: it.image && it.image.height, label: it.title, src: "Google", desc: it.title };
      }).filter(function (c) { return keepCandidate(c, nameTokens); });
    }).catch(function () { return []; });
  }

  function tierWikipedia(q, nameTokens, base) {
    // 1) find candidate pages by name (no thumbnail needed — box art is
    //    usually a fair-use image, which the search endpoint doesn't return)
    var u = "https://en.wikipedia.org/w/rest.php/v1/search/page?q=" + encodeURIComponent(base) + "&limit=10";
    return jsonFetch(u).then(function (d) {
      var need = nameTokens.length <= 2 ? 1 : Math.ceil(nameTokens.length / 2);
      var ranked = (d.pages || []).map(function (p) {
        var label = p.title, desc = (p.description || "") + " " + p.title;
        var rel = relevance(nameTokens, label + " " + desc);
        var hits = Math.round(rel * nameTokens.length);
        return (rel >= 0.5 && hits >= need) ? { key: p.key, rel: rel } : null;
      }).filter(Boolean).slice(0, 3);
      // 2) pull the real lead image (usually the box art) from the summary API
      return Promise.all(ranked.map(function (r) {
        return jsonFetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(r.key))
          .then(function (sm) {
            var img = sm && (sm.originalimage || sm.thumbnail);
            if (!img) return null;
            var c = {
              url: img.source, w: img.width, h: img.height,
              label: sm.title, desc: sm.title + " " + (sm.extract || ""), src: "Wikipedia", _rel: r.rel
            };
            return keepCandidate(c, nameTokens) ? c : null;
          }).catch(function () { return null; });
      }));
    }).then(function (arr) {
      return (arr || []).filter(Boolean);
    }).catch(function () { return []; });
  }

  function tierOpenverse(q, nameTokens) {
    var u = "https://api.openverse.org/v1/images/?q=" + encodeURIComponent(q) + "&page_size=12";
    return jsonFetch(u).then(function (d) {
      return (d.results || []).map(function (r) {
        return { url: r.url, w: r.width, h: r.height, label: r.title, desc: r.title + " " + (r.tags || []).map(function (t) { return t.name; }).join(" "), src: "Openverse" };
      }).filter(function (c) { return keepCandidate(c, nameTokens); });
    }).catch(function () { return []; });
  }

  function searchCovers(query, cb) {
    // The query is usually "<game name> game cover". Strip the suffix to get
    // the clean game name: it becomes BOTH the Wikipedia search term and the
    // token filter — pages are matched against the game, not against the
    // words "game cover", which is what keeps random junk out.
    var base = query.replace(/\s*game\s*cover\s*$/i, "").replace(/\s*\bcover\s*art\s*$/i, "").replace(/\s*cover\s*$/i, "").trim() || query;
    var nameTokens = toks(base);
    Promise.all([
      tierCSE(query, nameTokens).catch(function () { return []; }),
      tierWikipedia(query, nameTokens, base).catch(function () { return []; }),
      tierOpenverse(query, nameTokens).catch(function () { return []; })
    ]).then(function (tiers) {
      var all = dedupe((tiers[0] || []).concat(tiers[1] || []).concat(tiers[2] || []));
      var rank = { Google: 0, Wikipedia: 1, Openverse: 2 };
      all.sort(function (a, b) {
        return (b._rel - a._rel) || ((rank[a.src] || 9) - (rank[b.src] || 9)) || ((b.w || 0) * (b.h || 0) - (a.w || 0) * (a.h || 0));
      });
      cb(all.slice(0, 14), null);
    }).catch(function (e) {
      cb([], e);
    });
  }

  /* ---------------- cover apply / revert ---------------- */
  function currentCover(slug) { return covers[slug] || null; }

  function applyCover(slug, url, opts) {
    if (url) covers[slug] = url; else delete covers[slug];
    lsSet(LS_COVERS, covers);
    var hist = historyMap[slug] || (historyMap[slug] = []);
    if (!opts || !opts.noHistory) hist.push(url || "");
    lsSet(LS_HIST, historyMap);
    pushCover(slug, url || null);
  }

  function revertCover(slug) {
    var hist = historyMap[slug] || [];
    if (!hist.length) return null;
    hist.pop(); // the current one
    var prev = hist.length ? hist[hist.length - 1] : null;
    if (prev === "") prev = null;
    applyCover(slug, prev || null, { noHistory: true });
    if (!hist.length) { delete historyMap[slug]; lsSet(LS_HIST, historyMap); }
    return prev || null;
  }

  /* ---------------- removals ---------------- */
  function isDropped(slug) { return !!dropped[slug]; }
  function dropCount() { return Object.keys(dropped).length; }

  function removeGame(slug) {
    dropped[slug] = 1;
    lsSet(LS_DROP, dropped);
    pushDrop(slug, 1);
  }
  function restoreGame(slug) {
    delete dropped[slug];
    lsSet(LS_DROP, dropped);
    pushDrop(slug, null);
  }
  function restoreAll() {
    dropped = {};
    lsSet(LS_DROP, dropped);
    if (fbBase()) {
      cloud("DELETE", "/state/dropped").catch(function () { });
    }
  }

  /* ---------------- dev unlock ---------------- */
  function tryCode(input) {
    var clean = (input || "").trim().toUpperCase();
    if (!clean) return false;
    if (sha256("arc.dev1:" + clean) === DEV_HASH) {
      active = true;
      lsSet(LS_DEV, { fp: deviceFp(), ts: Date.now() });
      return true;
    }
    return false;
  }
  function initDevToken() {
    var t = lsGet(LS_DEV, null);
    if (t && t.fp === deviceFp()) active = true;
  }
  function lockDev() {
    active = false;
    try { localStorage.removeItem(LS_DEV); } catch (e) { }
  }

  /* ---------------- config setters ---------------- */
  function setFirebase(cfgText) {
    var cfg;
    try { cfg = JSON.parse(cfgText); } catch (e) { return "That isn't valid JSON."; }
    var url = cfg.databaseURL || (cfg.projectId ? "https://" + cfg.projectId + "-default-rtdb.firebaseio.com" : null);
    if (!url || !/^https:\/\//.test(url)) return "No databaseURL found — create a Realtime Database first.";
    fb = { databaseURL: url };
    lsSet(LS_FB, fb);
    cloudOk = null;
    pullState();
    return null; // ok
  }
  function clearFirebase() { fb = null; lsSet(LS_FB, null); cloudOk = null; }
  function setCSE(key, cx) {
    if (!key || !cx) { cse = null; lsSet(LS_CSE, null); return; }
    cse = { key: key.trim(), cx: cx.trim() };
    lsSet(LS_CSE, cse);
  }

  /* ---------------- export / import ---------------- */
  function exportJSON() {
    return JSON.stringify({ covers: covers, dropped: Object.keys(dropped), history: historyMap }, null, 2);
  }
  function importJSON(text) {
    var d;
    try { d = JSON.parse(text); } catch (e) { return "Couldn't parse that file."; }
    if (d.covers) { for (var k in d.covers) covers[k] = d.covers[k]; lsSet(LS_COVERS, covers); }
    if (d.history) { for (var h in d.history) historyMap[h] = d.history[h]; lsSet(LS_HIST, historyMap); }
    if (Array.isArray(d.dropped)) { d.dropped.forEach(function (s) { dropped[s] = 1; }); lsSet(LS_DROP, dropped); }
    if (fbBase()) {
      cloud("PATCH", "/state", { covers: covers, dropped: dropped }).catch(function () { });
    }
    return null;
  }

  /* ---------------- boot ---------------- */
  initDevToken();
  pullState();

  window.Dev = {
    get active() { return active; },
    tryCode: tryCode,
    lockDev: lockDev,
    covers: covers,
    currentCover: currentCover,
    applyCover: applyCover,
    revertCover: revertCover,
    searchCovers: searchCovers,
    isDropped: isDropped,
    dropCount: dropCount,
    removeGame: removeGame,
    restoreGame: restoreGame,
    restoreAll: restoreAll,
    setFirebase: setFirebase,
    clearFirebase: clearFirebase,
    get firebaseOn() { return !!fbBase(); },
    get cloudOk() { return cloudOk; },
    setCSE: setCSE,
    get cseOn() { return !!(cse && cse.key); },
    exportJSON: exportJSON,
    importJSON: importJSON,
    pullState: pullState
  };
})();
