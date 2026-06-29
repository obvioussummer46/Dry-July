# 🌿 Dry July

A **nostr-first** Progressive Web App for going alcohol-free in July — and
cheering each other on. No accounts, no servers, no database. Your streak is
your own, stored as [Nostr](https://nostr.com) events and synced across every
device you log in from.

![Built with Nostr](https://img.shields.io/badge/built%20with-Nostr-8e44ad)
![PWA](https://img.shields.io/badge/PWA-installable-4ade80)

## Why nostr-first?

Most habit trackers lock your data inside their servers. Dry July is built the
other way around — **Nostr is the backend**:

| Concern | How Dry July uses Nostr |
| --- | --- |
| **Identity** | You sign in with a Nostr keypair (NIP-07 extension, an existing `nsec`, or a freshly generated key). There is no email/password and no sign-up server. |
| **Your data** | Your dry-day calendar and settings are stored as a replaceable **NIP-78** app-data event (`kind 30078`, `d = dryjuly:v1`). Log in anywhere and your streak follows you. |
| **Community** | Check-ins and encouragement are ordinary `kind 1` notes tagged `#dryjuly`, so they show up in *any* Nostr client too — the feed is the open network, not a walled garden. |
| **Ownership** | Hold your keys, own your progress. Nothing is gated behind this app. |

## Features

- 🔥 **Daily check-in** with an animated streak ring
- ⏪ **Quick-log strip** — catch up yesterday & the last week right from the Today screen
- 🧠 **What's-happening card** — see the benefit your current streak is unlocking
- 💡 **Daily tip** — a fresh practical or educational nudge every day
- 📅 **Calendar** — tap any day to toggle it dry/not-dry
- 🗓️ **Any month, any length** — presets for Dry July, Dry January, Sober October, 30/90 days
- 🏆 **Milestone badges** (1 → 90 days) with unlock celebrations
- 💛 **Supportive slip flow** — a broken streak keeps your best, no shaming
- 📝 **Daily journal** — log mood, cravings & a private note (synced via Nostr)
- 💸 **Live stats** — money saved, calories avoided, 14-day trend, avg mood, savings goal
- 🌐 **Two-way community** — `#dryjuly` feed with likes, threaded replies & zaps
- ⚡ **Lightning zaps** (NIP-57 + WebLN) to cheer people on with sats
- 🍹 **Mocktail sub-feed** — share `#mocktail` recipes & 0% finds
- 👥 **Buddies & leaderboard** — follow friends and compare streaks
- 🎛️ **Make it yours** — custom challenge, editable relays, light/dark theme
- 💾 **Backup** — export/import your data as JSON, share your npub via QR
- 📲 **Installable PWA** — works offline, add it to your home screen
- 🔑 **Bring-your-own-key** — NIP-07, `nsec` import, or generate a new identity
- ☁️ **Cross-device sync** via NIP-78, with local-first offline storage

## Tech

- [Vite](https://vitejs.dev/) + TypeScript (no UI framework — small & fast)
- [`nostr-tools`](https://github.com/nbd-wtf/nostr-tools) for keys, signing & relays
- [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (Workbox) for the manifest & service worker

## Develop

```bash
npm install
npm run gen:icons   # regenerate PWA icons from the logo (one-time / after edits)
npm run dev         # start the dev server (PWA enabled in dev)
npm run build       # type-check + production build to dist/
npm run preview     # preview the production build
```

### Default relays

`relay.damus.io`, `nos.lol`, `relay.nostr.band`, `relay.primal.net`,
`nostr.wine` (see `src/nostr.ts`).

## Privacy & safety

- A generated key is stored **only in this browser's `localStorage`**. Back it
  up from the **Profile** tab (Reveal secret key) — if you lose it, you lose the
  identity.
- When signed in with a NIP-07 extension, your private key never leaves the
  extension.
- Posting to the community publishes a public note to relays — anyone can read it.

---

Made for everyone taking on a dry month. One day at a time. 🌿
