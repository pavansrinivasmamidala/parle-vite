/* app.js — UI, tab routing, all six practice modes, dashboard, settings, speech.
   Depends on Store, Data, SRS, Game, AI (loaded before this file). */
(function () {
  "use strict";

  /* ============ tiny DOM helpers ============ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function panel(name) { return document.querySelector('[data-panel="' + name + '"]'); }
  function esc(s) { return (s || "").replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function loadingHTML(msg) {
    return '<div class="card"><div class="loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span> ' +
      (msg || "Loading…") + '</div></div>';
  }
  function lvl() { return Store.settings.level; }
  function diff() { return Store.settings.difficulty; }

  /* ============ speech: TTS + STT ============ */
  var Speech = {
    voices: [],
    supportedSTT: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
    loadVoices: function () {
      this.voices = (window.speechSynthesis ? speechSynthesis.getVoices() : []).filter(function (v) {
        return /^fr/i.test(v.lang);
      });
      return this.voices;
    },
    speak: function (text) {
      if (!window.speechSynthesis) return;
      speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(text);
      u.lang = "fr-FR";
      var uri = Store.settings.voiceURI;
      var v = this.voices.find(function (x) { return x.voiceURI === uri; }) || this.voices[0];
      if (v) u.voice = v;
      u.rate = 0.95;
      speechSynthesis.speak(u);
    },
    listen: function (onText, onErr, onEnd) {
      var R = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!R) { onErr && onErr("not-supported"); return null; }
      var rec = new R();
      rec.lang = "fr-FR";
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = function (e) { onText(e.results[0][0].transcript); };
      rec.onerror = function (e) { onErr && onErr(e.error); };
      rec.onend = function () { onEnd && onEnd(); };
      try { rec.start(); } catch (e) { onErr && onErr("start-failed"); }
      return rec;
    }
  };
  if (window.speechSynthesis) {
    speechSynthesis.onvoiceschanged = function () { Speech.loadVoices(); populateVoiceSelect(); };
  }

  /* ============ shared feedback + scoring ============ */
  function feedbackNode(result, opts) {
    opts = opts || {};
    var ok = !!result.correct;
    var n = document.createElement("div");
    n.className = "feedback " + (ok ? "correct" : "wrong");
    var h = '<div class="verdict">' + (ok ? "✅ Correct" : "✏️ Not quite") +
      ' <span class="score-chip">' + (result.score != null ? result.score : (ok ? 100 : 0)) + "/100</span></div>";
    var summary = result.summary || result.feedback;
    if (summary) h += '<div class="line">' + esc(summary) + "</div>";
    if (result.corrected && (!ok || opts.alwaysCorrected)) h += '<div class="line"><b>Most natural:</b> <span class="corrected">' + esc(result.corrected) + "</span></div>";
    if (result.rule) h += '<div class="line"><b>Rule:</b> ' + esc(result.rule) + "</div>";

    if (result.errors && result.errors.length) {
      h += '<div class="fb-section"><div class="fb-h">🔧 Word-by-word fixes</div><ul class="fb-list">';
      result.errors.forEach(function (e) {
        h += '<li><span class="err-part">' + esc(e.part) + '</span> → <span class="err-fix">' + esc(e.fix) + '</span>' +
          (e.why ? ' <span class="err-why">' + esc(e.why) + '</span>' : '') + '</li>';
      });
      h += "</ul></div>";
    }
    if (result.alternatives && result.alternatives.length) {
      h += '<div class="fb-section"><div class="fb-h">🔁 Other ways to say it</div><ul class="fb-list">';
      result.alternatives.forEach(function (a) { h += "<li>" + esc(a) + "</li>"; });
      h += "</ul></div>";
    }
    if (result.vocab && result.vocab.length) {
      h += '<div class="fb-section"><div class="fb-h">📚 Words to learn for speaking</div><div class="vocab-list">';
      result.vocab.forEach(function (v) {
        h += '<div class="vocab-item"><div class="vi-main"><b>' + esc(v.fr) + "</b> — " + esc(v.en) +
          (v.example ? '<div class="muted">' + esc(v.example) + "</div>" : "") + "</div>" +
          '<div class="vi-actions">' +
          '<button class="btn ghost small vocab-hear" type="button" data-fr="' + esc(v.fr) + '">🔊</button>' +
          '<button class="btn ghost small vocab-add" type="button" data-fr="' + esc(v.fr) + '" data-en="' + esc(v.en) + '">＋ Card</button>' +
          "</div></div>";
      });
      h += "</div></div>";
    }
    if (result.tip) h += '<div class="tip">💡 ' + esc(result.tip) + "</div>";
    n.innerHTML = h;

    n.querySelectorAll(".vocab-hear").forEach(function (b) { b.onclick = function () { Speech.speak(b.dataset.fr); }; });
    n.querySelectorAll(".vocab-add").forEach(function (b) {
      b.onclick = function () {
        SRS.addFlashcard({ front: b.dataset.en, back: b.dataset.fr });
        b.textContent = "✓ Added"; b.disabled = true;
        Game.toast("Added to flashcards", "");
        refreshStats();
      };
    });
    return n;
  }

  // Normal-mode result handling: award XP on correct, save mistake on wrong.
  function applyResult(result, ctx) {
    if (result.correct) {
      var xp = Game.xpFor(ctx.level, ctx.difficulty);
      Game.bump("correct");
      if (ctx.mode === "build") Game.bump("sentences");
      if (ctx.mode === "speak") Game.bump("spoken");
      Game.award(xp);
    } else {
      SRS.addMistake({
        mode: ctx.mode, level: ctx.level, difficulty: ctx.difficulty,
        prompt: ctx.prompt, target: result.corrected || ctx.target,
        userAnswer: ctx.user, feedback: result.feedback, tip: result.tip, rule: result.rule
      });
      if (ctx.mode === "build") Game.bump("sentences");
      if (ctx.mode === "speak") Game.bump("spoken");
      refreshStats();
    }
  }

  /* ============ top bar / stats ============ */
  function refreshStats() {
    $("#xpVal").textContent = Store.progress.xp;
    $("#streakVal").textContent = Store.progress.streak;
    var due = SRS.countDueMistakes();
    var b = $("#reviewBadge");
    if (due > 0) { b.hidden = false; b.textContent = due; } else { b.hidden = true; }
  }
  Game.onChange(refreshStats);

  /* ============ tab routing ============ */
  var RENDER = {};
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach(function (t) { t.classList.toggle("active", t.dataset.tab === name); });
    document.querySelectorAll(".panel").forEach(function (p) { p.classList.remove("active"); });
    var p = panel(name); if (p) p.classList.add("active");
    if (RENDER[name]) RENDER[name]();
    try { localStorage.setItem("parlevite.tab", name); } catch (e) {}
  }

  /* ===================================================================
     HOME / DASHBOARD
  =================================================================== */
  RENDER.home = function () {
    var p = panel("home");
    var rank = Game.rank();
    var goalPct = Game.goalPct();
    var due = SRS.countDueMistakes();
    var keyBanner = AI.hasKey() ? "" :
      '<div class="card" style="border-color:var(--warn)"><div class="row between">' +
      '<div><strong>Starter mode</strong><div class="muted">Add your Anthropic API key in Settings for fresh AI exercises &amp; personalized feedback.</div></div>' +
      '<button class="btn small" id="homeKeyBtn">Add key</button></div></div>';

    var badges = Game.BADGES.map(function (b) {
      var earned = Store.progress.badges.indexOf(b.id) !== -1;
      return '<div class="badge-chip ' + (earned ? "" : "locked") + '" title="' + esc(b.desc) + '">' +
        '<span class="be">' + b.emoji + "</span>" + esc(b.name) + "</div>";
    }).join("");

    p.innerHTML =
      keyBanner +
      '<div class="card">' +
        '<div class="goal-ring">' +
          '<div class="ring" style="--p:' + goalPct + '"><span>' + goalPct + '%</span></div>' +
          '<div><h2 style="margin:0">Daily goal</h2>' +
          '<div class="muted">' + Store.progress.todayXp + ' / ' + Store.settings.dailyGoal + ' XP today · keep your 🔥 ' + Store.progress.streak + '-day streak alive</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="card">' +
        '<div class="row between"><h2 style="margin:0">' + rank.name + '</h2><span class="muted">' + Store.progress.xp + ' XP</span></div>' +
        '<div class="rank-bar"><i style="width:' + rank.pct + '%"></i></div>' +
        '<div class="muted">' + (rank.next ? (rank.need - rank.into) + ' XP to ' + rank.next : 'Top rank reached! 🏆') + '</div>' +
      '</div>' +
      '<div class="dash-grid">' +
        statCard(Store.progress.streak, "Day streak") +
        statCard(Store.progress.counters.correct, "Correct") +
        statCard(due, "Due to review") +
        statCard(SRS.countMistakes(), "In trainer") +
      '</div>' +
      (due > 0 ? '<div class="card"><div class="row between"><div><strong>🎯 ' + due + ' item' + (due > 1 ? "s" : "") + ' to review</strong><div class="muted">Drill what you got wrong until it sticks.</div></div><button class="btn" id="goReview">Review now</button></div></div>' : "") +
      '<div class="card"><h2>Practise</h2><div class="mode-links">' +
        modeLink("translate", "🔤", "Translate", "Produce French by typing or speaking") +
        modeLink("speak", "🎙️", "Speak", "Say it aloud, get a speaking tip") +
        modeLink("build", "🧩", "Build", "Construct natural sentences") +
        modeLink("grammar", "✅", "Grammar", "Fix errors, learn the rule") +
        modeLink("flashcards", "🃏", "Flashcards", "Vocab with spaced repetition") +
      '</div></div>' +
      '<div class="card"><h2>Badges</h2><div class="badges">' + badges + "</div></div>";

    if ($("#homeKeyBtn")) $("#homeKeyBtn").onclick = openDrawer;
    if ($("#goReview")) $("#goReview").onclick = function () { switchTab("review"); };
    p.querySelectorAll(".mode-link").forEach(function (m) { m.onclick = function () { switchTab(m.dataset.go); }; });
  };
  function statCard(num, lbl) { return '<div class="card stat-card"><div class="num">' + num + '</div><div class="lbl">' + lbl + "</div></div>"; }
  function modeLink(go, mi, mt, md) { return '<button class="mode-link" data-go="' + go + '"><div class="mi">' + mi + '</div><div class="mt">' + mt + '</div><div class="md">' + md + "</div></button>"; }

  /* ===================================================================
     TRANSLATE
  =================================================================== */
  RENDER.translate = function () { translateLoad(); };
  function translateLoad() {
    var p = panel("translate");
    p.innerHTML = loadingHTML("Preparing a translation…");
    AI.generate("translate", lvl(), diff()).then(function (item) {
      if (!item) { p.innerHTML = emptyHTML(); return; }
      renderTranslate(p, item);
    });
  }
  function renderTranslate(p, item) {
    var micBtn = Speech.supportedSTT ? '<button class="btn ghost" id="trMic" type="button">🎙️ Speak answer</button>' : "";
    p.innerHTML =
      '<div class="card"><h2>Translate to French</h2><p class="lead">Type it — or speak it. ' + lvl() + ' · ' + diff() + '</p>' +
      '<div class="prompt-box"><span class="tag">English</span>' + esc(item.en) + '</div>' +
      '<textarea id="trInput" rows="2" placeholder="Votre réponse en français…"></textarea>' +
      '<div class="row" style="margin-top:12px">' +
        '<button class="btn" id="trCheck">Check</button>' + micBtn +
        '<div class="spacer"></div><button class="btn ghost" id="trSkip" type="button">Skip →</button>' +
      '</div><div id="trFb"></div></div>';

    var input = $("#trInput", p), fb = $("#trFb", p), done = false;
    input.focus();
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); check(); } });
    $("#trCheck", p).onclick = check;
    $("#trSkip", p).onclick = translateLoad;
    if ($("#trMic", p)) wireMic($("#trMic", p), function (t) { input.value = t; });

    function check() {
      if (done) { translateLoad(); return; }
      var user = input.value.trim();
      if (!user) { input.focus(); return; }
      fb.innerHTML = '<div class="loading" style="margin-top:12px"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Checking…</div>';
      AI.evaluate({ mode: "translate", prompt: item.en, target: item.fr, user: user, level: lvl(), difficulty: diff() })
        .then(function (r) {
          var ctx = { mode: "translate", level: lvl(), difficulty: diff(), prompt: item.en, target: item.fr, user: user };
          applyResult(r, ctx);
          fb.innerHTML = "";
          fb.appendChild(feedbackNode(r));
          fb.appendChild(listenRow(r.corrected || item.fr));
          done = true;
          var btn = $("#trCheck", p); btn.textContent = "Next →"; btn.classList.add("good");
        });
    }
  }

  /* ===================================================================
     SPEAK
  =================================================================== */
  RENDER.speak = function () { speakLoad(); };
  function speakLoad() {
    var p = panel("speak");
    p.innerHTML = loadingHTML("Preparing a sentence…");
    AI.generate("speak", lvl(), diff()).then(function (item) {
      if (!item) { p.innerHTML = emptyHTML(); return; }
      renderSpeak(p, item);
    });
  }
  function renderSpeak(p, item) {
    var inputArea = Speech.supportedSTT
      ? '<button class="btn mic" id="spMic" type="button">🎙️ Tap &amp; say it</button>' +
        '<div id="spTranscript"></div>'
      : '<p class="muted">Speech recognition isn\'t available in this browser (try Chrome/Edge). Type what you would say:</p>' +
        '<textarea id="spInput" rows="2" placeholder="Tapez la phrase…"></textarea>' +
        '<div class="row" style="margin-top:10px"><button class="btn" id="spCheck">Check</button></div>';
    p.innerHTML =
      '<div class="card"><h2>Say it aloud</h2><p class="lead">Listen, then repeat. ' + lvl() + ' · ' + diff() + '</p>' +
      '<div class="prompt-box"><span class="tag">Repeat in French</span>' + esc(item.fr) +
        (item.en ? '<div class="muted" style="margin-top:6px;font-weight:400">' + esc(item.en) + '</div>' : "") + '</div>' +
      '<div class="row"><button class="btn ghost" id="spListen" type="button">🔊 Listen</button></div>' +
      '<div style="margin-top:14px">' + inputArea + '</div>' +
      '<div class="row" style="margin-top:12px"><div class="spacer"></div><button class="btn ghost" id="spSkip" type="button">Skip →</button></div>' +
      '<div id="spFb"></div></div>';

    var fb = $("#spFb", p), done = false;
    $("#spListen", p).onclick = function () { Speech.speak(item.fr); };
    $("#spSkip", p).onclick = speakLoad;
    Speech.speak(item.fr); // auto-play once

    function grade(user) {
      fb.innerHTML = '<div class="loading" style="margin-top:12px"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Checking…</div>';
      AI.evaluate({ mode: "speak", prompt: item.fr + (item.en ? " (" + item.en + ")" : ""), target: item.fr, user: user, level: lvl(), difficulty: diff() })
        .then(function (r) {
          applyResult(r, { mode: "speak", level: lvl(), difficulty: diff(), prompt: item.fr, target: item.fr, user: user });
          fb.innerHTML = "";
          fb.appendChild(feedbackNode(r, { alwaysCorrected: true }));
          fb.appendChild(listenRow(item.fr));
          var nxt = document.createElement("button"); nxt.className = "btn good"; nxt.style.marginTop = "12px";
          nxt.textContent = "Next →"; nxt.onclick = speakLoad; fb.appendChild(nxt);
          done = true;
        });
    }

    if (Speech.supportedSTT) {
      var mic = $("#spMic", p), tr = $("#spTranscript", p);
      mic.onclick = function () {
        if (done) return;
        mic.classList.add("recording"); mic.textContent = "🎙️ Listening…";
        Speech.listen(function (text) {
          tr.innerHTML = '<div class="transcript">You said: “' + esc(text) + '”</div>';
          grade(text);
        }, function (err) {
          tr.innerHTML = '<div class="muted">Mic error: ' + esc(err) + '. Check microphone permission.</div>';
        }, function () { mic.classList.remove("recording"); mic.textContent = "🎙️ Tap & say it"; });
      };
    } else {
      $("#spCheck", p).onclick = function () {
        var v = $("#spInput", p).value.trim(); if (v) grade(v);
      };
    }
  }

  /* ===================================================================
     BUILD (sentence builder)
  =================================================================== */
  RENDER.build = function () { buildLoad(); };
  function buildLoad() {
    var p = panel("build");
    p.innerHTML = loadingHTML("Preparing a sentence…");
    AI.generate("build", lvl(), diff()).then(function (item) {
      if (!item) { p.innerHTML = emptyHTML(); return; }
      if (diff() === "easy") renderBuildChips(p, item);
      else renderBuildFree(p, item);
    });
  }
  function tokenize(s) { return s.trim().split(/\s+/); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  function renderBuildChips(p, item) {
    var words = tokenize(item.target);
    var pool = shuffle(words);
    if (pool.join(" ") === words.join(" ") && pool.length > 1) pool = shuffle(words);
    p.innerHTML =
      '<div class="card"><h2>Build the sentence</h2><p class="lead">Tap the words in the right order. ' + lvl() + ' · easy</p>' +
      '<div class="prompt-box"><span class="tag">Meaning</span>' + esc(item.en) + '</div>' +
      '<div class="chips answer" id="bAns"></div>' +
      '<div class="chips" id="bPool"></div>' +
      '<div class="row" style="margin-top:12px"><button class="btn" id="bCheck">Check</button>' +
      '<button class="btn ghost" id="bClear" type="button">Clear</button>' +
      '<div class="spacer"></div><button class="btn ghost" id="bSkip" type="button">Skip →</button></div>' +
      '<div id="bFb"></div></div>';

    var ansEl = $("#bAns", p), poolEl = $("#bPool", p), fb = $("#bFb", p);
    var answer = [], available = pool.slice(), done = false;
    function draw() {
      ansEl.innerHTML = ""; poolEl.innerHTML = "";
      answer.forEach(function (w, i) { ansEl.appendChild(chip(w, function () { available.push(answer.splice(i, 1)[0]); draw(); })); });
      available.forEach(function (w, i) { poolEl.appendChild(chip(w, function () { answer.push(available.splice(i, 1)[0]); draw(); })); });
    }
    function chip(w, on) { var c = document.createElement("button"); c.className = "word-chip"; c.type = "button"; c.textContent = w; c.onclick = on; return c; }
    draw();
    $("#bClear", p).onclick = function () { available = available.concat(answer); answer = []; draw(); };
    $("#bSkip", p).onclick = buildLoad;
    $("#bCheck", p).onclick = function () {
      if (done) { buildLoad(); return; }
      if (!answer.length) return;
      var user = answer.join(" ");
      fb.innerHTML = '<div class="loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Checking…</div>';
      AI.evaluate({ mode: "build", prompt: item.en, target: item.target, user: user, level: lvl(), difficulty: diff() }).then(function (r) {
        applyResult(r, { mode: "build", level: lvl(), difficulty: "easy", prompt: item.en, target: item.target, user: user });
        fb.innerHTML = ""; fb.appendChild(feedbackNode(r)); fb.appendChild(listenRow(r.corrected || item.target));
        var btn = $("#bCheck", p); btn.textContent = "Next →"; btn.classList.add("good"); done = true;
      });
    };
  }
  function renderBuildFree(p, item) {
    p.innerHTML =
      '<div class="card"><h2>Build the sentence</h2><p class="lead">Write the French. ' + lvl() + ' · ' + diff() + '</p>' +
      '<div class="prompt-box"><span class="tag">Meaning</span>' + esc(item.en) + '</div>' +
      '<textarea id="bInput" rows="2" placeholder="Construisez la phrase…"></textarea>' +
      '<div class="row" style="margin-top:12px"><button class="btn" id="bCheck">Check</button>' +
      '<div class="spacer"></div><button class="btn ghost" id="bSkip" type="button">Skip →</button></div><div id="bFb"></div></div>';
    var input = $("#bInput", p), fb = $("#bFb", p), done = false;
    input.focus();
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } });
    $("#bSkip", p).onclick = buildLoad;
    $("#bCheck", p).onclick = go;
    function go() {
      if (done) { buildLoad(); return; }
      var user = input.value.trim(); if (!user) return;
      fb.innerHTML = '<div class="loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Checking…</div>';
      AI.evaluate({ mode: "build", prompt: item.en, target: item.target, user: user, level: lvl(), difficulty: diff() }).then(function (r) {
        applyResult(r, { mode: "build", level: lvl(), difficulty: diff(), prompt: item.en, target: item.target, user: user });
        fb.innerHTML = ""; fb.appendChild(feedbackNode(r)); fb.appendChild(listenRow(r.corrected || item.target));
        var btn = $("#bCheck", p); btn.textContent = "Next →"; btn.classList.add("good"); done = true;
      });
    }
  }

  /* ===================================================================
     GRAMMAR
  =================================================================== */
  RENDER.grammar = function () { grammarLoad(); };
  function grammarLoad() {
    var p = panel("grammar");
    p.innerHTML = loadingHTML("Preparing a sentence to fix…");
    AI.generate("grammar", lvl(), diff()).then(function (item) {
      if (!item) { p.innerHTML = emptyHTML(); return; }
      renderGrammar(p, item);
    });
  }
  function renderGrammar(p, item) {
    p.innerHTML =
      '<div class="card"><h2>Fix the sentence</h2><p class="lead">One thing is wrong — rewrite it correctly. ' + lvl() + ' · ' + diff() + '</p>' +
      '<div class="prompt-box"><span class="tag">Incorrect</span>' + esc(item.prompt) + '</div>' +
      '<textarea id="grInput" rows="2" placeholder="Corrigez la phrase…">' + esc(item.prompt) + '</textarea>' +
      '<div class="row" style="margin-top:12px"><button class="btn" id="grCheck">Check</button>' +
      '<div class="spacer"></div><button class="btn ghost" id="grSkip" type="button">Skip →</button></div><div id="grFb"></div></div>';
    var input = $("#grInput", p), fb = $("#grFb", p), done = false;
    input.focus();
    input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } });
    $("#grSkip", p).onclick = grammarLoad;
    $("#grCheck", p).onclick = go;
    function go() {
      if (done) { grammarLoad(); return; }
      var user = input.value.trim(); if (!user) return;
      fb.innerHTML = '<div class="loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Checking…</div>';
      AI.evaluate({ mode: "grammar", prompt: item.prompt, target: item.target, user: user, level: lvl(), difficulty: diff(), rule: item.rule }).then(function (r) {
        if (!r.rule && item.rule) r.rule = item.rule;
        applyResult(r, { mode: "grammar", level: lvl(), difficulty: diff(), prompt: item.prompt, target: item.target || r.corrected, user: user });
        fb.innerHTML = ""; fb.appendChild(feedbackNode(r, { alwaysCorrected: true })); fb.appendChild(listenRow(r.corrected || item.target));
        var btn = $("#grCheck", p); btn.textContent = "Next →"; btn.classList.add("good"); done = true;
      });
    }
  }

  /* ===================================================================
     FLASHCARDS
  =================================================================== */
  RENDER.flashcards = function () { flashLoad(); };
  function flashLoad() {
    var p = panel("flashcards");
    var dueNow = SRS.dueFlashcards();
    if (dueNow.length) { renderFlash(p, dueNow[0]); return; }
    p.innerHTML = loadingHTML("Fetching new cards…");
    AI.generate("flash", lvl(), diff()).then(function (item) {
      // generate() returns a single item; build a small batch from cache too
      var batch = [];
      if (item) batch.push(item);
      for (var i = 0; i < 5; i++) { var c = Store.takeCache("flash", lvl(), diff()); if (c) batch.push(c); }
      if (!batch.length) batch = Data.batch("flash", lvl(), 6);
      SRS.addFlashcards(batch);
      var due = SRS.dueFlashcards();
      if (due.length) renderFlash(p, due[0]);
      else p.innerHTML = '<div class="card empty"><div class="big">🃏</div>No cards yet. Try another level.</div>';
    });
  }
  function renderFlash(p, card) {
    var dueCount = SRS.countDueFlashcards();
    p.innerHTML =
      '<div class="card"><div class="row between"><h2 style="margin:0">Flashcards</h2><span class="muted">' + dueCount + ' due · ' + lvl() + '</span></div>' +
      '<p class="lead">Tap the card to flip, then rate how well you knew it.</p>' +
      '<div class="flashcard" id="fc"><div class="flashcard-inner">' +
        '<div class="flashcard-face front"><div><div class="fh">English</div><div class="ft">' + esc(card.front) + '</div></div></div>' +
        '<div class="flashcard-face back"><div><div class="fh">Français</div><div class="ft">' + esc(card.back) + '</div></div></div>' +
      '</div></div>' +
      '<div id="fcActions"></div></div>';
    var fcEl = $("#fc", p), actions = $("#fcActions", p), flipped = false;
    fcEl.onclick = function () {
      flipped = !flipped; fcEl.classList.toggle("flipped", flipped);
      if (flipped) {
        Speech.speak(card.back);
        actions.innerHTML =
          '<div class="row" style="margin-top:14px">' +
          '<button class="btn ghost" data-r="again">😵 Again</button>' +
          '<button class="btn" data-r="good">🙂 Good</button>' +
          '<button class="btn good" data-r="easy">😎 Easy</button>' +
          '<div class="spacer"></div><button class="btn ghost" id="fcHear" type="button">🔊</button></div>';
        actions.querySelectorAll("[data-r]").forEach(function (b) {
          b.onclick = function (e) {
            e.stopPropagation();
            SRS.gradeFlashcard(card, b.dataset.r);
            if (b.dataset.r !== "again") { Game.award(Game.xpFor(lvl(), diff(), 5)); }
            flashLoad();
          };
        });
        $("#fcHear", actions).onclick = function (e) { e.stopPropagation(); Speech.speak(card.back); };
      }
    };
  }

  /* ===================================================================
     REVIEW (mistake trainer)
  =================================================================== */
  RENDER.review = function () { reviewLoad(); };
  function reviewLoad() {
    var p = panel("review");
    var due = SRS.dueMistakes();
    if (!due.length) {
      var total = SRS.countMistakes();
      p.innerHTML = '<div class="card empty"><div class="big">🎉</div><strong>Nothing due right now.</strong>' +
        '<div class="muted" style="margin-top:6px">' +
        (total ? total + ' item' + (total > 1 ? "s" : "") + ' scheduled for later — come back soon.' : 'Mistakes you make in other tabs show up here to drill until you nail them.') +
        '</div></div>';
      refreshStats();
      return;
    }
    renderReviewItem(p, due[0], due.length);
  }
  function renderReviewItem(p, m, dueCount) {
    var promptText = (m.mode === "translate" || m.mode === "build") ? m.prompt :
                     (m.mode === "grammar") ? m.prompt :
                     (m.mode === "speak") ? m.prompt : m.prompt;
    var tag = ({ translate: "Translate to French", build: "Build in French", grammar: "Fix this", speak: "Say this in French" })[m.mode] || "Answer";
    var needed = 2 - (m.streak || 0);
    var hint = m.feedback ? '<div class="tip" style="margin-bottom:12px">📌 Last time: ' + esc(m.feedback) + (m.rule ? " · " + esc(m.rule) : "") + '</div>' : "";

    var inputBlock, isSpeak = (m.mode === "speak");
    if (isSpeak && Speech.supportedSTT) {
      inputBlock = '<button class="btn ghost" id="rvListen" type="button">🔊 Listen</button> ' +
        '<button class="btn mic" id="rvMic" type="button">🎙️ Say it</button><div id="rvTr"></div>';
    } else {
      inputBlock = '<textarea id="rvInput" rows="2" placeholder="Votre réponse…"></textarea>' +
        '<div class="row" style="margin-top:12px"><button class="btn" id="rvCheck">Check</button>' +
        '<div class="spacer"></div></div>';
    }

    p.innerHTML =
      '<div class="card"><div class="row between"><h2 style="margin:0">🎯 Review</h2><span class="muted">' + dueCount + ' due · ' + needed + ' more to clear</span></div>' +
      '<p class="lead">Drill it until it sticks.</p>' + hint +
      '<div class="prompt-box"><span class="tag">' + tag + '</span>' + esc(promptText) + '</div>' +
      inputBlock + '<div id="rvFb"></div></div>';

    var fb = $("#rvFb", p);
    function grade(user) {
      fb.innerHTML = '<div class="loading"><span class="dot"></span><span class="dot"></span><span class="dot"></span> Checking…</div>';
      AI.evaluate({ mode: m.mode, prompt: m.prompt, target: m.target, user: user, level: m.level, difficulty: m.difficulty, rule: m.rule }).then(function (r) {
        if (!r.rule && m.rule) r.rule = m.rule;
        var res = SRS.gradeMistake(m, r.correct);
        if (r.correct) {
          Game.award(Game.xpFor(m.level, m.difficulty, res.graduated ? 12 : 8));
          if (res.graduated) { Game.bump("mistakesCleared"); Game.checkBadges(); Game.toast("✅ Cleared from trainer!", "badge-toast"); }
          else Game.toast("Nice — 1 more to clear", "xp");
        } else { refreshStats(); }
        fb.innerHTML = ""; fb.appendChild(feedbackNode(r, { alwaysCorrected: true })); fb.appendChild(listenRow(r.corrected || m.target));
        var nxt = document.createElement("button"); nxt.className = "btn good"; nxt.style.marginTop = "12px";
        nxt.textContent = "Next →"; nxt.onclick = reviewLoad; fb.appendChild(nxt);
      });
    }

    if (isSpeak && Speech.supportedSTT) {
      $("#rvListen", p).onclick = function () { Speech.speak(m.target || m.prompt); };
      var mic = $("#rvMic", p), tr = $("#rvTr", p);
      mic.onclick = function () {
        mic.classList.add("recording"); mic.textContent = "🎙️ Listening…";
        Speech.listen(function (t) { tr.innerHTML = '<div class="transcript">You said: “' + esc(t) + '”</div>'; grade(t); },
          function (err) { tr.innerHTML = '<div class="muted">Mic error: ' + esc(err) + '</div>'; },
          function () { mic.classList.remove("recording"); mic.textContent = "🎙️ Say it"; });
      };
    } else {
      var input = $("#rvInput", p); input.focus();
      input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); var v = input.value.trim(); if (v) grade(v); } });
      $("#rvCheck", p).onclick = function () { var v = input.value.trim(); if (v) grade(v); };
    }
  }

  /* ============ small shared bits ============ */
  function listenRow(text) {
    var d = document.createElement("div");
    d.className = "row"; d.style.marginTop = "10px";
    var b = document.createElement("button"); b.className = "btn ghost small"; b.type = "button";
    b.textContent = "🔊 Hear it"; b.onclick = function () { Speech.speak(text); };
    d.appendChild(b); return d;
  }
  function emptyHTML() { return '<div class="card empty"><div class="big">🙃</div>Couldn\'t load an exercise. Check your level or API key in Settings.</div>'; }
  function wireMic(btn, onText) {
    btn.onclick = function () {
      btn.classList.add("recording"); var old = btn.textContent; btn.textContent = "🎙️ Listening…";
      Speech.listen(onText, function () {}, function () { btn.classList.remove("recording"); btn.textContent = old; });
    };
  }

  /* ============ settings drawer ============ */
  function openDrawer() {
    $("#drawer").hidden = false; $("#overlay").hidden = false;
    $("#apiKeyInput").value = Store.settings.apiKey || "";
    $("#goalInput").value = Store.settings.dailyGoal || 50;
    populateVoiceSelect();
    updateKeyStatus();
  }
  function closeDrawer() { $("#drawer").hidden = true; $("#overlay").hidden = true; }

  /* ---- sync (Supabase) UI ---- */
  var SYNC_MSG = { pending: "…changes pending", syncing: "Syncing…", synced: "✓ Synced to cloud", error: "Sync error — check connection" };
  function syncRender(status) {
    var field = $("#syncField");
    if (!field) return;
    if (!window.Sync || !Sync.available()) { field.hidden = true; return; }
    field.hidden = false;
    var inUser = Sync.signedIn();
    $("#syncSignedOut").hidden = inUser;
    $("#syncSignedIn").hidden = !inUser;
    if (inUser && Sync.user()) $("#syncWho").textContent = "Signed in as " + (Sync.user().email || "");
    var st = $("#syncStatus");
    if (status && SYNC_MSG[status]) {
      st.className = "key-status " + (status === "error" ? "no" : (status === "synced" ? "ok" : ""));
      st.textContent = SYNC_MSG[status];
    } else if (!inUser) { st.className = "key-status"; st.textContent = ""; }
  }
  function populateVoiceSelect() {
    var sel = $("#voiceSelect"); if (!sel) return;
    var voices = Speech.loadVoices();
    if (!voices.length) { sel.innerHTML = '<option value="">(no French voice found in this browser)</option>'; return; }
    sel.innerHTML = voices.map(function (v) {
      return '<option value="' + esc(v.voiceURI) + '"' + (v.voiceURI === Store.settings.voiceURI ? " selected" : "") + ">" + esc(v.name) + " (" + v.lang + ")</option>";
    }).join("");
  }
  function updateKeyStatus() {
    var s = $("#keyStatus");
    if (!AI.hasKey()) { s.className = "key-status no"; s.textContent = "No key — running on the built-in starter bank."; return; }
    s.className = "key-status"; s.textContent = "Checking key…";
    AI.validateKey().then(function (r) {
      if (r.ok) { s.className = "key-status ok"; s.textContent = "✓ Key works — AI exercises & feedback enabled."; return; }
      s.className = "key-status no";
      var err = r.error || "test call failed";
      if (/credit balance/i.test(err)) s.textContent = "Key is valid, but your Anthropic account is out of credits — add credits in Plans & Billing. (App runs on the starter bank until then.)";
      else if (r.status === 401 || /authentication|x-api-key|invalid.*key/i.test(err)) s.textContent = "Key rejected — double-check you pasted the full key.";
      else s.textContent = "Key set, but a call failed: " + err;
    });
  }

  /* ============ init ============ */
  function init() {
    // selectors
    var ls = $("#levelSelect"), ds = $("#difficultySelect");
    ls.value = Store.settings.level; ds.value = Store.settings.difficulty;
    ls.onchange = function () { Store.setSetting("level", ls.value); rerenderActive(); };
    ds.onchange = function () { Store.setSetting("difficulty", ds.value); rerenderActive(); };

    // tabs
    document.querySelectorAll(".tab").forEach(function (t) { t.onclick = function () { switchTab(t.dataset.tab); }; });

    // settings
    $("#settingsBtn").onclick = openDrawer;
    $("#closeDrawer").onclick = closeDrawer;
    $("#overlay").onclick = closeDrawer;
    $("#apiKeyInput").addEventListener("change", function () { Store.setSetting("apiKey", this.value.trim()); updateKeyStatus(); refreshStats(); });
    $("#goalInput").addEventListener("change", function () { Store.setSetting("dailyGoal", Math.max(10, parseInt(this.value, 10) || 50)); });
    $("#voiceSelect").addEventListener("change", function () { Store.setSetting("voiceURI", this.value); });
    $("#testVoiceBtn").onclick = function () { Speech.speak("Bonjour ! Prêt à pratiquer votre français ?"); };
    $("#resetBtn").onclick = function () {
      if (confirm("Reset all progress, mistakes and cached exercises? Your API key stays.")) {
        Store.reset(); refreshStats(); Game.toast("Progress reset", ""); switchTab("home");
      }
    };

    // sync (Supabase) wiring
    window.__parleviteRefresh = function () { refreshStats(); rerenderActive(); };
    if (window.Sync) {
      $("#syncSendLink").onclick = function () {
        var email = ($("#syncEmail").value || "").trim();
        if (!email) { $("#syncEmail").focus(); return; }
        $("#syncStatus").className = "key-status"; $("#syncStatus").textContent = "Sending link…";
        Sync.signIn(email).then(function (r) {
          if (r && r.error) { $("#syncStatus").className = "key-status no"; $("#syncStatus").textContent = "Couldn't send: " + r.error.message; }
          else { $("#syncStatus").className = "key-status ok"; $("#syncStatus").textContent = "✓ Check your email for the sign-in link."; }
        }).catch(function (e) { $("#syncStatus").className = "key-status no"; $("#syncStatus").textContent = "Error: " + (e.message || e); });
      };
      $("#syncNow").onclick = function () { Sync.syncNow(); };
      $("#syncOut").onclick = function () { Sync.signOut().then(function () { syncRender(); }); };
      Sync.init(syncRender);
      syncRender();
    }

    Speech.loadVoices();
    refreshStats();

    var start = "home";
    try { start = localStorage.getItem("parlevite.tab") || "home"; } catch (e) {}
    switchTab(start);

    if (AI.hasKey()) { ["translate", "build", "grammar", "speak"].forEach(function (m) { AI.prewarm(m, lvl(), diff()); }); }
  }

  function rerenderActive() {
    var active = document.querySelector(".tab.active");
    if (active) switchTab(active.dataset.tab);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
