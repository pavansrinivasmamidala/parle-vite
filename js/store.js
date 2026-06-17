/* store.js — all persistent state lives in localStorage.
   Exposed globally as `Store`. No build step, no modules. */
(function () {
  "use strict";

  var KEY = "parlevite.v1";

  var defaults = {
    settings: {
      apiKey: "",
      level: "B1",
      difficulty: "medium",
      voiceURI: "",
      dailyGoal: 50
    },
    progress: {
      xp: 0,
      streak: 0,
      lastActiveDay: "",      // YYYY-MM-DD
      todayXp: 0,
      todayDay: "",
      badges: [],             // ids of earned badges
      counters: {             // lifetime tallies for badges
        correct: 0,
        sentences: 0,
        mistakesCleared: 0,
        spoken: 0
      }
    },
    mistakes: [],             // SRS items (see srs.js shape)
    flashcards: [],           // SRS items for vocab
    cache: {}                 // key -> array of generated exercises
  };

  var state = load();
  var saveHooks = [];

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return clone(defaults);
      var parsed = JSON.parse(raw);
      return deepMerge(clone(defaults), parsed);
    } catch (e) {
      console.warn("Store load failed, starting fresh", e);
      return clone(defaults);
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Store save failed", e);
    }
    for (var i = 0; i < saveHooks.length; i++) { try { saveHooks[i](); } catch (e2) {} }
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function deepMerge(base, over) {
    Object.keys(over || {}).forEach(function (k) {
      if (over[k] && typeof over[k] === "object" && !Array.isArray(over[k]) &&
          base[k] && typeof base[k] === "object" && !Array.isArray(base[k])) {
        deepMerge(base[k], over[k]);
      } else {
        base[k] = over[k];
      }
    });
    return base;
  }

  var Store = {
    state: state,
    save: save,

    get settings() { return state.settings; },
    get progress() { return state.progress; },
    get mistakes() { return state.mistakes; },
    get flashcards() { return state.flashcards; },

    setSetting: function (k, v) { state.settings[k] = v; save(); },

    // register a callback fired after every save (used by the sync layer)
    onSave: function (fn) { saveHooks.push(fn); },

    /* ---- generated-exercise cache (keeps it snappy & cuts API calls) ---- */
    cacheKey: function (mode, level, diff) { return mode + "|" + level + "|" + diff; },
    pushCache: function (mode, level, diff, items) {
      var key = this.cacheKey(mode, level, diff);
      var arr = state.cache[key] || [];
      state.cache[key] = arr.concat(items);
      save();
    },
    takeCache: function (mode, level, diff) {
      var key = this.cacheKey(mode, level, diff);
      var arr = state.cache[key];
      if (arr && arr.length) {
        var item = arr.shift();
        save();
        return item;
      }
      return null;
    },
    cacheCount: function (mode, level, diff) {
      var arr = state.cache[this.cacheKey(mode, level, diff)];
      return arr ? arr.length : 0;
    },

    reset: function () {
      var key = state.settings.apiKey; // keep the key
      state = clone(defaults);
      state.settings.apiKey = key;
      Store.state = state;
      save();
    }
  };

  window.Store = Store;
})();
