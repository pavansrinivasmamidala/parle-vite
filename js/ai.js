/* ai.js — Claude Haiku 4.5 client, called directly from the browser.
   generate() makes exercises, evaluate() grades free text + gives feedback.
   Falls back to the built-in seed bank when there's no key or a call fails.
   Exposed globally as `AI`. */
(function () {
  "use strict";

  var ENDPOINT = "https://api.anthropic.com/v1/messages";
  var MODEL = "claude-haiku-4-5";
  var BATCH = 5;

  function key() { return (Store.settings.apiKey || "").trim(); }
  function hasKey() { return key().length > 0; }

  /* ---- raw call: returns parsed JSON matching `schema` ---- */
  function call(system, user, schema, maxTokens) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 30000);
    return fetch(ENDPOINT, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens || 1024,
        system: system,
        messages: [{ role: "user", content: user }],
        output_config: { format: { type: "json_schema", schema: schema } }
      })
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) {
        return res.text().then(function (t) {
          var msg = t.slice(0, 300);
          try { var j = JSON.parse(t); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) {}
          var err = new Error(msg); err.status = res.status; throw err;
        });
      }
      return res.json();
    }).then(function (data) {
      var block = (data.content || []).find(function (b) { return b.type === "text"; });
      if (!block) throw new Error("No text block in response");
      return JSON.parse(block.text);
    });
  }

  /* ---- schemas ---- */
  function arrSchema(fields) {
    var props = {}; fields.forEach(function (f) { props[f] = { type: "string" }; });
    return {
      type: "object",
      properties: { items: { type: "array", items: { type: "object", properties: props, required: fields, additionalProperties: false } } },
      required: ["items"],
      additionalProperties: false
    };
  }

  var GEN = {
    translate: { fields: ["en", "fr"], n: BATCH,
      ask: "Generate {n} varied English sentences (everyday and TCF-exam topics) with correct, natural French translations." },
    build: { fields: ["en", "target"], n: BATCH,
      ask: "Generate {n} short English sentences ('en') with their correct, natural French translation ('target') for a learner to reconstruct." },
    grammar: { fields: ["prompt", "target", "rule"], n: BATCH,
      ask: "Generate {n} French sentences ('prompt') that each contain exactly ONE typical learner error, plus the corrected sentence ('target') and a one-line rule in English ('rule')." },
    speak: { fields: ["fr", "en"], n: BATCH,
      ask: "Generate {n} natural French sentences ('fr') for a learner to say aloud, each with its English meaning ('en')." },
    flash: { fields: ["front", "back"], n: 6,
      ask: "Generate {n} useful French vocabulary items: 'front' = English word/short phrase, 'back' = the French (include the article for nouns)." }
  };

  function genSystem(level, diff) {
    return "You are a French exercise generator for a student preparing the TCF exam. " +
      "Produce natural, idiomatic, correct French for CEFR level " + level + " at " + diff + " difficulty. " +
      "Vary the topics; avoid clichéd textbook examples. Respond ONLY in the required JSON schema.";
  }

  function generateBatch(mode, level, diff) {
    var spec = GEN[mode];
    if (!spec) return Promise.reject(new Error("unknown mode " + mode));
    var user = spec.ask.replace("{n}", spec.n) + " CEFR level: " + level + ". Difficulty: " + diff + ".";
    return call(genSystem(level, diff), user, arrSchema(spec.fields), 1600)
      .then(function (out) { return (out.items || []).filter(Boolean); });
  }

  /* ---- public: get one exercise (cache -> API -> seed) ---- */
  function generate(mode, level, diff) {
    var cached = Store.takeCache(mode, level, diff);
    if (cached) {
      if (hasKey() && Store.cacheCount(mode, level, diff) < 2) refill(mode, level, diff);
      return Promise.resolve(cached);
    }
    if (!hasKey()) return Promise.resolve(Data.get(mode, level));
    return generateBatch(mode, level, diff).then(function (items) {
      if (!items.length) return Data.get(mode, level);
      var first = items.shift();
      if (items.length) Store.pushCache(mode, level, diff, items);
      return first;
    }).catch(function (e) {
      console.warn("generate failed, using seed bank:", e.message);
      return Data.get(mode, level);
    });
  }

  var refilling = {};
  function refill(mode, level, diff) {
    var k = Store.cacheKey(mode, level, diff);
    if (refilling[k]) return;
    refilling[k] = true;
    generateBatch(mode, level, diff).then(function (items) {
      if (items.length) Store.pushCache(mode, level, diff, items);
    }).catch(function () {}).then(function () { refilling[k] = false; });
  }

  /* ---- public: evaluate a free-text / spoken answer ---- */
  var EVAL_SCHEMA = {
    type: "object",
    properties: {
      correct: { type: "boolean" },
      score: { type: "integer" },
      corrected: { type: "string" },
      summary: { type: "string" },
      errors: {
        type: "array",
        items: {
          type: "object",
          properties: {
            part: { type: "string" },
            fix: { type: "string" },
            why: { type: "string" }
          },
          required: ["part", "fix", "why"],
          additionalProperties: false
        }
      },
      alternatives: { type: "array", items: { type: "string" } },
      vocab: {
        type: "array",
        items: {
          type: "object",
          properties: {
            fr: { type: "string" },
            en: { type: "string" },
            example: { type: "string" }
          },
          required: ["fr", "en", "example"],
          additionalProperties: false
        }
      },
      tip: { type: "string" },
      rule: { type: "string" }
    },
    required: ["correct", "score", "corrected", "summary", "errors", "alternatives", "vocab", "tip", "rule"],
    additionalProperties: false
  };

  var MODE_LABEL = {
    translate: "an English→French translation",
    build: "a French sentence construction",
    grammar: "a French grammar correction",
    speak: "repeating a French sentence aloud (the answer is a speech-to-text transcript)",
    review: "a practice answer"
  };

  function evaluate(o) {
    // o: { mode, prompt, target, user, level, difficulty }
    if (!hasKey()) return Promise.resolve(localEval(o));

    var sys = "You are a precise, encouraging French tutor coaching a student for the TCF speaking exam. " +
      "Mark their French strictly (grammar, gender, agreement, accents, word order, naturalness) but accept valid alternatives. " +
      "Be concrete and itemised, NOT paragraphs. Always provide:\n" +
      "- 'summary': ONE short sentence verdict (what's right/wrong).\n" +
      "- 'errors': one entry per mistaken OR unnatural word/phrase — 'part' = their exact fragment (use '(missing)' for an omission), 'fix' = the correction, 'why' = a short reason. Empty array only if truly flawless.\n" +
      "- 'alternatives': 1-3 other natural ways to express the sentence, varying structure/register to grow their sentence-building.\n" +
      "- 'vocab': 2-3 NEW useful words or expressions they can reuse when speaking about this topic at the TCF — each with 'fr', 'en', and a short French 'example' sentence.\n" +
      "- 'corrected': the most natural full French sentence. 'tip': one quick speaking tip. 'rule': the key grammar rule, or empty string.\n" +
      "Respond ONLY in the required JSON schema.";

    var u = "Exercise type: " + (MODE_LABEL[o.mode] || "a practice answer") + ".\n";
    if (o.prompt) u += "Prompt shown to student: \"" + o.prompt + "\"\n";
    if (o.target) u += "Reference correct French: \"" + o.target + "\"\n";
    u += "Student's answer: \"" + (o.user || "") + "\"\n";
    u += "CEFR level: " + (o.level || "B1") + ", difficulty: " + (o.difficulty || "medium") + ".\n";
    u += "Set correct=true only if it is acceptable French with no significant error. Give score 0-100.";

    return call(sys, u, EVAL_SCHEMA, 1400)
      .then(function (r) { return normalizeEval(r, o); })
      .catch(function (e) {
        console.warn("evaluate failed, using local check:", e.message);
        return localEval(o);
      });
  }

  function normalizeEval(r, o) {
    r.errors = r.errors || [];
    r.alternatives = r.alternatives || [];
    r.vocab = r.vocab || [];
    r.summary = r.summary || r.feedback || "";
    r.feedback = r.summary;                 // alias kept for the saved-mistake hint
    if (!r.rule && o.rule) r.rule = o.rule;
    return r;
  }

  /* ---- offline / no-key fallback evaluation ---- */
  function stripAccents(s) { return s.normalize ? s.normalize("NFD").replace(/[̀-ͯ]/g, "") : s; }
  function clean(s) {
    return stripAccents((s || "").toLowerCase())
      .replace(/[.,!?;:«»"'’\-]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  var TIPS = [
    "Read your answer aloud — your ear often catches what your eye misses.",
    "Watch noun gender: learn each new noun with its article (le/la).",
    "In the passé composé, check your auxiliary (être vs avoir).",
    "Adjectives usually follow the noun, except short common ones (grand, petit, bon).",
    "Liaisons make you sound fluent: link the final consonant to the next vowel."
  ];
  function localEval(o) {
    var target = o.target || "";
    var user = o.user || "";
    var base;
    if (!target) {
      // No reference to compare against (e.g. free grammar with key absent).
      base = {
        correct: user.trim().length > 0,
        score: user.trim().length > 0 ? 70 : 0,
        corrected: user,
        summary: "Add your Anthropic API key in Settings for word-by-word feedback, alternatives and new vocabulary.",
        rule: ""
      };
    } else {
      var a = clean(target), b = clean(user);
      var dist = lev(a, b);
      var ratio = a.length ? 1 - dist / Math.max(a.length, b.length) : 0;
      var correct = ratio >= 0.86;
      base = {
        correct: correct,
        score: Math.max(0, Math.min(100, Math.round(ratio * 100))),
        corrected: target,
        summary: correct ? "That matches the expected answer."
          : (ratio > 0.6 ? "Close — compare with the correct version below." : "Not quite — see the correct version below."),
        rule: o.rule || ""
      };
    }
    base.errors = [];
    base.alternatives = [];
    base.vocab = [];
    base.tip = TIPS[Math.floor(Math.random() * TIPS.length)];
    base.feedback = base.summary;
    return base;
  }

  /* ---- quick key check used by Settings; returns {ok, error, status} ---- */
  function validateKey() {
    if (!hasKey()) return Promise.resolve({ ok: false, error: "No key set." });
    var schema = { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false };
    return call("Reply via the schema.", "Set ok to true.", schema, 30)
      .then(function () { return { ok: true }; })
      .catch(function (e) { return { ok: false, error: e.message || String(e), status: e.status }; });
  }

  window.AI = {
    hasKey: hasKey,
    generate: generate,
    evaluate: evaluate,
    validateKey: validateKey,
    prewarm: refill
  };
})();
