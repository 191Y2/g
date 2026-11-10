/* ⛂ Archive — developer mode (unlock code: hashed, never stored in plaintext).
   Features: one-click delete with confirm, cover picker with auto-search,
   back-button undo, optional Firebase Realtime Database sync (REST, no SDK). */
(function () {
  "use strict";

  var DEV_HASH = "0f812471a220d829ec307e2c0007fd51c174bd7365e7bd8e2363650c8df4146b"; // sha256("arc.v1:MOBBDEEP")

  var UNLOCK_KEY = "arc.devon";
  var STATE_KEY = "arc.devstate";

  var unlocked = false;
  try { unlocked = localStorage.getItem(UNLOCK_KEY) === "1"; } catch (e) { }

  var state = { drops: {}, covers: {}, fbUrl: "", fbToken: "" };
  try {
    var raw = JSON.parse(localStorage.getItem(STATE_KEY) || "{}");
    state = {
      drops: raw.drops || {},
      covers: raw.covers || {},
      fbUrl: raw.fbUrl || "",
      fbToken: raw.fbToken || ""
    };
  } catch (e) { }

  var undoStack = []; // {type:'drop'|'cover', key, prev}
  var onChange = null;   // set by app.js -> re-render current view
  var saveTimer = null;

  function persist() {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch (e) { }
  }

  /* sha256 (same tiny impl as auth.js) */
  function sha256(ascii) {
    function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), lengthProperty = "length", i, j, result = "";
    var words = [], asciiBitLength = ascii[lengthProperty] * 8;
    var hash = [], k = [], primeCounter = 0;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii[lengthProperty] % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii[lengthProperty]; i++) {
      j = ascii.charCodeAt(i);
      if (j >> 8) return "";
      words[i >> 2] |= j << ((3 - i) % 4) * 8;
    }
    words[words[lengthProperty]] = ((asciiBitLength / maxWord) | 0);
    words[words[lengthProperty]] = (asciiBitLength);
    for (j = 0; j < words[lengthProperty];) {
      var w = words.slice(j, j += 16), oldHash = hash;
      hash = hash.slice(0, 8);
      for (i = 0; i < 64; i++) {
        var w15 = w[i - 15], w2 = w[i - 2];
        var a = hash[0], e = hash[4];
        var temp1 = hash[7]
          + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
          + ((e & hash[5]) ^ ((~e) & hash[6]))
          + k[i]
          + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0);
        var temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
          + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
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

  function toast(msg, kind) { if (window.Tools) window.Tools.toast(msg, kind); }

  /* ---------- catalog mutation (applied to the live ARCHIVE object) ---------- */
  function removedStore() {
    // dropped records kept here so undo can restore them
    if (!Dev._stash) Dev._stash = {};
    return Dev._stash;
  }

  function applyDrops() {
    var A = window.ARCHIVE;
    if (!A) return;
    var keep = [];
    A.games.forEach(function (g) {
      if (state.drops[g[1]]) removedStore()[g[1]] = g;
      else keep.push(g);
    });
    A.games = keep;
    A.featured = A.featured.filter(function (k) { return !state.drops[k]; });
  }

  function restoreDropped(key) {
    var A = window.ARCHIVE, stash = removedStore();
    if (!A || !stash[key]) return;
    A.games.push(stash[key]);
    A.games.sort(function (a, b) { return a[2].localeCompare(b[2]); });
    delete stash[key];
  }

  /* ---------- undo + back button ---------- */
  var undoDepth = 0;   // pushed undo markers ahead of the normal history
  var lastHref = location.href;

  function pushUndo(entry) {
    undoStack.push(entry);
    // extra history entry with the same URL: pressing Back pops it and undoes
    try { history.pushState({ arcUndo: undoStack.length }, "", location.href); undoDepth++; } catch (e) { }
  }

  function undoLast() {
    var entry = undoStack.pop();
    if (!entry) { toast("Nothing to undo."); return; }
    if (entry.type === "drop") {
      delete state.drops[entry.key];
      restoreDropped(entry.key);
    } else if (entry.type === "cover") {
      if (entry.prev) state.covers[entry.key] = entry.prev;
      else delete state.covers[entry.key];
      window.Covers.setOverride(entry.key, entry.prev || null);
    }
    persist();
    scheduleSync();
    if (onChange) onChange();
    toast(entry.type === "drop" ? "Delete undone." : "Cover change undone.", "ok");
  }

  /* Back undoes the last dev action when the URL didn't change (marker pop);
     a normal back (view navigation) must keep working untouched. */
  window.addEventListener("popstate", function () {
    var sameUrl = location.href === lastHref;
    if (undoDepth > 0 && sameUrl && undoStack.length) {
      undoDepth--;
      undoLast();
    }
    lastHref = location.href;
  });
  window.addEventListener("hashchange", function () { lastHref = location.href; });

  /* ---------- Firebase Realtime Database (REST) ---------- */
  function fbUrl(path) {
    var base = (state.fbUrl || "").replace(/\/+$/, "");
    if (!base) return null;
    var u = base + "/" + path + ".json";
    if (state.fbToken) u += "?auth=" + encodeURIComponent(state.fbToken);
    return u;
  }

  function scheduleSync() {
    if (!fbUrl("arcDev")) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { Dev.syncNow(true); }, 900);
  }

  var Dev = {
    _stash: null,

    isOn: function () { return unlocked; },

    tryUnlock: function (code) {
      var h = sha256("arc.v1:" + code);
      if (h && h === DEV_HASH) {
        unlocked = true;
        try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (e) { }
        toast("Developer mode enabled.", "ok");
        return true;
      }
      toast("That code is not recognized.", "err");
      return false;
    },

    lock: function () {
      unlocked = false;
      try { localStorage.removeItem(UNLOCK_KEY); } catch (e) { }
      toast("Developer mode off.");
    },

    state: state,

    /* remove a game (key = data.js key) */
    drop: function (key) {
      state.drops[key] = Date.now();
      persist();
      applyDrops();
      pushUndo({ type: "drop", key: key });
      scheduleSync();
      if (onChange) onChange();
      toast("Removed. Press Back (or Undo) to restore.", "ok");
    },

    /* set a cover override (url or dataURL or "" to clear) */
    setCover: function (key, url) {
      var prev = state.covers[key] || null;
      if (url) state.covers[key] = url; else delete state.covers[key];
      persist();
      window.Covers.setOverride(key, url || null);
      pushUndo({ type: "cover", key: key, prev: prev });
      scheduleSync();
      toast("Cover updated. Press Back (or Undo) to revert.", "ok");
    },

    undoLast: undoLast,
    canUndo: function () { return undoStack.length > 0; },

    setOnChange: function (fn) { onChange = fn; },

    applyDrops: applyDrops,

    /* firebase */
    configure: function (url, token) {
      state.fbUrl = (url || "").trim();
      state.fbToken = (token || "").trim();
      persist();
    },
    hasCloud: function () { return !!state.fbUrl; },
    syncNow: function (silent) {
      var u = fbUrl("arcDev");
      if (!u) { if (!silent) toast("Add a Firebase URL first.", "err"); return; }
      fetch(u, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drops: state.drops, covers: state.covers, savedAt: Date.now() })
      }).then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        if (!silent) toast("Synced to Firebase.", "ok");
      }).catch(function () {
        if (!silent) toast("Firebase sync failed — check URL/token.", "err");
      });
    },
    pullCloud: function () {
      var u = fbUrl("arcDev");
      if (!u) { toast("Add a Firebase URL first.", "err"); return; }
      fetch(u).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || (!d.drops && !d.covers)) { toast("Nothing saved in the cloud yet."); return; }
        state.drops = d.drops || {};
        state.covers = d.covers || {};
        persist();
        applyDrops();
        window.Covers.loadOverrides(state.covers);
        if (onChange) onChange();
        toast("Pulled from Firebase.", "ok");
      }).catch(function () {
        toast("Firebase pull failed — check URL/token.", "err");
      });
    },

    /* export/import dev state (works without firebase too) */
    exportState: function () {
      return JSON.stringify({ drops: state.drops, covers: state.covers, fbUrl: state.fbUrl }, null, 2);
    },
    importState: function (json) {
      try {
        var d = JSON.parse(json);
        state.drops = d.drops || state.drops;
        state.covers = d.covers || state.covers;
        if (d.fbUrl) state.fbUrl = d.fbUrl;
        persist();
        applyDrops();
        window.Covers.loadOverrides(state.covers);
        if (onChange) onChange();
        toast("Dev state imported.", "ok");
      } catch (e) { toast("That file didn\u2019t parse.", "err"); }
    }
  };

  /* boot: load overrides + apply drops once app is up */
  window.Covers.loadOverrides(state.covers);

  window.Dev = Dev;
})();
