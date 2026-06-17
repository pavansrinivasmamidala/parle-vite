# ParleVite 🇫🇷 — TCF French Practice

A small, snappy web app for practising French for the **TCF exam**, focused on
**active production and speaking**. Everything runs in your browser; your progress,
mistakes and gamification are stored locally. Fresh exercises and personalized
feedback come from **Claude Haiku 4.5** when you add an API key.

## Run it

**Simplest:** double-click **`index.html`** to open it in **Chrome or Edge**. No install, no build.

**If the live AI calls get blocked** when opening via `file://` (some browsers block
network requests from local files), serve the folder over `http://` instead. Pick whichever
you have:

```
# Windows, nothing to install — uses built-in PowerShell:
powershell -ExecutionPolicy Bypass -File serve.ps1 8000      # then open http://localhost:8000

# or, if you have them:
python -m http.server 8000
npx serve
```

The app itself (starter bank, gamification, mistake trainer, speech) works fine from `file://`
either way — only the live Claude calls may need an `http://` origin.

**Speaking** (microphone) and **listening** (text-to-speech) use your browser's built-in
speech engine and work best in **Chrome/Edge**. Where speech recognition isn't available,
the speaking tabs let you type instead.

## Add your AI key (optional but recommended)

1. Get an Anthropic API key: <https://console.anthropic.com/settings/keys>
2. Open the app → **⚙️ Settings** → paste the key → it shows ✓ when it works.

The key is stored **only in your browser** (localStorage) and is sent directly to
Anthropic's API. Without a key, the app runs on its **built-in starter bank** so you can
still practise — you just won't get fresh, unlimited questions or detailed written feedback.

## What's inside

Pick a **level (A1–C2)** and **difficulty (easy/medium/hard)** in the top bar — every tab
uses them.

| Tab | What you do |
|-----|-------------|
| 🏠 **Home** | Daily-goal ring, rank/XP, streak, badges, what's due to review |
| 🔤 **Translate** | Produce French from English — type **or** speak it; get feedback |
| 🎙️ **Speak** | Hear a sentence, repeat it aloud, get accuracy + a speaking tip |
| 🧩 **Build** | Construct sentences (drag-free word chips on *easy*, free text otherwise) |
| ✅ **Grammar** | Fix a flawed sentence; the tutor explains the rule |
| 🃏 **Cards** | Vocabulary flashcards with spaced repetition (Again/Good/Easy) |
| 🎯 **Review** | Every wrong answer comes back here and is drilled until you get it right **twice** |

### How the mistake trainer works
Any answer you get wrong (in any tab) is saved with the tutor's explanation. The **Review**
tab uses a Leitner spaced-repetition schedule to bring it back; once you answer it correctly
twice, it graduates out. That's the "train until correct" loop.

### Gamification
Earn XP (scaled by level + difficulty), keep a daily streak, hit your daily XP goal, climb
the rank ladder (Débutant → … → Maître) and unlock badges.

## Sync across devices (optional)

Your progress is local by default. To carry your XP, streak, mistakes & settings
between devices, sign in under **⚙️ Settings → Sync across devices** with a passwordless
email (magic link). It stays **offline-first**: localStorage is the instant local copy,
the cloud is just a mirror that merges when you sign in.

It's backed by **Supabase** (Postgres + Row Level Security + magic-link auth). One-time setup:

1. **Table** — in the Supabase SQL editor, run:
   ```sql
   create table public.app_state (
     user_id    uuid primary key references auth.users(id) on delete cascade,
     state      jsonb not null,
     updated_at timestamptz not null default now()
   );
   alter table public.app_state enable row level security;
   create policy "own row" on public.app_state
     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
   ```
2. **Auth redirect** — Supabase → Authentication → URL Configuration: set **Site URL** and
   **Redirect URLs** to wherever you run the app (e.g. `http://localhost:8000` and your
   hosted URL). Magic links need an `http(s)` origin, so this won't work from `file://`.
3. **Config** — the project URL + **publishable (anon) key** live at the top of
   [`js/supabase.js`](js/supabase.js). Those are public-by-design; RLS protects the data.

Merge is conflict-safe for studying: the **mistake bank and flashcards are unioned**
(keeping the version that's due sooner), XP/counters take the max, and badges are unioned —
so you never lose a saved mistake when two devices sync.

> Note: with the current "key-in-blob" choice, your Anthropic API key is part of the synced
> state, so it follows you to new devices (stored only in your own RLS-protected row).

## Files

```
index.html      app shell + tab layout
styles.css      theme (light/dark), layout, components
js/store.js     localStorage state (settings, progress, mistakes, cache)
js/data.js      built-in starter bank (offline fallback)
js/srs.js       Leitner spaced-repetition engine
js/game.js      XP, ranks, streak, badges, toasts
js/ai.js        Claude Haiku 4.5 client (generate + evaluate)
js/supabase.js  optional cross-device sync (Supabase magic-link auth)
js/app.js       UI, routing, the six practice modes, speech
serve.ps1       no-install static server for Windows
```

No package manager. Plain HTML/CSS/JS; Supabase loads from a CDN only for sync.

## Reset
**Settings → Reset all progress** clears XP, streak, mistakes and cached exercises
(your API key is kept).
