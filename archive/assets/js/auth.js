/* ⛂ Archive — access gate. Key check is hashed, unlock is bound to this device. */
(function () {
  "use strict";
  var KEY_HASH = "4e4a8b1ae0b80e8c08b7280f6e454433fd3f379ab13d3e6c957b7915edbb2afb"; // sha256("arc.v1:<key>")
  var LS_TOKEN = "arc.dev";
  var MAX_TRIES = 5;

  // tiny sha256 (no deps) -----------------------------------------------
  function sha256(ascii) {
    function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
    var mathPow = Math.pow, maxWord = mathPow(2, 32), result = "";
    var words = [], asciiBitLength = ascii.length * 8;
    var hash = [], k = [], primeCounter = 0;
    var isComposite = {};
    for (var candidate = 2; primeCounter < 64; candidate++) {
      if (!isComposite[candidate]) {
        for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
        k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (i = 0; i < ascii.length; i++) {
      var j = ascii.charCodeAt(i);
      if (j >> 8) return ""; // ascii only
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

  // device fingerprint (stable-ish, local only) -------------------------
  function fingerprint() {
    var parts = [
      navigator.userAgent,
      navigator.language,
      (screen.width || 0) + "x" + (screen.height || 0),
      (screen.colorDepth || 0),
      new Date().getTimezoneOffset(),
      (navigator.hardwareConcurrency || 0),
      (navigator.platform || "")
    ].join("|");
    var el = document.createElement("canvas");
    var ctx = el.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top"; ctx.font = "14px 'Arial'";
      ctx.fillStyle = "#f60"; ctx.fillRect(0, 0, 62, 20);
      ctx.fillStyle = "#069"; ctx.fillText("arca:\u26c2:", 2, 15);
      parts += "|" + el.toDataURL().slice(-64);
    }
    return sha256(parts).slice(0, 40);
  }

  function randomId() {
    var s = "";
    var chars = "abcdef0123456789";
    for (var i = 0; i < 16; i++) s += chars[Math.floor(Math.random() * 16)];
    return s;
  }

  var Auth = {
    unlocked: false,
    deviceId: null,
    unlockedAt: null,

    init: function () {
      try {
        var raw = localStorage.getItem(LS_TOKEN);
        if (raw) {
          var tok = JSON.parse(raw);
          if (tok && tok.fp === fingerprint() && tok.id) {
            this.unlocked = true;
            this.deviceId = tok.id;
            this.unlockedAt = tok.ts;
          } else if (tok) {
            localStorage.removeItem(LS_TOKEN); // token not from this device
          }
        }
      } catch (e) { /* storage blocked */ }
      return this.unlocked;
    },

    tryKey: function (input) {
      var clean = (input || "").trim().toUpperCase();
      if (!clean) return false;
      var h = sha256("arc.v1:" + clean);
      if (h && h === KEY_HASH) {
        this.deviceId = randomId();
        this.unlockedAt = Date.now();
        this.unlocked = true;
        try {
          localStorage.setItem(LS_TOKEN, JSON.stringify({
            id: this.deviceId, fp: fingerprint(), ts: this.unlockedAt
          }));
        } catch (e) { /* private mode: unlock lasts for this session only */ }
        return true;
      }
      return false;
    },

    lock: function () {
      try { localStorage.removeItem(LS_TOKEN); } catch (e) {}
      this.unlocked = false;
      location.hash = "";
      location.reload();
    }
  };

  // ---- gate UI wiring ----
  function wireGate(onUnlocked) {
    var gate = document.getElementById("gate");
    var form = document.getElementById("gate-form");
    var input = document.getElementById("gate-input");
    var err = document.getElementById("gate-error");
    var btn = document.getElementById("gate-btn");

    if (Auth.init()) { onUnlocked(); return; }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var tries = +(sessionStorage.getItem("arc.tries") || 0);
      var lockUntil = +(sessionStorage.getItem("arc.lock") || 0);
      if (Date.now() < lockUntil) {
        err.textContent = "Too many attempts. Wait " + Math.ceil((lockUntil - Date.now()) / 1000) + "s.";
        err.hidden = false;
        return;
      }
      if (Auth.tryKey(input.value)) {
        err.hidden = true;
        onUnlocked();
        return;
      }
      tries++;
      sessionStorage.setItem("arc.tries", tries);
      var card = document.querySelector(".gate-card");
      card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
      if (tries >= MAX_TRIES) {
        sessionStorage.setItem("arc.lock", Date.now() + 30000);
        sessionStorage.setItem("arc.tries", 0);
        err.textContent = "Too many attempts. Locked for 30 seconds.";
      } else {
        err.textContent = "That key doesn\u2019t work. " + (MAX_TRIES - tries) + " attempts left.";
      }
      err.hidden = false;
      input.value = "";
      input.focus();
    });
    setTimeout(function () { input.focus(); }, 60);
    gate.hidden = false;
  }

  window.Auth = Auth;
  window.wireGate = wireGate;
})();
