/* Eason Chan recording-session swipe deck.
   Loads data/shows.json from this origin and stores answers in localStorage.
   Left / 未聽過 = unheard. Right / 聽過 = heard.
   A repeated title keeps the first night. Album names are not shown.
   Demo / NG / Big Band versions stay.
   Horizontal swipe answers. Vertical swipe changes the song. */

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

  function preferEntry(candidate, current) {
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
      (show.albums || []).forEach(function (album) {
        (album.tracks || []).forEach(function (track) {
          entries.push({
            index: entries.length,
            showId: show.id,
            date: show.date,
            weekday: show.weekday || "",
            label: show.label || show.date,
            album: album.title,
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
    if (answerFor(card) === "heard") cardEl.classList.add("is-saved-heard");
    else if (answerFor(card) === "unheard") cardEl.classList.add("is-saved-miss");

    var heardStamp = el("span", "stamp stamp-heard", "聽過");
    var missStamp = el("span", "stamp stamp-miss", "未聽過");
    heardStamp.setAttribute("aria-hidden", "true");
    missStamp.setAttribute("aria-hidden", "true");

    var body = el("div", "card-body");
    var title = el("h1", "song-title", card.title);
    title.id = "song-title";
    var meta = el("div", "meta");
    meta.appendChild(el("p", "when", formatWhen(card)));
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

    var hint = el("p", "hint", "左滑未聽過，右滑聽過。上滑下一首，下滑上一首。");

    app.appendChild(stage);
    app.appendChild(actions);
    app.appendChild(hint);
    bindSwipe(cardEl);
    announce(card.title + "。" + formatWhen(card) + "。" + position + " / " + total);
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

  function moveSong(delta) {
    if (state.busy) return false;
    if (state.cursor < 0 || state.cursor >= state.cards.length) return false;
    var next = state.cursor + delta;
    if (next < 0 || next >= state.cards.length) return false;

    setBusy(true);
    state.cursor = next;
    var token = generation + 1;
    generation = token;
    var cardEl = document.getElementById("song-card");
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !cardEl) {
      setBusy(false);
      render();
      return true;
    }

    cardEl.style.transition = "transform 180ms ease";
    cardEl.style.transform = delta > 0 ? "translateY(-120%)" : "translateY(120%)";
    window.setTimeout(function () {
      if (token !== generation) return;
      setBusy(false);
      render();
    }, 170);
    return true;
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
    var dy = 0;
    var active = false;
    var axis = "";
    var heardStamp = cardEl.querySelector(".stamp-heard");
    var missStamp = cardEl.querySelector(".stamp-miss");

    function setStamp(delta) {
      if (delta > 0) {
        heardStamp.style.opacity = "1";
        missStamp.style.opacity = "0";
      } else if (delta < 0) {
        heardStamp.style.opacity = "0";
        missStamp.style.opacity = "1";
      } else {
        heardStamp.style.opacity = "";
        missStamp.style.opacity = "";
      }
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
      dy = 0;
      active = true;
      axis = "";
      cardEl.setPointerCapture(pointerId);
      cardEl.style.transition = "none";
    });

    cardEl.addEventListener("pointermove", function (event) {
      if (!active || event.pointerId !== pointerId || state.busy) return;
      dx = event.clientX - startX;
      dy = event.clientY - startY;
      if (!axis) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
      }
      if (axis === "y") {
        cardEl.style.transform = "translateY(" + dy + "px)";
        cardEl.classList.remove("is-heard", "is-miss");
        setStamp(0);
        return;
      }
      var rot = Math.max(-10, Math.min(10, dx / 22));
      cardEl.style.transform = "translateX(" + dx + "px) rotate(" + rot + "deg)";
      cardEl.classList.toggle("is-heard", dx > 0);
      cardEl.classList.toggle("is-miss", dx < 0);
      setStamp(dx);
    });

    function finish(event) {
      if (!active || event.pointerId !== pointerId) return;
      active = false;
      if (!axis || state.busy) {
        snapBack();
        return;
      }
      if (axis === "y") {
        var height = cardEl.offsetHeight || 1;
        var yThreshold = Math.min(90, height * 0.22);
        if (dy <= -yThreshold) {
          if (!moveSong(1)) snapBack();
          return;
        }
        if (dy >= yThreshold) {
          if (!moveSong(-1)) snapBack();
          return;
        }
        snapBack();
        return;
      }
      var width = cardEl.offsetWidth || 1;
      var threshold = Math.min(96, width * 0.26);
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
    if (state.cursor >= state.cards.length) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      settle("unheard");
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      settle("heard");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveSong(-1);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      moveSong(1);
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
