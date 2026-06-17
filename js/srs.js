/* srs.js — Leitner spaced-repetition engine shared by the mistake trainer
   and the flashcards. Exposed globally as `SRS`. */
(function () {
  "use strict";

  var DAY = 24 * 60 * 60 * 1000;
  // Leitner intervals per box (days). Box 1 = due now.
  var INTERVALS = [0, 0, 1, 3, 7, 16, 30];
  var GRADUATE_AT = 2;        // consecutive correct reviews to clear a mistake

  function now() { return Date.now(); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function dueDate(box) {
    var b = Math.max(1, Math.min(box, INTERVALS.length - 1));
    return now() + INTERVALS[b] * DAY;
  }

  function norm(s) { return (s || "").toString().trim().toLowerCase(); }

  var SRS = {
    uid: uid,
    now: now,

    /* ---------- Mistake bank ---------- */
    addMistake: function (item) {
      var bank = Store.mistakes;
      var key = item.mode + "::" + norm(item.prompt);
      var existing = bank.find(function (m) { return m.mode === item.mode && norm(m.prompt) === norm(item.prompt); });
      if (existing) {
        // Seen this one wrong before — reset its schedule and refresh feedback.
        existing.box = 1;
        existing.streak = 0;
        existing.due = now();
        existing.userAnswer = item.userAnswer || existing.userAnswer;
        existing.feedback = item.feedback || existing.feedback;
        existing.tip = item.tip || existing.tip;
        existing.rule = item.rule || existing.rule;
        existing.seen = (existing.seen || 1) + 1;
      } else {
        bank.push(Object.assign({
          id: uid(),
          box: 1,
          streak: 0,
          due: now(),
          seen: 1,
          createdAt: now()
        }, item, { _key: key }));
      }
      Store.save();
    },

    dueMistakes: function () {
      var t = now();
      return Store.mistakes
        .filter(function (m) { return m.due <= t; })
        .sort(function (a, b) { return a.box - b.box || a.due - b.due; });
    },

    countMistakes: function () { return Store.mistakes.length; },
    countDueMistakes: function () { return this.dueMistakes().length; },

    // Grade a review attempt. Returns { graduated: bool }.
    gradeMistake: function (item, correct) {
      var bank = Store.mistakes;
      var m = bank.find(function (x) { return x.id === item.id; });
      if (!m) return { graduated: false };
      if (correct) {
        m.streak = (m.streak || 0) + 1;
        m.box = Math.min((m.box || 1) + 1, INTERVALS.length - 1);
        if (m.streak >= GRADUATE_AT) {
          Store.state.mistakes = bank.filter(function (x) { return x.id !== m.id; });
          Store.save();
          return { graduated: true };
        }
        m.due = dueDate(m.box);
      } else {
        m.streak = 0;
        m.box = 1;
        m.due = now();
      }
      Store.save();
      return { graduated: false };
    },

    /* ---------- Flashcards ---------- */
    addFlashcard: function (card) {
      var deck = Store.flashcards;
      var exists = deck.find(function (c) { return norm(c.front) === norm(card.front); });
      if (exists) return exists;
      var fc = Object.assign({
        id: uid(),
        box: 1,
        due: now(),
        reviews: 0,
        createdAt: now()
      }, card);
      deck.push(fc);
      Store.save();
      return fc;
    },

    addFlashcards: function (cards) {
      var self = this;
      (cards || []).forEach(function (c) { self.addFlashcard(c); });
    },

    dueFlashcards: function () {
      var t = now();
      return Store.flashcards
        .filter(function (c) { return c.due <= t; })
        .sort(function (a, b) { return a.due - b.due; });
    },

    countDueFlashcards: function () { return this.dueFlashcards().length; },

    // rating: "again" | "good" | "easy"
    gradeFlashcard: function (card, rating) {
      var c = Store.flashcards.find(function (x) { return x.id === card.id; });
      if (!c) return;
      c.reviews = (c.reviews || 0) + 1;
      if (rating === "again") c.box = 1;
      else if (rating === "easy") c.box = Math.min((c.box || 1) + 2, INTERVALS.length - 1);
      else c.box = Math.min((c.box || 1) + 1, INTERVALS.length - 1);
      c.due = rating === "again" ? now() + 60 * 1000 : dueDate(c.box);
      Store.save();
    }
  };

  window.SRS = SRS;
})();
