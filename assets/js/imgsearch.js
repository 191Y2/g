/* ⛂ Archive — web image search for covers.
   Primary: Bing Images (via public CORS proxy chain — several are tried in order).
   Fallback: Wikipedia page images (CORS-safe, great for classic/console games).
   Thumbnails display through images.weserv.nl when direct hotlinking fails. */
(function () {
  "use strict";

  var PROXIES = [
    function (u) { return "https://corsproxy.io/?url=" + encodeURIComponent(u); },
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
    function (u) { return "https://api.codetabs.com/v1/proxy?quest=" + encodeURIComponent(u); },
    function (u) { return "https://api.cors.lol/?url=" + encodeURIComponent(u); },
    function (u) { return "https://cors.eu.org/" + u; },
    function (u) { return "https://test.cors.workers.dev/?" + u; },
    function (u) { return "https://proxy.cors.sh/" + u; }
  ];
  var activeProxy = 0; // remember which proxy worked last time

  function fetchWithTimeout(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctrl = new AbortController();
      var t = setTimeout(function () { ctrl.abort(); reject(new Error("timeout")); }, ms || 12000);
      fetch(url, { signal: ctrl.signal, redirect: "follow" })
        .then(function (r) {
          clearTimeout(t);
          if (!r.ok) throw new Error("http-" + r.status);
          resolve(r);
        })
        .catch(function (e) { clearTimeout(t); reject(e); });
    });
  }

  function fetchViaProxy(targetUrl) {
    // try last-known-good proxy first, then the rest
    var order = [];
    for (var i = 0; i < PROXIES.length; i++) order.push((activeProxy + i) % PROXIES.length);
    var idx = 0;
    function attempt() {
      if (idx >= order.length) return Promise.reject(new Error("all-proxies-failed"));
      var pi = order[idx++];
      return fetchWithTimeout(PROXIES[pi](targetUrl), 13000)
        .then(function (r) { return r.text(); })
        .then(function (txt) {
          if (!txt || txt.length < 200) throw new Error("empty");
          activeProxy = pi;
          return txt;
        })
        .catch(function () { return attempt(); });
    }
    return attempt();
  }

  /* ---------- bing images ---------- */
  function parseBing(htmlText) {
    var out = [], seen = {};
    var re = /m="(\{[^"]*?\})"/g, m;
    while ((m = re.exec(htmlText)) !== null) {
      var raw;
      try { raw = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")); }
      catch (e) { continue; }
      var url = raw.murl || "";
      if (!/^https?:\/\//i.test(url)) continue;
      if (!/\.(jpe?g|png|webp)(\?|$)/i.test(url)) continue;
      if (seen[url]) continue;
      seen[url] = 1;
      out.push({
        full: url,
        thumb: raw.turl || url,
        title: (raw.t || "").replace(/\s+/g, " ").slice(0, 90),
        source: (raw.purl || "").replace(/^https?:\/\//, "").split("/")[0]
      });
      if (out.length >= 40) break;
    }
    return out;
  }

  function bingSearch(query) {
    var target = "https://www.bing.com/images/async?q=" + encodeURIComponent(query) +
      "&first=1&count=35&mmasync=1";
    return fetchViaProxy(target).then(parseBing);
  }

  /* ---------- wikipedia (CORS-safe fallback) ---------- */
  function wikiSearch(name) {
    var url = "https://en.wikipedia.org/w/api.php?action=query&generator=search" +
      "&gsrsearch=" + encodeURIComponent(name + " video game") +
      "&gsrlimit=6&prop=pageimages&piprop=thumbnail&pithumbsize=420&pilicense=any&format=json&origin=*";
    return fetchWithTimeout(url, 10000)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var out = [];
        var pages = (d && d.query && d.query.pages) || {};
        Object.keys(pages).forEach(function (k) {
          var th = pages[k].thumbnail;
          if (th && th.source) {
            out.push({
              full: th.source,
              thumb: th.source,
              title: pages[k].title + " — Wikipedia",
              source: "en.wikipedia.org"
            });
          }
        });
        return out;
      })
      .catch(function () { return []; });
  }

  /* ---------- scoring: keep results that actually mention the game ---------- */
  function score(results, gameName) {
    var tokens = gameName.toLowerCase().split(/[^a-z0-9]+/).filter(function (t) {
      return t.length > 2 && !["the", "and", "game", "games", "cover", "version", "online"].includes(t);
    });
    results.forEach(function (r) {
      var hay = (r.title + " " + r.source).toLowerCase();
      r._score = 0;
      tokens.forEach(function (t) { if (hay.indexOf(t) >= 0) r._score += 2; });
    });
    results.sort(function (a, b) { return b._score - a._score; });
    return results;
  }

  /* ---------- public api ---------- */
  var cache = {};
  window.ImgSearch = {
    /* search "<name> game cover"; returns promise of [{full,thumb,title,source}] */
    search: function (gameName, force) {
      var q = gameName + " game cover";
      if (!force && cache[q]) return Promise.resolve(cache[q]);
      var self = this;
      return bingSearch(q)
        .then(function (res) {
          if (res && res.length >= 4) {
            var s = score(res, gameName);
            cache[q] = s;
            return s;
          }
          return wikiSearch(gameName).then(function (w) {
            var all = score(res.concat(w), gameName);
            cache[q] = all;
            return all;
          });
        })
        .catch(function () {
          return wikiSearch(gameName).then(function (w) {
            cache[q] = w;
            return w;
          });
        });
    },

    /* re-search with a custom query (picker "search again" box) */
    searchCustom: function (query, gameName) {
      return bingSearch(query)
        .then(function (res) { return score(res, gameName || query); })
        .catch(function () { return []; });
    },

    /* proxy an image for display when direct hotlink is blocked */
    displayUrl: function (url) {
      return url; // direct by default; onerror handlers switch to weserv
    },
    weserv: function (url) {
      return "https://images.weserv.nl/?url=" + encodeURIComponent(url.replace(/^https?:\/\//, "")) + "&w=400";
    },
    lastProxyName: function () { return PROXIES[activeProxy] ? "proxy #" + (activeProxy + 1) : "-"; }
  };
})();
