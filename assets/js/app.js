/* ⛂ Archive — app core: router, views, search, uploads UI, favorites. */
(function () {
  "use strict";
  var A = window.ARCHIVE;
  var T = function () { return window.Tools; };

  /* ---------------- state ---------------- */
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem("arc.favs") || "[]"); } catch (e) { }
  function saveFavs() { try { localStorage.setItem("arc.favs", JSON.stringify(favs)); } catch (e) { } }
  function isFav(id) { return favs.indexOf(id) >= 0; }
  function toggleFav(id) {
    var i = favs.indexOf(id);
    if (i >= 0) favs.splice(i, 1); else favs.push(id);
    saveFavs();
    renderSidebarFavs();
    return isFav(id);
  }

  var uploadsCache = [];
  function refreshUploads() {
    return window.Uploads.all().then(function (list) { uploadsCache = list; });
  }
  function uploadsAsGames() {
    return uploadsCache.map(function (u) {
      return {
        kind: u.kind, id: u.id, key: "up:" + u.id, name: u.name,
        genre: "upload", series: "", platform: "",
        url: u.url, view: u.view, size: u.size, added: u.added
      };
    });
  }

  var byKey = {};
  A.games.forEach(function (g) { byKey[g[1]] = g; });
  var seriesByKey = {};
  A.series.forEach(function (s) { seriesByKey[s[0]] = s; });

  function gameById(id) {
    for (var i = 0; i < A.games.length; i++) if (A.games[i][0] === id) return A.games[i];
    return null;
  }
  function playHref(id) { return "#/play/" + id; }

  /* ---------------- tiny dom helpers ---------------- */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtSize(n) {
    if (!n) return "";
    if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
    return n < 1024 ? "<1 KB" : Math.round(n / 1024) + " KB";
  }
  function seededPick(arr, n, seed) {
    var s = seed || 1, out = arr.slice();
    for (var i = out.length - 1; i > 0; i--) {
      s = (s * 9301 + 49297) % 233280;
      var j = Math.floor(s / 233280 * (i + 1));
      var t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out.slice(0, n);
  }

  /* ---------------- live catalog (dev removals filtered out) ---------------- */
  function liveList(list) {
    var D = window.Dev;
    if (!D) return list;
    return list.filter(function (g) { return g.kind ? true : !D.isDropped(g[1]); });
  }

  /* ---------------- card builders ---------------- */
  var ICONS = {
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7.5-4.7-9.4-9.2C1.2 7.2 3.4 4 6.7 4c2 0 3.5 1 5.3 3 1.8-2 3.3-3 5.3-3 3.3 0 5.5 3.2 4.1 6.8C19.5 15.3 12 20 12 20z"/></svg>',
    play: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m5 18 5-5 3 3 3.5-3.5L20 16"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  function coverFor(key) { return window.Dev ? window.Dev.currentCover(key) : null; }

  function gameCard(g) {
    // g = [driveId,key,name,genre,series,platform] or upload object
    var isUp = !!g.kind;
    var key = isUp ? g.key : g[1];
    var name = isUp ? g.name : g[2];
    var genre = isUp ? "upload" : g[3];
    var id = isUp ? g.key : g[0];
    var cov = coverFor(key);
    var card = el("div", "gcard");
    var art = el("div", "art");
    // letter tile always renders — the cover img sits on top, and if the
    // remote image ever fails the tile is still there underneath
    art.appendChild(el("div", "tile t-" + genre, esc(name.trim().charAt(0).toUpperCase())));
    if (cov) {
      var img = document.createElement("img");
      img.src = cov; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
      img.onerror = function () { img.remove(); };
      art.appendChild(img);
    }
    var platform = !isUp && g[5] ? g[5] : "";
    var badge = g.series && seriesByKey[g.series] ? '<span class="badge series">' + esc(seriesByKey[g.series][1]) + "</span>"
      : (platform ? '<span class="badge">' + esc(platform) + "</span>" : "");
    if (badge) art.insertAdjacentHTML("beforeend", badge);
    var fav = el("button", "fav" + (isFav(id) ? " on" : ""), ICONS.heart);
    fav.title = "Favorite";
    fav.onclick = function (e) {
      e.stopPropagation();
      fav.classList.toggle("on", toggleFav(id));
    };
    art.appendChild(fav);
    if (window.Dev && window.Dev.active) {
      var devRow = el("div", "dev-row");
      var covBtn = el("button", "dev-btn", ICONS.image);
      covBtn.title = "Find a cover";
      covBtn.onclick = function (e) { e.stopPropagation(); openCoverPicker(key, name); };
      var rmBtn = el("button", "dev-btn dev-rm", ICONS.x);
      rmBtn.title = "Remove from archive";
      rmBtn.onclick = function (e) {
        e.stopPropagation();
        confirmDialog("Remove \u201C" + name + "\u201D?",
          "It disappears from the library on every synced device. You can restore it later in Settings \u2192 Developer.",
          function () {
            window.Dev.removeGame(key);
            T().toast("Removed \u201C" + name + "\u201D.", "ok");
            route();
          });
      };
      devRow.appendChild(covBtn);
      devRow.appendChild(rmBtn);
      art.appendChild(devRow);
    }
    card.appendChild(art);
    card.appendChild(el("div", "name", esc(name)));
    card.appendChild(el("div", "meta", '<i class="gdot ' + genre + '"></i>' + esc(genre === "td" ? "tower defense" : genre)));
    card.onclick = function () { go(playHref(id)); };
    return card;
  }

  function gameRow(g) {
    var isUp = !!g.kind;
    var key = isUp ? g.key : g[1];
    var name = isUp ? g.name : g[2];
    var genre = isUp ? "upload" : g[3];
    var id = isUp ? g.key : g[0];
    var plat = !isUp && g[5] ? g[5] : "";
    var r = el("div", "lrow");
    r.innerHTML = '<div class="mini t-' + genre + '">' + esc(name.charAt(0).toUpperCase()) + "</div>" +
      '<div class="lname">' + esc(name) + "</div>" +
      '<div class="lmeta"><i class="gdot ' + genre + '"></i>' + esc(genre) + (plat ? " \u00b7 " + esc(plat) : "") + "</div>" +
      '<div class="play-mini">' + ICONS.play + "</div>";
    r.onclick = function () { go(playHref(id)); };
    return r;
  }

  function seriesCard(s, big) {
    var key = s[0], name = s[1], rank = s[2], coverKey = s[3], count = s[4];
    var cov = coverFor(coverKey);
    var c = el("a", "scard");
    c.href = "#/series/" + key;
    var art = el("div", "art");
    art.appendChild(el("div", "tile t-rpg", esc(name.charAt(0))));
    if (cov) {
      var img = document.createElement("img");
      img.src = cov; img.alt = ""; img.loading = "lazy"; img.referrerPolicy = "no-referrer";
      img.onerror = function () { img.remove(); };
      art.appendChild(img);
    }
    c.appendChild(art);
    c.appendChild(el("div", "info", "<b>" + esc(name) + "</b><span>" + count + " games \u00b7 #" + rank + "</span>"));
    return c;
  }

  function rowScroller(wrap) {
    var row = wrap.querySelector(".row");
    var step = function (dir) {
      var card = row.querySelector(".gcard,.scard");
      var w = card ? card.getBoundingClientRect().width + 14 : 240;
      row.scrollBy({ left: dir * w * Math.floor(row.clientWidth / w), behavior: "smooth" });
    };
    wrap.querySelector(".prev").onclick = function () { step(-1); };
    wrap.querySelector(".next").onclick = function () { step(1); };
  }
  function makeRow(parent, title, count, moreHref) {
    var sec = el("div", "section");
    var head = el("div", "section-head");
    head.appendChild(el("h3", null, esc(title) + (count ? ' <span class="count">' + count + "</span>" : "")));
    if (moreHref) {
      var a = el("a", null, "See all \u2192");
      a.href = moreHref;
      head.appendChild(a);
    }
    sec.appendChild(head);
    var wrap = el("div", "row-wrap");
    wrap.innerHTML = '<button class="row-btn prev" title="Scroll left"><svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg></button>' +
      '<button class="row-btn next" title="Scroll right"><svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg></button>';
    var row = el("div", "row");
    wrap.appendChild(row);
    sec.appendChild(wrap);
    parent.appendChild(sec);
    rowScroller(wrap);
    return row;
  }

  /* ---------------- router ---------------- */
  var view, firstRoute = true;
  function go(hash) { location.hash = hash; }
  function route() {
    var hash = location.hash || "#/home";
    var parts = hash.replace(/^#\//, "").split("?");
    var seg = parts[0].split("/").filter(Boolean);
    var q = {};
    (parts[1] || "").split("&").forEach(function (kv) {
      var p = kv.split("=");
      if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || "");
    });
    if (Player._key) { document.removeEventListener("keydown", Player._key); Player._key = null; }
    Player.close();

    document.querySelectorAll("#nav a").forEach(function (a) {
      a.classList.toggle("active", seg[0] === a.dataset.nav);
    });
    document.getElementById("sidebar").classList.remove("open");
    document.getElementById("scrim").classList.remove("on");

    var title = "Home";
    view.innerHTML = "";

    switch (seg[0]) {
      case "store": title = "Store"; StoreView(); break;
      case "library": title = "Library"; LibraryView(q); break;
      case "series":
        title = "Series";
        if (seg[1]) SeriesDetailView(seg[1]); else SeriesView();
        break;
      case "emulation": title = "Emulation"; window.Emu.page(view, q); break;
      case "settings": title = "Settings"; SettingsView(); break;
      case "play": title = "Now playing"; PlayRoute(seg[1]); break;
      default: title = "Home"; HomeView();
    }
    document.getElementById("page-title").textContent = title;
    document.title = (T().getSettings().cloak === "off" ? "\u26c2 Archive" : document.title);
  }

  /* ---------------- HOME ---------------- */
  function HomeView() {
    var page = el("div", "page");
    view.appendChild(page);

    var hero = el("div", "hero");
    var genreCount = Object.keys(A.games.reduce(function (m, g) { m[g[3]] = 1; return m; }, {})).length;
    var platCount = Object.keys(A.games.reduce(function (m, g) { if (g[5]) m[g[5]] = 1; return m; }, {})).length;
    var liveCount = liveList(A.games).length;
    hero.innerHTML =
      "<h1>Your shelf of playables.<br><em>Open. Play. Done.</em></h1>" +
      "<p>A quiet, private library of " + liveCount.toLocaleString() + " games \u2014 browser classics, flash-era legends and full retro consoles. Everything runs straight from this site.</p>" +
      '<div class="hero-actions"><a class="btn btn-primary" href="#/library">Your library</a><a class="btn btn-secondary" href="#/store">Browse store</a></div>' +
      '<div class="hero-stats"><div class="hero-stat"><b>' + liveCount.toLocaleString() + "</b><span>games</span></div>" +
      '<div class="hero-stat"><b>' + A.series.length + "</b><span>series</span></div>" +
      '<div class="hero-stat"><b>' + genreCount + "</b><span>genres</span></div>" +
      '<div class="hero-stat"><b>' + platCount + "</b><span>consoles</span></div></div>";
    page.appendChild(hero);

    // featured
    var featGames = liveList(A.featured.map(function (k) { return byKey[k]; }).filter(Boolean));
    var row = makeRow(page, "Featured", featGames.length, "#/store");
    featGames.forEach(function (g) { row.appendChild(gameCard(g)); });

    // series carousel (4 per view)
    var top = A.series.slice(0, 12);
    var srow = makeRow(page, "Series", A.series.length + " total", "#/series");
    srow.classList.add("dense");
    srow.style.setProperty("--n", 4);
    top.forEach(function (s) { srow.appendChild(seriesCard(s)); });

    // trending
    var TREND = ["eaglercraftx1206", "retrobowl", "FNAF", "slopeplus", "ovofixed", "smashkartsworking", "getawayshootout", "1v1maybeidk", "subwaysurferslondon", "bitlife", "cookieclicker", "motox3mm", "kourio", "justfalllol", "btd5", "basketrandom", "monkeymart", "webfishing", "blockblast", "nubbysnumberfactory", "tanukisunset", "driftboss", "2048", "grannyy", "drifthuntersmerge", "pvz", "run3", "vampiresurvivors", "amongus", "rooftopsnipers"];
    var trendGames = liveList(TREND.map(function (k) { return byKey[k]; }).filter(Boolean));
    var trow = makeRow(page, "Trending now", "", "#/library?sort=trending");
    trendGames.forEach(function (g) { trow.appendChild(gameCard(g)); });

    // genres quick access
    var gsec = el("div", "section");
    gsec.appendChild(el("div", "section-head", "<h3>Browse by genre</h3>"));
    var chips = el("div", "chips");
    var genres = {};
    A.games.forEach(function (g) { genres[g[3]] = (genres[g[3]] || 0) + 1; });
    Object.keys(genres).sort(function (a, b) { return genres[b] - genres[a]; }).forEach(function (gname) {
      var c = el("button", "chip", esc(gname === "td" ? "tower defense" : gname) + " \u00b7 " + genres[gname]);
      c.onclick = function () { go("#/library?genre=" + gname); };
      chips.appendChild(c);
    });
    gsec.appendChild(chips);
    page.appendChild(gsec);

    // fresh picks (daily seed)
    var day = Math.floor(Date.now() / 86400000);
    var picks = seededPick(liveList(A.games), 12, day);
    var prow = makeRow(page, "Fresh on the shelf", "");
    picks.forEach(function (g) { prow.appendChild(gameCard(g)); });
  }

  /* ---------------- STORE ---------------- */
  function StoreView() {
    var page = el("div", "page");
    view.appendChild(page);
    page.appendChild(el("div", "page-head", '<div><div class="sub">Everything on the shelf \u2014 free, instant, local.</div></div>'));

    var featGames = liveList(A.featured.map(function (k) { return byKey[k]; }).filter(Boolean));
    var gsec = el("div", "section");
    gsec.appendChild(el("div", "section-head", "<h3>Featured picks</h3>" + '<a href="#/library">Full library \u2192</a>'));
    var grid = el("div", "grid");
    featGames.forEach(function (g) { grid.appendChild(gameCard(g)); });
    gsec.appendChild(grid);
    page.appendChild(gsec);

    // series spotlight
    var srow = makeRow(page, "Complete series", A.series.length + "", "#/series");
    srow.style.setProperty("--n", 4);
    A.series.slice(0, 10).forEach(function (s) { srow.appendChild(seriesCard(s)); });

    // genre shelves
    var byGenre = {};
    liveList(A.games).forEach(function (g) { (byGenre[g[3]] = byGenre[g[3]] || []).push(g); });
    Object.keys(byGenre).sort(function (a, b) { return byGenre[b].length - byGenre[a].length; }).forEach(function (gname) {
      var list = byGenre[gname];
      var row = makeRow(page, (gname === "td" ? "Tower defense" : gname.charAt(0).toUpperCase() + gname.slice(1)), list.length + " games", "#/library?genre=" + gname);
      list.slice().sort(function (a, b) { return a[2].localeCompare(b[2]); })
        .slice(0, 18).forEach(function (g) { row.appendChild(gameCard(g)); });
    });
  }

  /* ---------------- LIBRARY ---------------- */
  var libState = { q: "", genre: "", platform: "", series: "", sort: "az", mode: "grid", rendered: 0, filtered: [] };

  function LibraryView(q) {
    libState.q = q.q || "";
    libState.genre = q.genre || "";
    libState.platform = q.platform || "";
    libState.series = q.series || "";
    libState.sort = q.sort || "az";
    libState.rendered = 0;

    var page = el("div", "page");
    view.appendChild(page);
    page.appendChild(el("div", "page-head",
      '<div><div class="sub">Favorites, your uploads and every game on the shelf.</div></div>'));

    // toolbar
    var bar = el("div", "toolbar");
    var search = el("input");
    search.type = "search"; search.placeholder = "Filter by name\u2026"; search.value = libState.q;
    search.id = "lib-search";
    var genreSel = el("select");
    var platformSel = el("select");
    var sortSel = el("select");
    genreSel.innerHTML = '<option value="">All genres</option>';
    var genres = {};
    A.games.forEach(function (g) { genres[g[3]] = 1; });
    Object.keys(genres).sort().forEach(function (g) {
      genreSel.insertAdjacentHTML("beforeend", '<option value="' + g + '"' + (libState.genre === g ? " selected" : "") + ">" + esc(g === "td" ? "tower defense" : g) + "</option>");
    });
    var plats = {};
    A.games.forEach(function (g) { if (g[5]) plats[g[5]] = 1; });
    platformSel.innerHTML = '<option value="">All platforms</option>';
    Object.keys(plats).sort().forEach(function (p) {
      platformSel.insertAdjacentHTML("beforeend", '<option value="' + p + '"' + (libState.platform === p ? " selected" : "") + ">" + esc(p) + "</option>");
    });
    sortSel.innerHTML =
      '<option value="az">A \u2192 Z</option><option value="za">Z \u2192 A</option><option value="trending">Trending first</option><option value="random">Shuffle</option>';
    sortSel.value = libState.sort;
    var seg = el("div", "seg");
    seg.innerHTML = '<button data-m="grid" class="on" title="Grid"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg></button>' +
      '<button data-m="list" title="List"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16"/></svg></button>';
    seg.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.m === libState.mode);
      b.onclick = function () {
        seg.querySelectorAll("button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        libState.mode = b.dataset.m;
        renderAll();
      };
    });
    bar.appendChild(search); bar.appendChild(genreSel); bar.appendChild(platformSel); bar.appendChild(sortSel); bar.appendChild(seg);
    page.appendChild(bar);

    if (libState.series && seriesByKey[libState.series]) {
      var note = el("div", "chips");
      var c = el("button", "chip on", "Series: " + esc(seriesByKey[libState.series][1]) + " \u00d7");
      c.onclick = function () { go("#/library"); };
      note.appendChild(c);
      page.appendChild(note);
    }

    var favSec = el("div", "section", "", null);
    favSec.id = "lib-favs";
    page.appendChild(favSec);

    var upSec = el("div", "section");
    upSec.id = "lib-uploads";
    page.appendChild(upSec);

    var allSec = el("div", "section");
    allSec.appendChild(el("div", "section-head", '<h3>All games</h3><span class="count" id="lib-count"></span>'));
    var allGrid = el("div", "grid");
    allGrid.id = "lib-grid";
    allSec.appendChild(allGrid);
    var allList = el("div", "list-rows");
    allList.id = "lib-list";
    allList.style.display = "none";
    allSec.appendChild(allList);
    var sentinel = el("div");
    sentinel.style.height = "10px";
    allSec.appendChild(sentinel);
    page.appendChild(allSec);

    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) renderMore();
    }, { rootMargin: "600px" });
    io.observe(sentinel);

    function currentFiltered() {
      var list = liveList(A.games.slice());
      var ups = uploadsAsGames();
      if (libState.q) {
        var q = libState.q.toLowerCase();
        list = list.filter(function (g) { return g[2].toLowerCase().indexOf(q) >= 0; });
      }
      if (libState.genre) list = list.filter(function (g) { return g[3] === libState.genre; });
      if (libState.platform) list = list.filter(function (g) { return g[5] === libState.platform; });
      if (libState.series) list = list.filter(function (g) { return g[4] === libState.series; });
      if (libState.sort === "az") list.sort(function (a, b) { return a[2].localeCompare(b[2]); });
      if (libState.sort === "za") list.sort(function (a, b) { return b[2].localeCompare(a[2]); });
      if (libState.sort === "trending") {
        list.sort(function (a, b) {
          var ia = A.featured.indexOf(a[1]), ib = A.featured.indexOf(b[1]);
          if (ia >= 0 && ib >= 0) return ia - ib;
          if (ia >= 0) return -1;
          if (ib >= 0) return 1;
          return a[2].localeCompare(b[2]);
        });
      }
      if (libState.sort === "random") list = seededPick(list, list.length, Date.now() % 9999);
      // uploads always included at top of "all" when no filters conflict
      var upFiltered = ups.filter(function (u) {
        return (!libState.q || u.name.toLowerCase().indexOf(libState.q.toLowerCase()) >= 0) &&
          (!libState.genre || libState.genre === "upload") && !libState.platform && !libState.series;
      });
      return upFiltered.concat(list);
    }

    function renderAll() {
      libState.filtered = currentFiltered();
      libState.rendered = 0;
      allGrid.innerHTML = "";
      allList.innerHTML = "";
      document.getElementById("lib-count").textContent = libState.filtered.length.toLocaleString() + " games";
      renderMore();
      renderFavSection();
    }

    function renderMore() {
      var CHUNK = 140;
      var target = libState.mode === "grid" ? allGrid : allList;
      if (libState.rendered >= libState.filtered.length) return;
      var frag = document.createDocumentFragment();
      var end = Math.min(libState.rendered + CHUNK, libState.filtered.length);
      for (var i = libState.rendered; i < end; i++) {
        frag.appendChild(libState.mode === "grid" ? gameCard(libState.filtered[i]) : gameRow(libState.filtered[i]));
      }
      target.appendChild(frag);
      libState.rendered = end;
      allGrid.style.display = libState.mode === "grid" ? "" : "none";
      allList.style.display = libState.mode === "list" ? "" : "none";
    }

    function renderFavSection() {
      // favorites
      favSec.innerHTML = "";
      var favGames = favs.map(function (id) {
        if (id.indexOf("up:") === 0) {
          var uid = id.slice(3);
          var u = uploadsCache.filter(function (x) { return x.id === uid; })[0];
          return u ? uploadsAsGames().filter(function (x) { return x.id === uid; })[0] : null;
        }
        return gameById(id);
      }).filter(Boolean);
      var head = el("div", "section-head", "<h3>Favorites</h3>" + (favGames.length ? '<span class="count">' + favGames.length + "</span>" : ""));
      favSec.appendChild(head);
      if (!favGames.length) {
        favSec.appendChild(el("div", "empty", "\u2661 Games you favorite land here."));
      } else {
        var grid = el("div", "grid dense");
        favGames.forEach(function (g) { grid.appendChild(gameCard(g)); });
        favSec.appendChild(grid);
      }

      // uploads
      upSec.innerHTML = "";
      upSec.appendChild(el("div", "section-head", "<h3>My uploads</h3>" +
        '<button class="btn btn-secondary btn-sm" id="lib-add">Add games</button>'));
      if (!uploadsCache.length) {
        upSec.appendChild(el("div", "empty",
          "Add Google Drive links or your own HTML files \u2014 they stay on this device."));
      } else {
        uploadsCache.forEach(function (u) {
          var r = el("div", "uprow");
          r.innerHTML = '<div class="udot">' + (u.kind === "link" ?
            '<svg viewBox="0 0 24 24"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7L12.5 19"/></svg>' :
            '<svg viewBox="0 0 24 24"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>') + "</div>" +
            '<div class="umeta"><b>' + esc(u.name) + "</b><span>" + (u.kind === "link" ? "link" : "html \u00b7 " + fmtSize(u.size)) +
            (u.sanitized ? " \u00b7 sanitized" : "") + " \u00b7 added " + new Date(u.added).toLocaleDateString() + "</span></div>" +
            '<button class="pbtn up-play">' + ICONS.play + "Play</button>" +
            '<button class="icon-btn up-ren" title="Rename"><svg viewBox="0 0 24 24"><path d="M4 20h4L20 8l-4-4L4 16z"/></svg></button>' +
            '<button class="icon-btn up-del" title="Remove"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg></button>';
          r.querySelector(".up-play").onclick = function () { go("#/play/up:" + u.id); };
          r.querySelector(".up-del").onclick = function () {
            window.Uploads.remove(u.id).then(function () {
              var i = favs.indexOf("up:" + u.id);
              if (i >= 0) { favs.splice(i, 1); saveFavs(); }
              refreshUploads().then(renderAll);
              T().toast("Removed.", "ok");
            });
          };
          r.querySelector(".up-ren").onclick = function () {
            promptDialog("Rename upload", u.name, function (val) {
              window.Uploads.rename(u.id, val).then(function () { refreshUploads().then(renderAll); });
            });
          };
          upSec.appendChild(r);
        });
      }
      var addBtn = document.getElementById("lib-add");
      if (addBtn) addBtn.onclick = function () { openUploadDialog(renderAll); };
    }

    search.addEventListener("input", function () {
      libState.q = search.value;
      renderAll();
    });
    genreSel.onchange = function () { libState.genre = genreSel.value; renderAll(); };
    platformSel.onchange = function () { libState.platform = platformSel.value; renderAll(); };
    sortSel.onchange = function () { libState.sort = sortSel.value; renderAll(); };

    refreshUploads().then(renderAll);
  }

  /* ---------------- SERIES ---------------- */
  function SeriesView() {
    var page = el("div", "page");
    view.appendChild(page);
    page.appendChild(el("div", "page-head",
      '<div><div class="sub">Full franchises, ranked. The bigger the legend, the higher it sits.</div></div>'));
    var grid = el("div", "grid");
    grid.style.gridTemplateColumns = "repeat(auto-fill, minmax(210px, 1fr))";
    A.series.forEach(function (s) { grid.appendChild(seriesCard(s)); });
    page.appendChild(grid);
  }

  function SeriesDetailView(key) {
    var s = seriesByKey[key];
    if (!s) { go("#/series"); return; }
    var games = liveList(A.games.filter(function (g) { return g[4] === key; }));
    if (key === "fnf") games = liveList(A.games.filter(function (g) { return g[4] === "fnf"; }));
    games.sort(function (a, b) { return a[2].localeCompare(b[2], undefined, { numeric: true }); });
    var page = el("div", "page");
    view.appendChild(page);
    var back = el("a", null, "\u2190 All series");
    back.href = "#/series";
    back.className = "link";
    back.style.cssText = "color:var(--muted);font-size:13px;font-weight:600;display:inline-block;margin-bottom:10px";
    page.appendChild(back);
    var hero = el("div", "hero");
    hero.style.padding = "28px 30px";
    hero.innerHTML = "<h1 style='font-size:26px'>" + esc(s[1]) + "</h1>" +
      "<p>" + games.length + " games \u00b7 ranked #" + s[2] + " of " + A.series.length + "</p>";
    page.appendChild(hero);
    var grid = el("div", "grid");
    games.forEach(function (g) { grid.appendChild(gameCard(g)); });
    page.appendChild(grid);
  }

  /* ---------------- SETTINGS ---------------- */
  function SettingsView() {
    var page = el("div", "page");
    view.appendChild(page);
    page.appendChild(el("div", "page-head", '<div><div class="sub">Device, stealth, tools and library.</div></div>'));
    var s = T().getSettings();
    var D = window.Dev;

    // device
    var d = el("div", "set-card");
    d.innerHTML = "<h4><svg viewBox='0 0 24 24'><rect x='5' y='10' width='14' height='10' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/></svg>Device &amp; access</h4>";
    var devId = (window.Auth.deviceId || "----").match(/.{1,4}/g);
    d.insertAdjacentHTML("beforeend",
      '<div class="set-row"><div class="lbl"><b>Device ID</b><span>' + (devId ? devId.join("\u2011") : "\u2014") + "</span></div></div>" +
      '<div class="set-row"><div class="lbl"><b>Unlocked</b><span>' + (window.Auth.unlockedAt ? new Date(window.Auth.unlockedAt).toLocaleString() : "this session") + "</span></div></div>" +
      '<div class="set-row"><div class="lbl"><b>Lock this device</b><span>Forget the unlock and require the key again.</span></div>' +
      '<button class="btn btn-danger btn-sm" id="set-lock">Lock now</button></div>');
    page.appendChild(d);

    // library & uploads
    var li = el("div", "set-card");
    li.innerHTML = "<h4><svg viewBox='0 0 24 24'><path d='M4 4h5v16H4zM10.5 4h3v16h-3z'/><path d='m15 4.5 4.5 15 2-.6-4.5-15z'/></svg>Library &amp; uploads</h4>" +
      '<div class="set-row"><div class="lbl"><b>Add games</b><span>Google Drive links or your own HTML files \u2014 they stay on this device.</span></div>' +
      '<button class="btn btn-secondary btn-sm" id="set-addgames">Add games</button></div>' +
      '<div class="set-row"><div class="lbl"><b>Uploads</b><span>' + uploadsCache.length + " on this device</span></div>" +
      '<a class="btn btn-ghost btn-sm" href="#/library">View library</a></div>';
    page.appendChild(li);

    // stealth
    var st = el("div", "set-card");
    st.innerHTML = "<h4><svg viewBox='0 0 24 24'><path d='M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z'/></svg>Stealth</h4>";
    var cloakOpts = Object.keys(T().CLOAKS).map(function (k) {
      var label = k === "off" ? "Off (\u26c2 Archive)" : k === "classroom" ? "Google Classroom" : k === "drive" ? "Google Drive" : k === "docs" ? "Google Docs" : k === "canvas" ? "Canvas" : "Clever";
      return '<option value="' + k + '"' + (s.cloak === k ? " selected" : "") + ">" + label + "</option>";
    }).join("");
    st.insertAdjacentHTML("beforeend",
      '<div class="set-row"><div class="lbl"><b>Tab cloak</b><span>Disguise the tab title + icon.</span></div><select id="set-cloak">' + cloakOpts + "</select></div>" +
      '<div class="set-row"><div class="lbl"><b>Panic key</b><span>Press it anywhere to bail out instantly.</span></div>' +
      '<input id="set-panic" class="kbd" style="width:70px;text-align:center" value="' + esc(s.panicKey) + '" maxlength="1"></div>' +
      '<div class="set-row"><div class="lbl"><b>Panic destination</b><span>Where the panic key sends you.</span></div>' +
      '<input id="set-panicurl" style="width:230px" value="' + esc(s.panicUrl) + '"></div>');
    page.appendChild(st);

    // tools
    var tl = el("div", "set-card");
    tl.innerHTML = "<h4><svg viewBox='0 0 24 24'><path d='M9 3.5v7L4.8 18a2.4 2.4 0 0 0 2 3.5h10.4a2.4 2.4 0 0 0 2-3.5L15 10.5v-7z'/><path d='M7 3.5h10'/></svg>Tools</h4>" +
      '<div class="set-row"><div class="lbl"><b>Auto clicker</b><span>Rate ' + s.acCps + " cps \u00b7 " + (s.acMode === "follow" ? "follows cursor" : "fixed point") + ' \u00b7 hotkey <span class="kbd">Alt+A</span></span></div>' +
      '<button class="btn btn-secondary btn-sm" id="set-ac">Open</button></div>' +
      '<div class="set-row"><div class="lbl"><b>Shortcuts</b><span><span class="kbd">Ctrl+K</span> search \u00b7 <span class="kbd">Alt+A</span> clicker \u00b7 <span class="kbd">F</span> fullscreen (in game) \u00b7 <span class="kbd">`</span> panic</span></div></div>';
    page.appendChild(tl);

    // cloud sync (covers + removals via Firebase Realtime Database)
    var cl = el("div", "set-card");
    var fbState = D.firebaseOn
      ? (D.cloudOk === false ? "connected, but the database refused \u2014 check rules" : "syncing covers &amp; removals")
      : "off \u2014 covers stay on this device only";
    cl.innerHTML = "<h4><svg viewBox='0 0 24 24'><path d='M7 18a4.5 4.5 0 0 1-.5-9A6 6 0 0 1 18.3 8.5 4 4 0 0 1 17.5 18z'/></svg>Cloud sync</h4>" +
      '<div class="set-row"><div class="lbl"><b>Firebase</b><span>' + fbState + "</span></div>" +
      (D.firebaseOn
        ? '<button class="btn btn-secondary btn-sm" id="set-fb-sync">Sync now</button><button class="btn btn-danger btn-sm" id="set-fb-off" style="margin-left:6px">Disconnect</button>'
        : '<button class="btn btn-secondary btn-sm" id="set-fb-on">Connect</button>') + "</div>" +
      '<div class="set-row"><div class="lbl"><b>Covers &amp; edits</b><span>' + Object.keys(D.covers).length + ' cover' + (Object.keys(D.covers).length === 1 ? "" : "s") + " \u00b7 " + D.dropCount() + ' removed</span></div>' +
      '<button class="btn btn-secondary btn-sm" id="set-cov-export">Export</button>' +
      '<label class="btn btn-secondary btn-sm" style="margin:0 6px">Import<input type="file" id="set-cov-import" accept=".json" hidden></label></div>';
    page.appendChild(cl);

    // developer
    var dv = el("div", "set-card");
    if (D.active) {
      dv.innerHTML = "<h4><svg viewBox='0 0 24 24'><path d='m8 8-4.5 4.5L8 17M16 8l4.5 4.5L16 17M13 5l-2.5 14'/></svg>Developer</h4>" +
        '<div class="set-row"><div class="lbl"><b>Mode</b><span>Unlocked on this device. Game cards show remove / cover buttons.</span></div>' +
        '<button class="btn btn-danger btn-sm" id="set-dev-lock">Lock</button></div>' +
        '<div class="set-row"><div class="lbl"><b>Removed games</b><span>' + D.dropCount() + ' hidden \u00b7 synced</span></div>' +
        '<button class="btn btn-secondary btn-sm" id="set-dev-restore">Restore all</button></div>' +
        '<div class="set-row"><div class="lbl"><b>Google image search</b><span>Optional: a Custom Search key + cx gives the cover finder real Google results (100/day free).</span></div>' +
        '<button class="btn btn-secondary btn-sm" id="set-dev-cse">' + (D.cseOn ? "Manage" : "Add key") + "</button></div>";
    } else {
      dv.innerHTML = "<h4><svg viewBox='0 0 24 24'><path d='m8 8-4.5 4.5L8 17M16 8l4.5 4.5L16 17'/></svg>Developer</h4>" +
        '<div class="set-row"><div class="lbl"><b>Developer mode</b><span>Remove games and set covers from inside the library.</span></div>' +
        '<button class="btn btn-secondary btn-sm" id="set-dev-enter">Enter code</button></div>';
    }
    page.appendChild(dv);

    // data
    var da = el("div", "set-card");
    da.innerHTML = "<h4><svg viewBox='0 0 24 24'><ellipse cx='12' cy='5.5' rx='8' ry='3'/><path d='M4 5.5V12c0 1.7 3.6 3 8 3s8-1.3 8-3V5.5'/><path d='M4 12v6.5c0 1.7 3.6 3 8 3s8-1.3 8-3V12'/></svg>Data</h4>" +
      '<div class="set-row"><div class="lbl"><b>Favorites</b><span>' + favs.length + ' saved</span></div></div>' +
      '<div class="set-row"><div class="lbl"><b>Backup</b><span>Favorites + uploads as one file.</span></div>' +
      '<button class="btn btn-secondary btn-sm" id="set-export">Export</button>' +
      '<label class="btn btn-secondary btn-sm" style="margin:0 6px">Import<input type="file" id="set-import" accept=".json" hidden></label></div>' +
      '<div class="set-row"><div class="lbl"><b>Reset</b><span>Wipes favorites, uploads, covers and settings on this device.</span></div>' +
      '<button class="btn btn-danger btn-sm" id="set-wipe">Wipe</button></div>';
    page.appendChild(da);

    // ---- wiring ----
    d.querySelector("#set-lock").onclick = function () { window.Auth.lock(); };
    li.querySelector("#set-addgames").onclick = function () {
      openUploadDialog(function () { route(); });
    };
    st.querySelector("#set-cloak").onchange = function (e) {
      T().saveSettings({ cloak: e.target.value });
      T().applyCloak(e.target.value);
      T().toast("Cloak applied.", "ok");
    };
    st.querySelector("#set-panic").onchange = function (e) {
      T().saveSettings({ panicKey: e.target.value || "`" });
      T().toast("Panic key set.", "ok");
    };
    st.querySelector("#set-panicurl").onchange = function (e) {
      T().saveSettings({ panicUrl: e.target.value.trim() || "https://classroom.google.com/" });
    };
    tl.querySelector("#set-ac").onclick = function () { T().AC.show(); };
    if (D.firebaseOn) {
      var syncBtn = cl.querySelector("#set-fb-sync");
      if (syncBtn) syncBtn.onclick = function () {
        D.pullState();
        T().toast("Syncing\u2026", "ok");
      };
      cl.querySelector("#set-fb-off").onclick = function () {
        D.clearFirebase();
        T().toast("Cloud sync disconnected.", "ok");
        route();
      };
    } else {
      cl.querySelector("#set-fb-on").onclick = function () { openFirebaseDialog(); };
    }
    cl.querySelector("#set-cov-export").onclick = function () {
      var blob = new Blob([D.exportJSON()], { type: "application/json" });
      var a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "archive-covers.json";
      a.click();
    };
    cl.querySelector("#set-cov-import").onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        var err = D.importJSON(rd.result);
        if (err) T().toast(err, "err");
        else { T().toast("Covers imported.", "ok"); route(); }
      };
      rd.readAsText(f);
    };
    if (D.active) {
      dv.querySelector("#set-dev-lock").onclick = function () {
        D.lockDev();
        T().toast("Developer mode locked.", "ok");
        route();
      };
      dv.querySelector("#set-dev-restore").onclick = function () {
        confirmDialog("Restore all removed games?", "Every hidden game comes back on all synced devices.", function () {
          D.restoreAll();
          T().toast("All games restored.", "ok");
          route();
        });
      };
      dv.querySelector("#set-dev-cse").onclick = function () { openCSEDialog(); };
    } else {
      dv.querySelector("#set-dev-enter").onclick = function () {
        promptDialog("Developer code", "", function (val) {
          if (D.tryCode(val)) {
            T().toast("Developer mode unlocked \u2014 this device remembers it.", "ok");
            route();
          } else {
            T().toast("That code doesn\u2019t work.", "err");
          }
        });
      };
    }
    da.querySelector("#set-export").onclick = function () {
      Promise.all([window.Uploads.exportAll()]).then(function (r) {
        var payload = JSON.stringify({ favorites: favs, uploads: JSON.parse(r[0]) });
        var blob = new Blob([payload], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "archive-backup.json";
        a.click();
      });
    };
    da.querySelector("#set-import").onchange = function (e) {
      var f = e.target.files[0];
      if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var data = JSON.parse(rd.result);
          if (Array.isArray(data.favorites)) { favs = data.favorites; saveFavs(); }
          window.Uploads.importAll(JSON.stringify(data.uploads || [])).then(function (n) {
            refreshUploads().then(function () {
              T().toast("Imported " + (data.favorites ? data.favorites.length : 0) + " favorites, " + n + " uploads.", "ok");
            });
          });
        } catch (err) { T().toast("That file didn\u2019t parse.", "err"); }
      };
      rd.readAsText(f);
    };
    da.querySelector("#set-wipe").onclick = function () {
      confirmDialog("Wipe this device?", "Favorites, uploads, covers and settings will be erased. The access key will be required again.", function () {
        try { localStorage.clear(); } catch (e) { }
        indexedDB.deleteDatabase("arc-uploads");
        location.reload();
      });
    };
  }

  /* ---------------- FIREBASE / CSE DIALOGS ---------------- */
  function openFirebaseDialog() {
    var root = document.getElementById("modal-root");
    root.hidden = false;
    root.innerHTML = "";
    var m = el("div", "modal-card");
    m.innerHTML =
      '<button class="icon-btn modal-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      "<h3>Connect Firebase</h3>" +
      "<div class='msub'>Covers and removals sync across every device through your own Firebase Realtime Database.</div>" +
      '<div class="cov-steps"><b>One-time setup (2 min):</b>' +
      "<ol><li>Go to <b>console.firebase.google.com</b> \u2192 Add project (anything works).</li>" +
      "<li>Build \u2192 <b>Realtime Database</b> \u2192 Create database \u2192 start in <b>test mode</b>.</li>" +
      "<li>Project settings (gear) \u2192 Your apps \u2192 Web app \u2192 copy the <b>firebaseConfig</b> object.</li>" +
      "<li>Paste the whole config below.</li></ol></div>" +
      '<div class="field"><label>Paste firebaseConfig here</label>' +
      '<textarea id="fb-cfg" style="min-height:120px;font-family:var(--mono);font-size:12px" placeholder=\'{ "apiKey": "\u2026", "databaseURL": "https://\u2026.firebaseio.com", "projectId": "\u2026" }\'></textarea></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-secondary btn-sm" id="fb-no">Cancel</button><button class="btn btn-primary btn-sm" id="fb-yes">Connect</button></div>';
    root.appendChild(m);
    var close = function () { root.hidden = true; root.innerHTML = ""; };
    m.querySelector(".modal-x").onclick = close;
    m.querySelector("#fb-no").onclick = close;
    m.querySelector("#fb-yes").onclick = function () {
      var txt = m.querySelector("#fb-cfg").value;
      txt = txt.replace(/^[^{]*=/, "").replace(/;\s*$/, "");
      var err = window.Dev.setFirebase(txt);
      if (err) T().toast(err, "err");
      else { close(); T().toast("Firebase connected \u2014 syncing.", "ok"); route(); }
    };
  }

  function openCSEDialog() {
    var root = document.getElementById("modal-root");
    root.hidden = false;
    root.innerHTML = "";
    var m = el("div", "modal-card");
    m.innerHTML =
      '<button class="icon-btn modal-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      "<h3>Google image search (optional)</h3>" +
      "<div class='msub'>With a free Custom Search key the cover finder uses real Google image results. Without it, Wikipedia + Openverse are used.</div>" +
      '<div class="field"><label>API key</label><input id="cse-key" placeholder="AIza\u2026"></div>' +
      '<div class="field"><label>Search engine ID (cx)</label><input id="cse-cx" placeholder="\u2026:\u2026"></div>' +
      '<div class="hint" style="margin-bottom:12px">programmablesearchengine.google.com \u2192 create one with \u201Csearch the entire web\u201D + image search ON \u2192 copy the cx. Then console.cloud.google.com \u2192 APIs &amp; Services \u2192 Custom Search API \u2192 Credentials \u2192 API key.</div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-secondary btn-sm" id="cse-no">Done</button><button class="btn btn-primary btn-sm" id="cse-yes">Save</button></div>';
    root.appendChild(m);
    var close = function () { root.hidden = true; root.innerHTML = ""; };
    m.querySelector(".modal-x").onclick = close;
    m.querySelector("#cse-no").onclick = close;
    m.querySelector("#cse-yes").onclick = function () {
      window.Dev.setCSE(m.querySelector("#cse-key").value, m.querySelector("#cse-cx").value);
      close();
      T().toast(window.Dev.cseOn ? "Google search saved." : "Google search cleared.", "ok");
    };
  }

  /* ---------------- COVER PICKER (dev) ---------------- */
  function openCoverPicker(slug, name) {
    var D = window.Dev;
    var root = document.getElementById("modal-root");
    root.hidden = false;
    root.innerHTML = "";
    var m = el("div", "modal-card cov-modal");
    m.innerHTML =
      '<button class="icon-btn modal-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      "<h3>Cover \u2014 " + esc(name) + "</h3>" +
      '<div class="cov-search"><input id="cov-q" placeholder="Search images\u2026"><button class="btn btn-primary btn-sm" id="cov-go">Search</button></div>' +
      '<div class="cov-status" id="cov-status"></div>' +
      '<div class="cov-grid" id="cov-grid"></div>' +
      '<div class="cov-foot">' +
      '  <div class="cov-cur" id="cov-cur"></div>' +
      '  <div class="cov-actions"><button class="btn btn-secondary btn-sm" id="cov-back"><svg viewBox="0 0 24 24" style="width:14px;height:14px"><path d="M15 5l-7 7 7 7"/></svg>Back</button>' +
      '  <button class="btn btn-danger btn-sm" id="cov-clear">Remove cover</button></div>' +
      "</div>";
    root.appendChild(m);
    var q = m.querySelector("#cov-q"), status = m.querySelector("#cov-status"),
      grid = m.querySelector("#cov-grid"), cur = m.querySelector("#cov-cur"),
      backBtn = m.querySelector("#cov-back");
    var close = function () { root.hidden = true; root.innerHTML = ""; };

    function paintCur() {
      var url = D.currentCover(slug);
      cur.innerHTML = url
        ? '<img src="' + esc(url) + '" alt="" referrerpolicy="no-referrer"><span>current</span>'
        : '<i class="mini t-rpg">' + esc(name.charAt(0).toUpperCase()) + "</i><span>letter tile (no cover)</span>";
      backBtn.disabled = !(D.currentCover(slug));
    }
    function run(searchText) {
      status.innerHTML = '<div class="spinner" style="width:22px;height:22px"></div><span>Searching \u201C' + esc(searchText) + "\u201D\u2026</span>";
      grid.innerHTML = "";
      D.searchCovers(searchText, function (results, err) {
        if (err && !results.length) {
          status.innerHTML = "<span class='cov-err'>Search failed \u2014 the network blocked it. Try again.</span>";
          return;
        }
        if (!results.length) {
          status.innerHTML = "<span class='cov-err'>No relevant images found for \u201C" + esc(searchText) + "\u201D. Only clear matches for this game are shown \u2014 try a more exact name.</span>";
          return;
        }
        status.innerHTML = "<span>" + results.length + " match" + (results.length > 1 ? "es" : "") + " \u00b7 click to apply</span>";
        results.forEach(function (r) {
          var cell = el("button", "cov-cell");
          cell.innerHTML = '<img src="' + esc(r.url) + '" alt="" loading="lazy" referrerpolicy="no-referrer"><i class="cov-src">' + esc(r.src) + "</i>";
          cell.onclick = function () {
            D.applyCover(slug, r.url);
            T().toast("Cover set.", "ok");
            paintCur();
            route();
          };
          grid.appendChild(cell);
        });
      });
    }

    m.querySelector(".modal-x").onclick = close;
    m.querySelector("#cov-go").onclick = function () { run(q.value.trim() || name); };
    q.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); run(q.value.trim() || name); } });
    backBtn.onclick = function () {
      var prev = D.revertCover(slug);
      T().toast(prev ? "Went back to the previous cover." : "Back to the letter tile.", "ok");
      paintCur();
      route();
    };
    m.querySelector("#cov-clear").onclick = function () {
      D.applyCover(slug, null);
      T().toast("Cover removed.", "ok");
      paintCur();
      route();
    };
    q.value = name + " game cover";
    paintCur();
    run(q.value);
  }

  /* ---------------- PLAY ROUTE ---------------- */
  function PlayRoute(id) {
    if (id.indexOf("up:") === 0) {
      var uid = id.slice(3);
      window.Uploads.get(uid).then(function (u) {
        if (!u) { T().toast("That upload is gone.", "err"); go("#/library"); return; }
        var g = { kind: u.kind, id: u.id, key: "up:" + u.id, name: u.name, genre: "upload", series: "" };
        if (u.kind === "html") { g.blobUrl = window.Uploads.serve(u); g.blobRevoke = true; }
        else { g.url = u.url; g.view = u.view; }
        Player.open(g);
        document.getElementById("page-title").textContent = u.name;
      });
      return;
    }
    Player.resolve(id, function (g) {
      if (!g) { T().toast("Game not found.", "err"); go("#/library"); return; }
      Player.open(g);
      document.getElementById("page-title").textContent = g.name;
    });
  }

  /* ---------------- SEARCH ---------------- */
  var searchOverlay, searchInput, searchResults, selIdx = -1;
  function openSearch() {
    searchOverlay.hidden = false;
    searchInput.value = "";
    searchResults.innerHTML = "";
    selIdx = -1;
    setTimeout(function () { searchInput.focus(); }, 30);
  }
  function closeSearch() { searchOverlay.hidden = true; }
  function doSearch(q) {
    q = q.trim().toLowerCase();
    searchResults.innerHTML = "";
    selIdx = -1;
    if (!q) return;
    var pool = liveList(A.games).filter(function (g) { return g[2].toLowerCase().indexOf(q) >= 0; });
    var ups = uploadsAsGames().filter(function (u) { return u.name.toLowerCase().indexOf(q) >= 0; });
    var list = ups.concat(pool.slice(0, 24));
    list.slice(0, 24).forEach(function (g) {
      var isUp = !!g.kind;
      var id = isUp ? g.key : g[0];
      var name = isUp ? g.name : g[2];
      var genre = isUp ? "upload" : g[3];
      var r = el("div", "sres");
      r.innerHTML = '<div class="mini t-' + genre + '">' + esc(name.charAt(0).toUpperCase()) + "</div>" +
        '<div class="sname">' + esc(name) + "</div>" +
        '<div class="sgenre">' + esc(genre === "td" ? "tower defense" : genre) + (!isUp && g[4] ? " \u00b7 " + esc(seriesByKey[g[4]] ? seriesByKey[g[4]][1] : "") : "") + "</div>";
      r.onclick = function () { closeSearch(); go(playHref(id)); };
      searchResults.appendChild(r);
    });
    if (!list.length) {
      searchResults.innerHTML = '<div class="sres" style="cursor:default;color:var(--faint)">Nothing found.</div>';
    }
  }
  function wireSearch() {
    searchOverlay = document.getElementById("search-overlay");
    searchInput = document.getElementById("search-input");
    searchResults = document.getElementById("search-results");
    document.getElementById("search-btn").onclick = openSearch;
    document.getElementById("search-close").onclick = closeSearch;
    searchOverlay.addEventListener("click", function (e) { if (e.target === searchOverlay) closeSearch(); });
    var t = null;
    searchInput.addEventListener("input", function () {
      clearTimeout(t);
      t = setTimeout(function () { doSearch(searchInput.value); }, 90);
    });
    searchInput.addEventListener("keydown", function (e) {
      var items = searchResults.querySelectorAll(".sres");
      if (e.key === "Escape") { closeSearch(); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        selIdx = e.key === "ArrowDown" ? Math.min(selIdx + 1, items.length - 1) : Math.max(selIdx - 1, 0);
        items.forEach(function (x, i) { x.classList.toggle("sel", i === selIdx); });
        if (items[selIdx]) items[selIdx].scrollIntoView({ block: "nearest" });
      }
      if (e.key === "Enter" && selIdx >= 0 && items[selIdx]) items[selIdx].click();
    });
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        searchOverlay.hidden ? openSearch() : closeSearch();
      }
      if (e.key === "Escape" && !searchOverlay.hidden) closeSearch();
    });
  }

  /* ---------------- UPLOAD DIALOG ---------------- */
  function openUploadDialog(after) {
    var root = document.getElementById("modal-root");
    root.hidden = false;
    root.innerHTML = "";
    var m = el("div", "modal-card");
    m.innerHTML =
      '<button class="icon-btn modal-x" id="up-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      "<h3>Add games</h3><div class='msub'>Everything stays on this device \u2014 nothing is sent anywhere.</div>" +
      '<div class="tabs"><button class="on" data-t="links">Links</button><button data-t="files">HTML files</button></div>' +
      '<div id="tab-links"><div class="field"><label>Paste one or many links (one per line)</label>' +
      '<textarea id="up-links" placeholder="https://drive.google.com/file/d/\u2026/view\nhttps://drive.google.com/open?id=\u2026\nhttps://example.com/game.html"></textarea>' +
      '<div class="hint">Google Drive links become embedded previews automatically. Multiple lines = batch add.</div></div>' +
      '<button class="btn btn-primary btn-block" id="up-addlinks">Add links</button></div>' +
      '<div id="tab-files" style="display:none"><div class="dropzone" id="up-drop">' +
      '<svg viewBox="0 0 24 24"><path d="M12 16V4m0 0-4 4m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>' +
      "<b>Drop .html files</b><div style='font-size:12px;margin-top:4px'>or click to browse \u00b7 multiple files welcome</div></div>" +
      '<input type="file" id="up-files" accept=".html,.htm" multiple hidden>' +
      '<div class="hint" style="margin-top:10px;color:var(--faint);font-size:12px">Files are scanned on add: known miners, trackers and redirect scripts get stripped automatically.</div></div>';
    root.appendChild(m);
    var close = function () { root.hidden = true; root.innerHTML = ""; };
    m.querySelector("#up-x").onclick = close;
    root.onclick = function (e) { if (e.target === root) close(); };

    var tabs = m.querySelectorAll(".tabs button");
    tabs.forEach(function (b) {
      b.onclick = function () {
        tabs.forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        m.querySelector("#tab-links").style.display = b.dataset.t === "links" ? "" : "none";
        m.querySelector("#tab-files").style.display = b.dataset.t === "files" ? "" : "none";
      };
    });

    m.querySelector("#up-addlinks").onclick = function () {
      var txt = m.querySelector("#up-links").value;
      window.Uploads.addLinks(txt).then(function (r) {
        close();
        if (r.added) T().toast("Added " + r.added + " link" + (r.added > 1 ? "s" : "") + ".", "ok");
        if (r.bad) T().toast("Some lines weren\u2019t usable links.", "err");
        refreshUploads().then(after || function () { });
      });
    };
    var drop = m.querySelector("#up-drop");
    var fileInput = m.querySelector("#up-files");
    drop.onclick = function () { fileInput.click(); };
    ["dragover", "dragenter"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add("drag"); }); });
    ["dragleave", "drop"].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove("drag"); }); });
    drop.addEventListener("drop", function (e) {
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
    });
    fileInput.onchange = function () { if (fileInput.files.length) handleFiles(fileInput.files); };
    function handleFiles(files) {
      var arr = Array.prototype.filter.call(files, function (f) { return /\.html?$/i.test(f.name); });
      if (!arr.length) { T().toast("Only .html files are supported.", "err"); return; }
      window.Uploads.addFiles(arr).then(function (r) {
        close();
        var msg = "Added " + r.added + " game" + (r.added > 1 ? "s" : "");
        if (r.sanitized) msg += " \u00b7 " + r.sanitized + " cleaned";
        T().toast(msg + ".", "ok");
        refreshUploads().then(after || function () { });
      });
    }
  }

  /* ---------------- dialogs ---------------- */
  function promptDialog(title, value, cb) {
    var root = document.getElementById("modal-root");
    root.hidden = false;
    root.innerHTML = "";
    var m = el("div", "modal-card");
    m.innerHTML = '<button class="icon-btn modal-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      "<h3>" + esc(title) + "</h3>" +
      '<div class="field" style="margin-top:12px"><input id="dlg-in" value="' + esc(value) + '"></div>' +
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-secondary btn-sm" id="dlg-no">Cancel</button><button class="btn btn-primary btn-sm" id="dlg-yes">Save</button></div>';
    root.appendChild(m);
    var input = m.querySelector("#dlg-in");
    input.focus(); input.select();
    var close = function () { root.hidden = true; root.innerHTML = ""; };
    m.querySelector(".modal-x").onclick = close;
    m.querySelector("#dlg-no").onclick = close;
    var yes = function () { var v = input.value.trim(); close(); if (v) cb(v); };
    m.querySelector("#dlg-yes").onclick = yes;
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") yes(); });
  }
  function confirmDialog(title, sub, cb) {
    var root = document.getElementById("modal-root");
    root.hidden = false;
    root.innerHTML = "";
    var m = el("div", "modal-card");
    m.innerHTML = '<button class="icon-btn modal-x"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      "<h3>" + esc(title) + "</h3><div class='msub'>" + esc(sub) + "</div>" +
      '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-secondary btn-sm" id="c-no">Cancel</button><button class="btn btn-danger btn-sm" id="c-yes">Confirm</button></div>';
    root.appendChild(m);
    var close = function () { root.hidden = true; root.innerHTML = ""; };
    m.querySelector(".modal-x").onclick = close;
    m.querySelector("#c-no").onclick = close;
    m.querySelector("#c-yes").onclick = function () { close(); cb(); };
  }

  /* ---------------- sidebar ---------------- */
  function renderSidebarFavs() {
    var wrap = document.getElementById("side-favs-wrap");
    var box = document.getElementById("side-favs");
    if (!wrap || !box) return;
    var games = favs.map(function (id) {
      if (id.indexOf("up:") === 0) {
        var u = uploadsCache.filter(function (x) { return x.id === id.slice(3); })[0];
        return u ? { name: u.name, id: id, genre: "upload" } : null;
      }
      var g = gameById(id);
      return g ? { name: g[2], id: id, genre: g[3] } : null;
    }).filter(Boolean).slice(0, 6);
    wrap.hidden = games.length === 0;
    box.innerHTML = "";
    games.forEach(function (g) {
      var a = el("a", "side-item");
      a.href = playHref(g.id);
      a.innerHTML = '<i class="dot gdot ' + esc(g.genre) + '"></i><span>' + esc(g.name) + "</span>";
      box.appendChild(a);
    });
  }

  /* ---------------- init ---------------- */
  function applySideState() {
    var collapsed;
    try { collapsed = localStorage.getItem("arc.side") === "1"; } catch (e) { collapsed = false; }
    document.body.classList.toggle("side-collapsed", collapsed);
  }

  function initShell() {
    view = document.getElementById("view");
    wireSearch();
    applySideState();
    Player.loadManifest();
    refreshUploads().then(function () {
      renderSidebarFavs();
      route();
    });

    document.getElementById("settings-btn").addEventListener("click", function (e) {
      e.preventDefault();
      go("#/settings");
    });
    document.getElementById("ac-btn").addEventListener("click", function () {
      if (T().AC.panel && !T().AC.panel.hidden) T().AC.hide();
      else T().AC.show();
    });
    var collapseBtn = document.getElementById("side-collapse");
    if (collapseBtn) collapseBtn.addEventListener("click", function () {
      var on = !document.body.classList.contains("side-collapsed");
      document.body.classList.toggle("side-collapsed", on);
      try { localStorage.setItem("arc.side", on ? "1" : "0"); } catch (e) { }
    });
    document.getElementById("menu-btn").addEventListener("click", function () {
      document.getElementById("sidebar").classList.toggle("open");
      document.getElementById("scrim").classList.toggle("on");
    });
    document.getElementById("scrim").addEventListener("click", function () {
      document.getElementById("sidebar").classList.remove("open");
      document.getElementById("scrim").classList.remove("on");
    });

    var s = T().getSettings();
    if (s.cloak && s.cloak !== "off") T().applyCloak(s.cloak);

    window.addEventListener("hashchange", route);
    T().toast("Unlocked. Welcome in.", "ok");
  }

  window.App = { rerender: function () { try { route(); } catch (e) { } } };

  window.wireGate(function () {
    document.getElementById("gate").hidden = true;
    var app = document.getElementById("app");
    app.hidden = false;
    app.classList.add("on");
    initShell();
  });
})();
