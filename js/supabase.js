/* supabase.js — optional cross-device sync via Supabase (magic-link auth +
   one jsonb row per user). Offline-first: localStorage stays the local source of
   truth; this just mirrors it to the cloud when you're signed in.
   Exposed globally as `Sync`. Safe no-op if the library/config is unavailable. */
(function () {
  "use strict";

  // Public-by-design values (the anon/publishable key is meant to ship in the
  // browser; Row Level Security is what actually protects your data).
  var CONFIG = {
    url: "https://hmcnmnbytgahqmuvvymj.supabase.co",
    anonKey: "sb_publishable_ESDj1QIVahK6ai73BE3nww_JdJUP_io"
  };
  var TABLE = "app_state";

  var client = null, currentUser = null, pushTimer = null, statusCb = function () {};

  function available() {
    return !!(window.supabase && window.supabase.createClient && CONFIG.url && CONFIG.anonKey);
  }
  function signedIn() { return !!currentUser; }
  function user() { return currentUser; }

  function init(onStatus) {
    statusCb = onStatus || statusCb;
    if (!available()) return false;
    client = window.supabase.createClient(CONFIG.url, CONFIG.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
    client.auth.onAuthStateChange(function (event, session) {
      currentUser = session ? session.user : null;
      statusCb();
      if (event === "SIGNED_IN" && currentUser) pullMergePush();
    });
    if (Store.onSave) Store.onSave(scheduleSync);
    client.auth.getSession().then(function (res) {
      currentUser = (res && res.data && res.data.session) ? res.data.session.user : null;
      statusCb();
      if (currentUser) pullMergePush();
    });
    return true;
  }

  function signIn(email) {
    if (!client) return Promise.reject(new Error("Sync not ready"));
    return client.auth.signInWithOtp({
      email: email,
      options: { emailRedirectTo: location.href.split("#")[0] }
    });
  }
  function signOut() { return client ? client.auth.signOut() : Promise.resolve(); }

  /* ---- the blob we mirror (everything except the regenerable cache) ---- */
  function snapshot() {
    var s = Store.state;
    return { settings: s.settings, progress: s.progress, mistakes: s.mistakes, flashcards: s.flashcards };
  }

  function pull() {
    return client.from(TABLE).select("state,updated_at").eq("user_id", currentUser.id).maybeSingle();
  }
  function push() {
    if (!currentUser) return Promise.resolve();
    return client.from(TABLE).upsert({
      user_id: currentUser.id, state: snapshot(), updated_at: new Date().toISOString()
    });
  }

  function scheduleSync() {
    if (!currentUser) return;
    statusCb("pending");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      push().then(function (r) { statusCb(r && r.error ? "error" : "synced", r && r.error); })
            .catch(function (e) { statusCb("error", e); });
    }, 1800);
  }

  function pullMergePush() {
    statusCb("syncing");
    return pull().then(function (res) {
      if (res.error) throw res.error;
      var remote = res.data && res.data.state;
      if (remote) merge(remote);
      Store.save();                                   // persist merged state locally
      if (window.__parleviteRefresh) window.__parleviteRefresh();
      return push();
    }).then(function (r) {
      statusCb(r && r.error ? "error" : "synced", r && r.error);
    }).catch(function (e) {
      console.warn("sync failed:", e.message || e);
      statusCb("error", e);
    });
  }

  /* ---- merge: union study data, keep the more-urgent item, max the tallies ---- */
  function norm(s) { return (s || "").toString().trim().toLowerCase(); }
  function unionByKey(localArr, remoteArr, keyFn) {
    var map = {};
    (remoteArr || []).forEach(function (it) { map[keyFn(it)] = it; });
    (localArr || []).forEach(function (it) {
      var k = keyFn(it), ex = map[k];
      // smaller `due` = needs practice sooner — bias toward more practice
      map[k] = (!ex || it.due <= ex.due) ? it : ex;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }
  function merge(remote) {
    var s = Store.state;
    s.mistakes = unionByKey(s.mistakes, remote.mistakes, function (m) { return m.mode + "::" + norm(m.prompt); });
    s.flashcards = unionByKey(s.flashcards, remote.flashcards, function (c) { return norm(c.front); });

    var rp = remote.progress || {}, lp = s.progress;
    lp.xp = Math.max(lp.xp || 0, rp.xp || 0);
    if ((rp.lastActiveDay || "") > (lp.lastActiveDay || "")) {
      lp.lastActiveDay = rp.lastActiveDay; lp.streak = rp.streak || lp.streak;
      lp.todayDay = rp.todayDay; lp.todayXp = rp.todayXp || 0;
    } else if ((rp.lastActiveDay || "") === (lp.lastActiveDay || "")) {
      lp.streak = Math.max(lp.streak || 0, rp.streak || 0);
      lp.todayXp = Math.max(lp.todayXp || 0, rp.todayXp || 0);
    }
    var rc = rp.counters || {}, lc = lp.counters || {};
    Object.keys(rc).forEach(function (k) { lc[k] = Math.max(lc[k] || 0, rc[k] || 0); });
    lp.counters = lc;
    var seen = {};
    (lp.badges || []).concat(rp.badges || []).forEach(function (x) { seen[x] = 1; });
    lp.badges = Object.keys(seen);

    var rs = remote.settings || {};
    if (!norm(s.settings.apiKey) && rs.apiKey) s.settings.apiKey = rs.apiKey; // adopt key on a fresh device
  }

  window.Sync = {
    available: available, init: init, signIn: signIn, signOut: signOut,
    signedIn: signedIn, user: user, syncNow: pullMergePush
  };
})();
