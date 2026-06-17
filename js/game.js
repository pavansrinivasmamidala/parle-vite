/* game.js — gamification: XP, ranks, daily streak/goal, badges, toasts.
   Exposed globally as `Game`. */
(function () {
  "use strict";

  var RANKS = [
    { name: "Débutant", at: 0 },
    { name: "Apprenti", at: 100 },
    { name: "Voyageur", at: 300 },
    { name: "Causeur", at: 700 },
    { name: "Confirmé", at: 1500 },
    { name: "Avancé", at: 3000 },
    { name: "Courant", at: 6000 },
    { name: "Maître", at: 12000 }
  ];

  var LEVEL_MULT = { A1: 1, A2: 1.2, B1: 1.4, B2: 1.6, C1: 1.8, C2: 2 };
  var DIFF_MULT = { easy: 1, medium: 1.5, hard: 2 };

  var BADGES = [
    { id: "first", emoji: "🐣", name: "First Steps", desc: "Answer your first question", test: function (p) { return p.counters.correct >= 1; } },
    { id: "streak3", emoji: "🔥", name: "On Fire", desc: "3-day streak", test: function (p) { return p.streak >= 3; } },
    { id: "streak7", emoji: "📅", name: "Week Warrior", desc: "7-day streak", test: function (p) { return p.streak >= 7; } },
    { id: "correct50", emoji: "💪", name: "Half Century", desc: "50 correct answers", test: function (p) { return p.counters.correct >= 50; } },
    { id: "sentences100", emoji: "✍️", name: "Wordsmith", desc: "Build 100 sentences", test: function (p) { return p.counters.sentences >= 100; } },
    { id: "spoken25", emoji: "🗣️", name: "Bien parlé", desc: "Speak 25 times", test: function (p) { return p.counters.spoken >= 25; } },
    { id: "slayer20", emoji: "🎯", name: "Mistake Slayer", desc: "Clear 20 review items", test: function (p) { return p.counters.mistakesCleared >= 20; } },
    { id: "xp1000", emoji: "⭐", name: "Rising Star", desc: "Earn 1000 XP", test: function (p) { return p.xp >= 1000; } }
  ];

  var listeners = [];

  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function yesterdayStr() { return new Date(Date.now() - 86400000).toISOString().slice(0, 10); }

  function rollDay() {
    var p = Store.progress;
    var t = todayStr();
    if (p.todayDay !== t) { p.todayDay = t; p.todayXp = 0; }
  }

  var Game = {
    BADGES: BADGES,

    xpFor: function (level, difficulty, base) {
      base = base || 10;
      var lm = LEVEL_MULT[level] || 1.4;
      var dm = DIFF_MULT[difficulty] || 1.5;
      return Math.round(base * lm * dm);
    },

    award: function (amount) {
      var p = Store.progress;
      rollDay();
      // streak handling
      var t = todayStr();
      if (p.lastActiveDay !== t) {
        p.streak = (p.lastActiveDay === yesterdayStr()) ? (p.streak + 1) : 1;
        p.lastActiveDay = t;
      }
      p.xp += amount;
      p.todayXp += amount;
      Store.save();
      this.toast("+" + amount + " XP", "xp");
      this.checkBadges();
      this.emit();
    },

    bump: function (counter, n) {
      Store.progress.counters[counter] = (Store.progress.counters[counter] || 0) + (n || 1);
      Store.save();
    },

    rank: function () {
      var xp = Store.progress.xp;
      var idx = 0;
      for (var i = 0; i < RANKS.length; i++) { if (xp >= RANKS[i].at) idx = i; }
      var cur = RANKS[idx];
      var next = RANKS[idx + 1];
      var pct, into, need;
      if (next) {
        into = xp - cur.at;
        need = next.at - cur.at;
        pct = Math.round((into / need) * 100);
      } else { into = 0; need = 0; pct = 100; }
      return { name: cur.name, idx: idx, next: next ? next.name : null, pct: pct, into: into, need: need };
    },

    goalPct: function () {
      rollDay();
      var p = Store.progress;
      var g = Store.settings.dailyGoal || 50;
      return Math.min(100, Math.round((p.todayXp / g) * 100));
    },

    checkBadges: function () {
      var p = Store.progress;
      var self = this;
      BADGES.forEach(function (b) {
        if (p.badges.indexOf(b.id) === -1 && b.test(p)) {
          p.badges.push(b.id);
          Store.save();
          self.toast(b.emoji + " Badge: " + b.name, "badge-toast");
        }
      });
    },

    /* ---- toasts ---- */
    toast: function (msg, type) {
      var wrap = document.getElementById("toastWrap");
      if (!wrap) return;
      var el = document.createElement("div");
      el.className = "toast " + (type || "");
      el.textContent = msg;
      wrap.appendChild(el);
      setTimeout(function () {
        el.style.transition = "opacity .3s, transform .3s";
        el.style.opacity = "0";
        el.style.transform = "translateY(8px)";
        setTimeout(function () { el.remove(); }, 320);
      }, 2200);
    },

    onChange: function (cb) { listeners.push(cb); },
    emit: function () { listeners.forEach(function (cb) { try { cb(); } catch (e) {} }); }
  };

  window.Game = Game;
})();
