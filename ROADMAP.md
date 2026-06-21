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

## Milestone 3 — Reminders & retention
- [ ] Daily check-in reminder via Web Push (needs VAPID keys + a serverless
      push endpoint — does not work fully client-only)
- [ ] Milestone badges (7/14/30/90 days), optionally as NIP-58 badges
- [ ] Supportive "I slipped" reset flow (keep longest streak, reset current)

## Milestone 4 — Flexibility & depth
- [ ] Custom challenge length (Dry January, 90 days, rolling goals)
- [ ] Multi-relay management UI (add/remove/status)
- [ ] Follow / accountability buddies + buddy leaderboard
- [ ] Richer stats (mood/cravings, trend charts, savings goals)
- [ ] Mocktail/recipe sub-feed (`#dryjuly` + `#mocktail`)
- [ ] Data export/import (JSON), QR code for your npub
- [ ] Light mode + theming
