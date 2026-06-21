# 🌿 Dry July — Roadmap

Live app: https://dryjuly.vercel.app

This file tracks planned work. Nostr-native features are prioritized since they
are the app's core differentiator.

## Milestone 1 — Community interactions ✅ (in progress)
Make the feed two-way instead of a broadcast wall.
- [x] Like posts with `kind 7` reactions (NIP-25), with live counts
- [x] Reply to posts with threaded `kind 1` notes (NIP-10), with counts
- [x] Live subscription that tracks reactions/replies for visible posts
- [x] Self profile: load own `kind 0` (avatar + name) for header/profile
- [x] Draft preservation so incoming feed events don't wipe what you're typing

## Milestone 2 — Zaps ⚡ ✅
Real encouragement with sats — the most nostr-true feature.
- [x] Detect WebLN provider
- [x] Build NIP-57 zap requests
- [x] Resolve recipient LNURL from their `kind 0` (`lud16`/`lud06`)
- [x] Fetch invoice + pay via WebLN
- [x] Show zap totals on feed posts (kind 9735 receipts, sats from bolt11)

## Milestone 3 — Reminders & retention ✅
- [x] Milestone badges (1/3/7/14/21/31/60/90 days) with unlock celebration
- [x] Supportive "I slipped" card (keeps longest streak, encourages a restart)
- [x] Daily reminder toggle (local 8pm nudge while the app is open)
- [~] Full background Web Push is deferred — it needs VAPID keys + a serverless
      push endpoint, so it can't ship in a static client-only PWA.

## Milestone 4 — Flexibility & depth ✅
- [x] Custom challenge (title, start date, length — Dry January, 90 days, etc.)
- [x] Multi-relay management UI (edit list, live reconnect, defaults fallback)
- [x] Follow / accountability buddies + buddy leaderboard (reads public NIP-78)
- [x] Richer stats — 14-day trend sparkline, avg-mood, savings-goal bar
- [x] Per-day mood / craving journaling (synced via NIP-78)
- [x] Mocktail/recipe sub-feed (`#mocktail`, cross-posted with `#dryjuly`)
- [x] Data export/import (JSON merge) + on-device npub QR code
- [x] Light mode + theming

## Later (needs a backend or out of scope)
- [ ] Background Web Push (needs VAPID keys + a serverless push endpoint)
- [ ] NIP-58 badge events for milestones
