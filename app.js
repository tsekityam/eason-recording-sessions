/* Eason Chan recording-session swipe deck.
   Loads data/shows.json from this origin and stores answers in localStorage.
   Left / 未聽過 = unheard. Right / 聽過 = heard.
   The same title on a later night is skipped. Demo / NG / Big Band versions stay. */

(function () {
  "use strict";

  var STORAGE_KEY = "eason-recording-sessions-v1";
  var SEP = "\u001f";

  var state = {
    eventName: "",
    venue: "",
    shows: [],
    cards: [],
    answers: {},
    cursor: 0,
    busy: false
  };

  var generation = 0;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function cardId(card) {
    return [card.showId, card.album, String(card.n), card.title].join(SEP);
  }

  function answerFor(card) {
    var value = state.answers[cardId(card)];
    if (value === "heard" || value === "unheard") return value;
    return null;
  }

  function formatWhen(card) {
    if (!card.weekday) return card.date;
    return card.date + "（" + card.weekday + "）";
  }

  function padTrack(n) {
    var text = String(n);
    return text.length < 2 ? "0" + text : text;
  }

  function preferEntry(candidate, current) {
    if (candidate.year !== current.year) return candidate.year < current.year;
    if (candidate.albumCount !== current.albumCount) return candidate.albumCount < current.albumCount;
    if (candidate.date !== current.date) return candidate.date < current.date;
    return candidate.index < current.index;
  }

  function buildCatalog(data) {
    var shows = (data.shows || []).slice().sort(function (a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });
    var entries = [];
    shows.forEach(function (show) {
      var albumCount = (show.albums || []).length;
      (show.albums || []).forEach(function (album) {
        var year = typeof album.year === "number" ? album.year : 9999;
        (album.tracks || []).forEach(function (track) {
          entries.push({
            index: entries.length,
            showId: show.id,
            date: show.date,
            weekday: show.weekday || "",
            label: show.label || show.date,
            album: album.title,
            year: year,
            albumCount: albumCount,
            n: track.n,
            title: track.title
          });
        });
      });
    });

    var groups = {};
    entries.forEach(function (entry) {
      if (!groups[entry.title]) groups[entry.title] = [];
      groups[entry.title].push(entry);
    });

    var keptByIndex = {};
    Object.keys(groups).forEach(function (title) {
      var list = groups[title];
      var best = list[0];
      var i;
      for (i = 1; i < list.length; i += 1) {
        if (preferEntry(list[i], best)) best = list[i];
      }
      list.forEach(function (entry) {
        keptByIndex[entry.index] = best;
      });
    });

    var cards = [];
    var alias = {};
    entries.forEach(function (entry) {
      var best = keptByIndex[entry.index];
      var card = {
        showId: entry.showId,
        date: entry.date,
        weekday: entry.weekday,
        label: entry.label,
        album: entry.album,
        n: entry.n,
        title: entry.title
      };
      if (best === entry) {
        cards.push(card);
      } else {
        alias[cardId(card)] = cardId({
          showId: best.showId,
          album: best.album,
          n: best.n,
          title: best.title
        });
      }
    });
    return { shows: shows, cards: cards, alias: alias };
  }

  function applyAlias(alias) {
    var changed = false;
    Object.keys(alias).forEach(function (droppedId) {
      var keptId = alias[droppedId];
      var dropped = state.answers[droppedId];
      if ((dropped === "heard" || dropped === "unheard") && state.answers[keptId] !== "heard" && state.answers[keptId] !== "unheard") {
        state.answers[keptId] = dropped;
        changed = true;
      }
      if (droppedId in state.answers) {
        delete state.answers[droppedId];
        changed = true;
      }
    });
    if (changed) saveAnswers();
  }

  function nextCursor(from) {
    var i;
    for (i = from; i < state.cards.length; i += 1) {
      if (!answerFor(state.cards[i])) return i;
    }
    return state.cards.length;
  }

  function loadAnswers() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      var saved = parsed && parsed.answers;
      if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
      return saved;
    } catch (error) {
      return {};
    }
  }

  function saveAnswers() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: 1,
        answers: state.answers
      }));
    } catch (error) {
      // Private mode can reject storage. The session still runs.
    }
  }

  function answeredCount() {
    var count = 0;
    state.cards.forEach(function (card) {
      if (answerFor(card)) count += 1;
    });
    return count;
  }

  function summarize() {
    var byId = {};
    state.shows.forEach(function (show) {
      byId[show.id] = {
        date: show.date,
        label: show.label || show.date,
        heard: 0,
        total: 0
      };
    });
    var heard = 0;
    state.cards.forEach(function (card) {
      var row = byId[card.showId];
      if (!row) return;
      row.total += 1;
      if (answerFor(card) === "heard") {
        row.heard += 1;
        heard += 1;
      }
    });
    var rows = state.shows.map(function (show) {
      return byId[show.id];
    });
    rows.sort(function (a, b) {
      if (a.date < b.date) return -1;
      if (a.date > b.date) return 1;
      return 0;
    });
    return { heard: heard, total: state.cards.length, rows: rows };
  }

  function announce(text) {
    var node = document.getElementById("announce");
    if (node) node.textContent = text;
  }

  function setBusy(value) {
    state.busy = value;
    document.body.classList.toggle("is-busy", value);
  }

  function renderChrome(app, position, total) {
    var header = el("header", "top");
    header.appendChild(el("p", "kicker", "陳奕迅"));
    if (state.eventName) header.appendChild(el("p", "event", state.eventName));

    var row = el("div", "progress-row");
    var progress = el("p", "progress", position + " / " + total);
    progress.id = "progress";
    if (position === total && state.cursor >= total) {
      progress.setAttribute("aria-label", "已完成 " + total + " 首");
    } else {
      progress.setAttribute("aria-label", "第 " + position + " 首，共 " + total + " 首");
    }

    var reset = el("button", "reset", "重新開始");
    reset.id = "btn-reset";
    reset.type = "button";
    reset.addEventListener("click", onReset);

    row.appendChild(progress);
    row.appendChild(reset);

    var track = el("div", "track");
    track.setAttribute("aria-hidden", "true");
    var fill = el("span");
    var done = total ? (answeredCount() / total) * 100 : 0;
    fill.style.width = done + "%";
    track.appendChild(fill);

    header.appendChild(row);
    header.appendChild(track);
    app.appendChild(header);
  }

  function renderStatus(message) {
    var app = document.getElementById("app");
    clearNode(app);
    app.appendChild(el("p", "status", message));
    announce(message);
  }

  function renderDeck() {
    var app = document.getElementById("app");
    var total = state.cards.length;
    var card = state.cards[state.cursor];
    var position = state.cursor + 1;
    clearNode(app);
    renderChrome(app, position, total);

    var stage = el("div", "stage");
    var cardEl = el("article", "card");
    cardEl.id = "song-card";

    var heardStamp = el("span", "stamp stamp-heard", "聽過");
    var missStamp = el("span", "stamp stamp-miss", "未聽過");
    heardStamp.setAttribute("aria-hidden", "true");
    missStamp.setAttribute("aria-hidden", "true");

    var body = el("div", "card-body");
    var number = el("p", "track-no", padTrack(card.n));
    var title = el("h1", "song-title", card.title);
    title.id = "song-title";
    var meta = el("div", "meta");
    meta.appendChild(el("p", "album", card.album));
    meta.appendChild(el("p", "when", formatWhen(card)));
    body.appendChild(number);
    body.appendChild(title);
    body.appendChild(meta);

    cardEl.appendChild(heardStamp);
    cardEl.appendChild(missStamp);
    cardEl.appendChild(body);
    stage.appendChild(cardEl);

    var actions = el("div", "actions");
    var miss = el("button", "btn-miss", "未聽過");
    var heard = el("button", "btn-heard", "聽過");
    miss.id = "btn-miss";
    heard.id = "btn-heard";
    miss.type = "button";
    heard.type = "button";
    miss.addEventListener("click", function () { settle("unheard"); });
    heard.addEventListener("click", function () { settle("heard"); });
    actions.appendChild(miss);
    actions.appendChild(heard);

    var hint = el("p", "hint", "左滑或按 ← 未聽過，右滑或按 → 聽過");

    app.appendChild(stage);
    app.appendChild(actions);
    app.appendChild(hint);
    bindSwipe(cardEl);
    announce(card.title + "。" + card.album + "。" + formatWhen(card) + "。" + position + " / " + total);
  }

  function renderResults() {
    var app = document.getElementById("app");
    var summary = summarize();
    clearNode(app);
    renderChrome(app, summary.total, summary.total);

    var results = el("section", "results");
    results.appendChild(el("h1", "results-title", "結果"));
    results.appendChild(el("p", "done-note", summary.total + " 首已標記"));

    var overall = el("p", "overall");
    overall.id = "overall";
    overall.appendChild(el("span", null, "總計: "));
    overall.appendChild(el("strong", null, summary.heard + "/" + summary.total));
    results.appendChild(overall);
    results.appendChild(el("p", "caption", "每場聽過 / 該場曲數，按日期排列"));

    var list = el("ul", "result-list");
    list.id = "result-list";
    summary.rows.forEach(function (row) {
      var item = el("li", "result-row");
      var line = el("p", "result-line");
      line.appendChild(el("span", "result-name", row.date + " " + row.label + ": "));
      line.appendChild(el("strong", "result-score", row.heard + "/" + row.total));
      var meter = el("div", "meter");
      meter.setAttribute("aria-hidden", "true");
      var fill = el("span");
      var pct = row.total ? (row.heard / row.total) * 100 : 0;
      fill.style.width = pct + "%";
      meter.appendChild(fill);
      item.appendChild(line);
      item.appendChild(meter);
      list.appendChild(item);
    });
    results.appendChild(list);

    var again = el("button", "btn-reset-large", "重新開始");
    again.id = "btn-reset-results";
    again.type = "button";
    again.addEventListener("click", onReset);
    results.appendChild(again);

    if (state.venue) results.appendChild(el("p", "venue-foot", state.venue));
    app.appendChild(results);
    announce("結果。總計 " + summary.heard + "/" + summary.total);
  }

  function render() {
    if (!state.cards.length) {
      renderStatus("歌單是空的。");
      return;
    }
    if (state.cursor >= state.cards.length) renderResults();
    else renderDeck();
  }

  function settle(kind) {
    if (state.busy) return;
    var card = state.cards[state.cursor];
    if (!card) return;

    setBusy(true);
    state.answers[cardId(card)] = kind;
    state.cursor = nextCursor(state.cursor + 1);
    saveAnswers();
    if (typeof navigator.vibrate === "function") navigator.vibrate(10);

    var token = generation + 1;
    generation = token;
    var cardEl = document.getElementById("song-card");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !cardEl) {
      setBusy(false);
      render();
      return;
    }

    cardEl.style.transition = "transform 180ms ease";
    cardEl.style.transform = kind === "heard"
      ? "translateX(130%) rotate(8deg)"
      : "translateX(-130%) rotate(-8deg)";
    window.setTimeout(function () {
      if (token !== generation) return;
      setBusy(false);
      render();
    }, 170);
  }

  function onReset() {
    if (!window.confirm("清除所有紀錄並重新開始？")) return;
    generation += 1;
    setBusy(false);
    state.answers = {};
    state.cursor = 0;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Ignore storage failures and still restart in memory.
    }
    render();
  }

  function bindSwipe(cardEl) {
    var pointerId = null;
    var startX = 0;
    var startY = 0;
    var dx = 0;
    var active = false;
    var horizontal = false;
    var heardStamp = cardEl.querySelector(".stamp-heard");
    var missStamp = cardEl.querySelector(".stamp-miss");

    function setStamp(delta) {
      var amount = Math.min(1, Math.abs(delta) / 110);
      heardStamp.style.opacity = delta > 0 ? String(amount) : "0";
      missStamp.style.opacity = delta < 0 ? String(amount) : "0";
    }

    function snapBack() {
      cardEl.style.transition = "transform 180ms ease";
      cardEl.style.transform = "";
      cardEl.classList.remove("is-heard", "is-miss");
      setStamp(0);
    }

    cardEl.addEventListener("pointerdown", function (event) {
      if (state.busy || event.button !== 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      dx = 0;
      active = true;
      horizontal = false;
      cardEl.setPointerCapture(pointerId);
      cardEl.style.transition = "none";
    });

    cardEl.addEventListener("pointermove", function (event) {
      if (!active || event.pointerId !== pointerId || state.busy) return;
      var x = event.clientX - startX;
      var y = event.clientY - startY;
      if (!horizontal) {
        if (Math.abs(x) < 8 && Math.abs(y) < 8) return;
        if (Math.abs(y) > Math.abs(x)) {
          active = false;
          snapBack();
          return;
        }
        horizontal = true;
      }
      dx = x;
      var rot = Math.max(-10, Math.min(10, x / 22));
      cardEl.style.transform = "translateX(" + x + "px) rotate(" + rot + "deg)";
      cardEl.classList.toggle("is-heard", x > 36);
      cardEl.classList.toggle("is-miss", x < -36);
      setStamp(x);
    });

    function finish(event) {
      if (!active || event.pointerId !== pointerId) return;
      active = false;
      var width = cardEl.offsetWidth || 1;
      var threshold = Math.min(96, width * 0.26);
      if (!horizontal || state.busy) {
        snapBack();
        return;
      }
      if (dx >= threshold) {
        settle("heard");
        return;
      }
      if (dx <= -threshold) {
        settle("unheard");
        return;
      }
      snapBack();
    }

    cardEl.addEventListener("pointerup", finish);
    cardEl.addEventListener("pointercancel", function (event) {
      if (!active || event.pointerId !== pointerId) return;
      active = false;
      snapBack();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      settle("unheard");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      settle("heard");
    }
  });

  function init() {
    var url = new URL("data/shows.json", document.baseURI).href;
    fetch(url, { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("status " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.shows)) throw new Error("bad catalog");
        var catalog = buildCatalog(data);
        state.eventName = data.event || "";
        state.venue = data.venue || "";
        state.shows = catalog.shows;
        state.cards = catalog.cards;
        state.answers = loadAnswers();
        applyAlias(catalog.alias || {});
        state.cursor = nextCursor(0);
        render();
      })
      .catch(function () {
        renderStatus("載入歌單失敗。請在這個資料夾啟動靜態伺服器後再開啟（例如 python3 -m http.server）。");
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
