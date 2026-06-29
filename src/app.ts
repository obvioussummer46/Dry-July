import {
  connectExtension,
  createLocalIdentity,
  DRY_JULY_TAG,
  fetchAppDays,
  fetchProfiles,
  hasExtension,
  identityFromSecret,
  pubkeyFromInput,
  hasWebln,
  npub,
  nsec,
  publish,
  react,
  reply,
  setRelays,
  shortNpub,
  subscribeFeed,
  subscribeInteractions,
  zap,
  type FeedItem,
  type Identity
} from "./nostr";
import {
  clearIdentity,
  loadIdentity,
  loadLocalData,
  pushToNostr,
  saveIdentity,
  saveLocalData,
  syncFromNostr,
  type AppData
} from "./store";
import {
  badges,
  challengeGrid,
  computeStats,
  isoDate,
  monthGrid,
  monthStartOffset,
  recentTrend,
  todayIso,
  topBadgeDays
} from "./stats";
import { benefitForStreak, dailyTip } from "./tips";
import { icons, logoSvg } from "./icons";
import QRCode from "qrcode";

type View = "today" | "community" | "profile";

interface State {
  identity: Identity | null;
  data: AppData;
  view: View;
  importing: boolean;
  feed: FeedItem[];
  profiles: Map<string, { name?: string; picture?: string }>;
  feedUnsub: (() => void) | null;
  interactionsUnsub: (() => void) | null;
  reactions: Map<string, Set<string>>;
  replies: Map<string, FeedItem[]>;
  zaps: Map<string, number>;
  zapReceipts: Set<string>;
  expanded: Set<string>;
  openReply: string | null;
  openZap: string | null;
  drafts: Record<string, string>;
  leaderboard: LeaderEntry[];
  leaderboardLoading: boolean;
  feedTag: "dryjuly" | "mocktail";
  revealKey: boolean;
  /** Month currently shown in the Calendar tab (YYYY-MM). */
  calMonth: string;
}

interface LeaderEntry {
  pubkey: string;
  name: string;
  challengeDays: number;
  longestStreak: number;
  isSelf: boolean;
}

const state: State = {
  identity: loadIdentity(),
  data: loadLocalData(),
  view: "today",
  importing: false,
  feed: [],
  profiles: new Map(),
  feedUnsub: null,
  interactionsUnsub: null,
  reactions: new Map(),
  replies: new Map(),
  zaps: new Map(),
  zapReceipts: new Set(),
  expanded: new Set(),
  openReply: null,
  openZap: null,
  drafts: {},
  leaderboard: [],
  leaderboardLoading: false,
  feedTag: "dryjuly",
  revealKey: false,
  calMonth: todayIso().slice(0, 7)
};

let root: HTMLElement;

export function mount(el: HTMLElement) {
  root = el;
  root.addEventListener("click", onClick);
  // Preserve text-field contents across re-renders.
  root.addEventListener("input", (e) => {
    const el = e.target as HTMLElement;
    if (el.id && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)) {
      state.drafts[el.id] = el.value;
    }
  });
  applySettings();
  render();
  if (state.identity) {
    backgroundSync();
    loadSelfProfile();
    scheduleReminder();
  }
}

/** Apply persisted settings that affect global state (theme + relays). */
function applySettings() {
  const s = state.data.settings;
  document.documentElement.dataset.theme = s.theme;
  setRelays(s.relays);
}

/** Best-effort daily reminder while the app is open (full background push
 *  notifications require a server — see ROADMAP). */
let reminderTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleReminder() {
  if (reminderTimer) {
    clearTimeout(reminderTimer);
    reminderTimer = null;
  }
  if (!state.data.settings.reminders) return;
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const now = new Date();
  const target = new Date();
  target.setHours(20, 0, 0, 0); // 8pm local
  if (target <= now) target.setDate(target.getDate() + 1);

  reminderTimer = setTimeout(() => {
    if (!state.data.days.includes(todayIso())) {
      new Notification("Dry July 🌿", {
        body: "Have you stayed dry today? Tap to log your day.",
        icon: "./icons/icon-192.png"
      });
    }
    scheduleReminder(); // re-arm for the next day
  }, target.getTime() - now.getTime());
}

/* ---------------- Helpers ---------------- */

function toast(msg: string) {
  let t = document.querySelector<HTMLDivElement>(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  requestAnimationFrame(() => t!.classList.add("show"));
  clearTimeout((t as any)._timer);
  (t as any)._timer = setTimeout(() => t!.classList.remove("show"), 2200);
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[c]!
  );
}

function val(sel: string): string {
  const el = root.querySelector<HTMLInputElement>(sel);
  return el ? el.value : "";
}

function timeAgo(sec: number): string {
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function displayName(): string {
  const n = state.data.settings.displayName.trim();
  if (n) return n;
  const self = state.identity && state.profiles.get(state.identity.pubkey);
  if (self?.name) return self.name;
  return state.identity ? shortNpub(state.identity.pubkey) : "anon";
}

/** Avatar markup for a given pubkey (picture if known, else initial). */
function avatar(pubkey: string, name: string): string {
  const prof = state.profiles.get(pubkey);
  if (prof?.picture) return `<img src="${esc(prof.picture)}" alt="" />`;
  return esc((name[0] || "?").toUpperCase());
}

async function loadSelfProfile() {
  if (!state.identity) return;
  const fetched = await fetchProfiles([state.identity.pubkey]);
  if (fetched.size) {
    fetched.forEach((v, k) => state.profiles.set(k, v));
    render();
  }
}

async function persist({ push = true }: { push?: boolean } = {}) {
  state.data.updatedAt = Date.now();
  saveLocalData(state.data);
  if (push && state.identity) {
    pushToNostr(state.identity, state.data).catch(() => {
      /* offline is fine — data is saved locally */
    });
  }
}

async function backgroundSync() {
  if (!state.identity) return;
  const merged = await syncFromNostr(state.identity, state.data);
  state.data = merged;
  render();
}

/* ---------------- Rendering ---------------- */

function render() {
  if (!state.identity) {
    root.innerHTML = renderOnboard();
    restoreDrafts();
    return;
  }
  root.innerHTML = `
    ${renderHeader()}
    <div class="screen">${renderView()}</div>
    ${renderTabbar()}
  `;
  restoreDrafts();
}

/** Re-apply saved text-field drafts after a re-render. */
function restoreDrafts() {
  for (const [id, value] of Object.entries(state.drafts)) {
    const el = root.querySelector<HTMLInputElement>(`#${CSS.escape(id)}`);
    if (el && el.value !== value) el.value = value;
  }
}

let renderTimer: ReturnType<typeof setTimeout> | null = null;
/** Debounced render for high-frequency relay events. */
function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    render();
  }, 250);
}

function renderHeader(): string {
  return `
    <header class="app-head screen" style="padding-bottom:0;flex:0;">
      <div class="brand">
        ${logoSvg}
        <div>Dry July<small>Nostr edition</small></div>
      </div>
      <span class="pill">${esc(displayName())}</span>
    </header>
  `;
}

function renderView(): string {
  switch (state.view) {
    case "today":
      return renderToday();
    case "community":
      return renderCommunity();
    case "profile":
      return renderProfile();
  }
}

function renderTabbar(): string {
  const tab = (id: View, label: string, icon: string) => `
    <button data-tab="${id}" class="${state.view === id ? "active" : ""}">
      ${icon}<span>${label}</span>
    </button>`;
  return `
    <nav class="tabbar">
      ${tab("today", "Today", icons.today)}
      ${tab("community", "Community", icons.community)}
      ${tab("profile", "Profile", icons.profile)}
    </nav>`;
}

/* ---- Onboarding ---- */

function renderOnboard(): string {
  const ext = hasExtension();
  return `
    <div class="onboard">
      <div class="logo-xl">${logoSvg.replace('class="logo"', "")}</div>
      <h1>Dry July</h1>
      <p class="tagline">
        Go alcohol-free for a month — any month — and cheer each other on.<br/>
        Your streak lives on <strong>Nostr</strong> — yours to keep, anywhere.
      </p>
      <div class="actions">
        ${
          ext
            ? `<button class="btn" data-action="connect-extension">${icons.bolt} Connect Nostr extension</button>`
            : `<button class="btn ghost" disabled>No browser extension detected</button>`
        }
        <button class="btn secondary" data-action="generate-key">Create a new Nostr key</button>
        <div class="divider">— or —</div>
        <button class="btn ghost" data-action="toggle-import">
          ${state.importing ? "Cancel" : "Use an existing key (nsec)"}
        </button>
        ${
          state.importing
            ? `<label class="field">
                 <span>Paste your nsec or hex private key</span>
                 <input id="import-key" type="password" placeholder="nsec1…" autocomplete="off" />
               </label>
               <button class="btn" data-action="import-key">Log in</button>`
            : ""
        }
      </div>
      <p class="note" style="margin-top:22px;">
        New keys are generated and stored <strong>only on this device</strong>.
        Back up your secret key from the Profile tab once you're in.
      </p>
    </div>`;
}

/* ---- Today ---- */

function renderToday(): string {
  const stats = computeStats(state.data);
  const checkedToday = state.data.days.includes(todayIso());
  const len = stats.challengeLength || 31;
  const pct = Math.min(100, (stats.challengeDays / len) * 100);
  const { currency } = state.data.settings;
  const title = state.data.challenge.title;

  // Supportive nudge when a streak has just been broken.
  const slipCard =
    !checkedToday && stats.currentStreak === 0 && stats.total > 0
      ? `<div class="card slip">
           <h2>One day at a time 💛</h2>
           <p class="note" style="margin:0">
             A slip isn't a failure — it's part of the journey. Your best streak of
             <strong>${stats.longestStreak} ${stats.longestStreak === 1 ? "day" : "days"}</strong>
             still counts. Log today and start a fresh one.
           </p>
         </div>`
      : "";

  return `
    <div class="card hero" style="--pct:${pct}%">
      <div class="ring">
        <div>
          <div class="num">${stats.currentStreak}</div>
          <div class="lbl">day streak</div>
        </div>
      </div>
      <p class="sub" style="margin-bottom:0">
        ${
          checkedToday
            ? "Nice — today is logged alcohol-free 🌿"
            : "Tap today in the calendar below to log your dry day 👇"
        }
      </p>
    </div>

    ${slipCard}

    ${renderCalendarCard()}

    ${renderBenefitCard(stats)}

    ${renderTipCard()}

    <div class="stats">
      <div class="stat green"><div class="v">${stats.challengeDays}<span class="muted" style="font-size:15px">/${len}</span></div><div class="k">${esc(title)} days</div></div>
      <div class="stat gold"><div class="v">${stats.longestStreak}</div><div class="k">Longest streak</div></div>
      <div class="stat blue"><div class="v">${currency}${stats.moneySaved.toLocaleString()}</div><div class="k">Money saved</div></div>
      <div class="stat"><div class="v">${stats.caloriesSaved.toLocaleString()}</div><div class="k">Calories avoided</div></div>
    </div>

    <div class="card">
      <h2>Milestones</h2>
      <div class="badges">
        ${badges(stats)
          .map(
            (b) => `<div class="badge ${b.earned ? "earned" : ""}" title="${b.label}">
                      <div class="ic">${b.icon}</div>
                      <div class="bd">${b.days}d</div>
                    </div>`
          )
          .join("")}
      </div>
    </div>

    ${renderTrendCard(stats)}

    ${renderJournalCard()}

    <div class="card">
      <h2>Share your win</h2>
      <p class="note" style="margin-top:0">Post an update to the #dryjuly community on Nostr.</p>
      <textarea id="share-text" rows="2" placeholder="Day ${stats.currentStreak} and feeling great…"></textarea>
      <button class="btn secondary" data-action="share-checkin" style="margin-top:10px">Post to community</button>
    </div>`;
}

/** A short "what's happening in your body" note tied to the current streak. */
function renderBenefitCard(stats: ReturnType<typeof computeStats>): string {
  const b = benefitForStreak(stats.currentStreak);
  return `
    <div class="card benefit">
      <h2>Your body right now</h2>
      <div class="benefit-row">
        <div class="benefit-ic">${b.icon}</div>
        <div>
          <div class="benefit-title">${b.title}</div>
          <p class="note" style="margin:4px 0 0">${b.body}</p>
        </div>
      </div>
    </div>`;
}

/** A rotating daily tip — something new to read each day. */
function renderTipCard(): string {
  return `
    <div class="card tip">
      <div class="tip-ic">💡</div>
      <p>${esc(dailyTip(todayIso()))}</p>
    </div>`;
}

const MOODS = ["😣", "😕", "😐", "🙂", "😄"];

function renderJournalCard(): string {
  const today = todayIso();
  const entry = state.data.journal[today] ?? {};
  const moodBtns = MOODS.map(
    (emoji, i) =>
      `<button class="mood ${entry.mood === i + 1 ? "sel" : ""}" data-action="set-mood" data-val="${i + 1}">${emoji}</button>`
  ).join("");
  const cravingDots = [1, 2, 3, 4, 5]
    .map(
      (n) =>
        `<button class="dot ${entry.craving && entry.craving >= n ? "on" : ""}" data-action="set-craving" data-val="${n}" aria-label="craving ${n}"></button>`
    )
    .join("");

  return `
    <div class="card">
      <h2>How was today?</h2>
      <p class="note" style="margin-top:0">Mood</p>
      <div class="mood-row">${moodBtns}</div>
      <div class="flex-between" style="margin-top:14px">
        <p class="note" style="margin:0">Cravings</p>
        <div class="dot-row">${cravingDots}</div>
      </div>
      <label class="field" style="margin-top:14px">
        <span>Note (private, syncs to your Nostr account)</span>
        <textarea id="journal-note" rows="2" placeholder="A win, a trigger, a thought…">${esc(entry.note ?? "")}</textarea>
      </label>
      <button class="btn secondary" data-action="save-journal">Save note</button>
    </div>`;
}

/* ---- Calendar ---- */

function renderCalendarCard(): string {
  const [cy, cm] = state.calMonth.split("-").map(Number);
  const year = cy;
  const month0 = cm - 1;
  const grid = monthGrid(year, month0);
  const offset = monthStartOffset(year, month0);
  const set = new Set(state.data.days);
  // Days that fall inside the active challenge window get a subtle marker.
  const challengeSet = new Set(challengeGrid(state.data.challenge).map((c) => c.iso));
  const today = todayIso();
  const dows = ["M", "T", "W", "T", "F", "S", "S"];

  const spacers = Array.from(
    { length: offset },
    () => `<div class="cell spacer"></div>`
  ).join("");

  const cells = grid
    .map((c) => {
      const on = set.has(c.iso);
      const isToday = c.iso === today;
      const future = c.iso > today;
      const cls = ["cell"];
      if (on) cls.push("on");
      if (isToday) cls.push("today");
      if (future) cls.push("future");
      if (challengeSet.has(c.iso)) cls.push("inch");
      const action = future ? "" : `data-action="toggle-day" data-day="${c.iso}"`;
      return `<div class="${cls.join(" ")}" ${action}>${c.dom}</div>`;
    })
    .join("");

  const label = new Date(year, month0, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });
  const challenge = state.data.challenge;
  const stats = computeStats(state.data);
  const viewingChallenge = state.calMonth === challenge.start.slice(0, 7);

  return `
    <div class="card">
      <div class="cal-head">
        <button class="cal-nav" data-action="cal-prev" aria-label="Previous month">‹</button>
        <div class="cal-title">${esc(label)}</div>
        <button class="cal-nav" data-action="cal-next" aria-label="Next month">›</button>
      </div>
      <div class="cal">
        ${dows.map((d) => `<div class="dow">${d}</div>`).join("")}
        ${spacers}${cells}
      </div>
      <div class="flex-between" style="margin-top:14px">
        <span class="pill ${viewingChallenge ? "" : "tap"}" ${
          viewingChallenge ? "" : `data-action="cal-challenge"`
        }>
          ${esc(challenge.title)} · ${stats.challengeDays}/${stats.challengeLength}${
            viewingChallenge ? "" : " ›"
          }
        </span>
        <span class="note" style="margin:0">${
          state.calMonth === today.slice(0, 7)
            ? "tap a day to log it"
            : `<button class="linklike" data-action="cal-today">Back to this month</button>`
        }</span>
      </div>
      <p class="note" style="margin:10px 0 0">
        Tap any day up to today — today included — to log it. Dots mark your
        <strong>${esc(challenge.title)}</strong> days. Synced via Nostr.
      </p>
    </div>`;
}

/** Shift the Calendar by whole months. */
function shiftCalMonth(delta: number) {
  const [y, m] = state.calMonth.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  render();
}

function renderTrendCard(stats: ReturnType<typeof computeStats>): string {
  const trend = recentTrend(state.data.days, 14);
  const bars = trend
    .map(
      (d) =>
        `<div class="trend-bar ${d.on ? "on" : ""}" title="${d.iso}${d.on ? " · dry" : ""}"></div>`
    )
    .join("");

  const { savingsGoal, currency } = state.data.settings;
  const goalCard =
    savingsGoal > 0
      ? (() => {
          const pct = Math.min(100, (stats.moneySaved / savingsGoal) * 100);
          return `
            <div style="margin-top:16px">
              <div class="flex-between" style="margin-bottom:6px">
                <span class="note" style="margin:0">Savings goal</span>
                <span class="note" style="margin:0">${currency}${stats.moneySaved.toLocaleString()} / ${currency}${savingsGoal.toLocaleString()}</span>
              </div>
              <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
            </div>`;
        })()
      : "";

  // Average mood across the last 14 logged reflections.
  const moods = trend
    .map((d) => state.data.journal[d.iso]?.mood)
    .filter((m): m is number => typeof m === "number");
  const avgMood = moods.length
    ? MOODS[Math.round(moods.reduce((a, b) => a + b, 0) / moods.length) - 1]
    : "";
  const moodLine = moods.length
    ? `<div class="flex-between" style="margin-top:14px">
         <span class="note" style="margin:0">Avg mood (2 wks)</span>
         <span style="font-size:20px">${avgMood}</span>
       </div>`
    : "";

  return `
    <div class="card">
      <h2>Last 14 days</h2>
      <div class="trend">${bars}</div>
      ${moodLine}
      ${goalCard}
    </div>`;
}

/* ---- Community ---- */

function renderCommunity(): string {
  const tag = state.feedTag;
  const items = state.feed
    .slice()
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 50);

  const list =
    items.length === 0
      ? `<div class="center" style="padding:30px 0">
           <div class="spinner"></div>
           <p class="muted">Listening for #${tag} posts on Nostr…</p>
         </div>`
      : items.map(renderFeedItem).join("");

  const seg = `
    <div class="segment">
      <button data-action="feed-tag" data-tag="dryjuly" class="${tag === "dryjuly" ? "active" : ""}">🌿 #dryjuly</button>
      <button data-action="feed-tag" data-tag="mocktail" class="${tag === "mocktail" ? "active" : ""}">🍹 #mocktail</button>
    </div>`;

  const placeholder =
    tag === "mocktail"
      ? "Share a mocktail recipe or a 0% find…"
      : "Share encouragement, a milestone, a tip…";

  return `
    ${seg}
    <div class="card">
      <h2>${tag === "mocktail" ? "Share a mocktail" : "Cheer the crew on"}</h2>
      <textarea id="community-text" rows="3" placeholder="${placeholder}"></textarea>
      <button class="btn" data-action="post-message" style="margin-top:10px">Post to #${tag}</button>
    </div>
    <div class="card">
      <h2>Live feed</h2>
      ${list}
    </div>`;
}

function renderFeedItem(item: FeedItem): string {
  const name = state.profiles.get(item.pubkey)?.name || shortNpub(item.pubkey);
  const likes = state.reactions.get(item.id) ?? new Set();
  const liked = !!state.identity && likes.has(state.identity.pubkey);
  const threadReplies = (state.replies.get(item.id) ?? [])
    .slice()
    .sort((a, b) => a.created_at - b.created_at);
  const showReplies = state.expanded.has(item.id);
  const composerOpen = state.openReply === item.id;
  const zapOpen = state.openZap === item.id;
  const sats = state.zaps.get(item.id) ?? 0;

  return `
    <div class="feed-item">
      <div class="avatar">${avatar(item.pubkey, name)}</div>
      <div class="body">
        <div><span class="who">${esc(name)}</span><span class="when">${timeAgo(item.created_at)}</span></div>
        <p class="txt">${esc(item.content)}</p>
        <div class="actions-row">
          <button class="act ${liked ? "liked" : ""}" data-action="like" data-id="${item.id}" data-pubkey="${item.pubkey}">
            ♥ <span>${likes.size || ""}</span>
          </button>
          <button class="act" data-action="toggle-reply" data-id="${item.id}">
            💬 <span>reply</span>
          </button>
          <button class="act ${sats ? "zapped" : ""}" data-action="toggle-zap" data-id="${item.id}">
            ⚡ <span>${sats ? sats.toLocaleString() : "zap"}</span>
          </button>
          ${
            threadReplies.length
              ? `<button class="act" data-action="toggle-replies" data-id="${item.id}">
                   ${showReplies ? "hide" : "view"} ${threadReplies.length} ${threadReplies.length === 1 ? "reply" : "replies"}
                 </button>`
              : ""
          }
        </div>
        ${
          zapOpen
            ? `<div class="zap-box">
                 ${[21, 100, 500, 2100]
                   .map(
                     (a) =>
                       `<button class="zap-amt" data-action="zap-send" data-id="${item.id}" data-pubkey="${item.pubkey}" data-sats="${a}">⚡ ${a}</button>`
                   )
                   .join("")}
               </div>`
            : ""
        }
        ${
          composerOpen
            ? `<div class="reply-box">
                 <textarea id="reply-${item.id}" rows="2" placeholder="Write a reply…"></textarea>
                 <button class="btn secondary" data-action="send-reply" data-id="${item.id}" data-pubkey="${item.pubkey}" style="margin-top:8px">Reply</button>
               </div>`
            : ""
        }
        ${
          showReplies && threadReplies.length
            ? `<div class="thread">${threadReplies.map(renderReply).join("")}</div>`
            : ""
        }
      </div>
    </div>`;
}

function renderReply(item: FeedItem): string {
  const name = state.profiles.get(item.pubkey)?.name || shortNpub(item.pubkey);
  return `
    <div class="feed-item reply">
      <div class="avatar sm">${avatar(item.pubkey, name)}</div>
      <div class="body">
        <div><span class="who">${esc(name)}</span><span class="when">${timeAgo(item.created_at)}</span></div>
        <p class="txt">${esc(item.content)}</p>
      </div>
    </div>`;
}

/* ---- Profile ---- */

function renderLeaderboard(): string {
  const buddies = state.data.settings.buddies;
  const refresh = `<button class="btn ghost" data-action="refresh-leaderboard" style="margin-top:10px">
      ${state.leaderboardLoading ? "Loading…" : "Refresh leaderboard"}
    </button>`;

  if (buddies.length === 0) {
    return `<p class="note" style="margin-bottom:0">No buddies yet — add one above.</p>`;
  }

  const rows =
    state.leaderboard.length === 0
      ? `<p class="note">Tap refresh to load the leaderboard.</p>`
      : `<div class="leaderboard">
           ${state.leaderboard
             .map(
               (e, i) => `
               <div class="lb-row ${e.isSelf ? "self" : ""}">
                 <span class="lb-rank">${i + 1}</span>
                 <span class="lb-name">${esc(e.name)}${e.isSelf ? " (you)" : ""}</span>
                 <span class="lb-val">${e.challengeDays}d · 🔥${e.longestStreak}</span>
               </div>`
             )
             .join("")}
         </div>`;

  const list = `<div class="buddy-list">
      ${buddies
        .map(
          (p) => `<div class="buddy-chip">
                    ${esc(state.profiles.get(p)?.name || shortNpub(p))}
                    <button data-action="remove-buddy" data-pubkey="${p}" aria-label="remove">×</button>
                  </div>`
        )
        .join("")}
    </div>`;

  return `${list}${refresh}${rows}`;
}

function renderProfile(): string {
  const id = state.identity!;
  const s = state.data.settings;
  const c = state.data.challenge;
  const stats = computeStats(state.data);
  return `
    <div class="card center">
      <div class="avatar" style="width:64px;height:64px;margin:0 auto 10px;font-size:26px">
        ${esc((displayName()[0] || "?").toUpperCase())}
      </div>
      <div style="font-weight:800;font-size:18px">${esc(displayName())}</div>
      <div class="code" style="margin-top:10px">${esc(npub(id.pubkey))}</div>
      <button class="btn ghost" data-action="copy-npub" style="margin-top:10px">Copy public key (npub)</button>
    </div>

    <div class="card">
      <h2>My numbers</h2>
      <div class="stats">
        <div class="stat green"><div class="v">${stats.total}</div><div class="k">Dry days</div></div>
        <div class="stat gold"><div class="v">${stats.longestStreak}</div><div class="k">Best streak</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Personalize</h2>
      <label class="field">
        <span>Display name</span>
        <input id="set-name" value="${esc(s.displayName)}" placeholder="optional" />
      </label>
      <div class="row">
        <label class="field">
          <span>Drinks/day (before)</span>
          <input id="set-drinks" type="number" min="0" step="1" value="${s.drinksPerDay}" />
        </label>
        <label class="field">
          <span>Cost per drink</span>
          <input id="set-cost" type="number" min="0" step="0.5" value="${s.costPerDrink}" />
        </label>
      </div>
      <div class="row">
        <label class="field">
          <span>Currency symbol</span>
          <input id="set-currency" value="${esc(s.currency)}" maxlength="3" />
        </label>
        <label class="field">
          <span>Calories per drink</span>
          <input id="set-cal" type="number" min="0" step="10" value="${s.caloriesPerDrink}" />
        </label>
      </div>
      <label class="field">
        <span>Savings goal (${esc(s.currency)}, 0 = none)</span>
        <input id="set-goal" type="number" min="0" step="10" value="${s.savingsGoal}" />
      </label>
      <button class="btn" data-action="save-settings">Save</button>
    </div>

    <div class="card">
      <h2>Challenge</h2>
      <p class="note" style="margin-top:0">Any month, any length — pick a preset or set your own.</p>
      <div class="presets">
        <button class="chip" data-action="preset-challenge" data-preset="july">Dry July</button>
        <button class="chip" data-action="preset-challenge" data-preset="january">Dry January</button>
        <button class="chip" data-action="preset-challenge" data-preset="october">Sober October</button>
        <button class="chip" data-action="preset-challenge" data-preset="30">30 days</button>
        <button class="chip" data-action="preset-challenge" data-preset="90">90 days</button>
      </div>
      <label class="field">
        <span>Title</span>
        <input id="set-ch-title" value="${esc(c.title)}" placeholder="Dry July" />
      </label>
      <div class="row">
        <label class="field">
          <span>Start date</span>
          <input id="set-ch-start" type="date" value="${esc(c.start)}" />
        </label>
        <label class="field">
          <span>Length (days)</span>
          <input id="set-ch-length" type="number" min="1" max="366" value="${c.length}" />
        </label>
      </div>
      <button class="btn" data-action="save-challenge">Save challenge</button>
    </div>

    <div class="card">
      <h2>Reminders</h2>
      <div class="flex-between">
        <p class="note" style="margin:0;flex:1">
          A daily 8pm nudge to log your day.
          <br/><span class="muted">Fires while the app is open; full background push needs a server.</span>
        </p>
        <button class="btn ${s.reminders ? "done" : "secondary"}" data-action="toggle-reminders" style="width:auto;padding:10px 16px">
          ${s.reminders ? "On" : "Off"}
        </button>
      </div>
    </div>

    <div class="card">
      <h2>Buddies & leaderboard</h2>
      <p class="note" style="margin-top:0">Follow friends by npub and compare streaks. Reads their public progress from Nostr.</p>
      <label class="field">
        <span>Add a buddy (npub or hex)</span>
        <input id="buddy-npub" placeholder="npub1…" autocomplete="off" />
      </label>
      <button class="btn secondary" data-action="add-buddy">Add buddy</button>
      ${renderLeaderboard()}
    </div>

    <div class="card">
      <h2>Appearance</h2>
      <div class="flex-between">
        <p class="note" style="margin:0">Theme</p>
        <button class="btn secondary" data-action="toggle-theme" style="width:auto;padding:10px 16px">
          ${s.theme === "dark" ? "🌙 Dark" : "☀️ Light"}
        </button>
      </div>
    </div>

    <div class="card">
      <h2>Relays</h2>
      <p class="note" style="margin-top:0">One relay URL per line. Leave empty to use the defaults.</p>
      <textarea id="set-relays" rows="4" placeholder="wss://relay.damus.io">${esc(
        s.relays.join("\n")
      )}</textarea>
      <button class="btn" data-action="save-relays" style="margin-top:10px">Save relays</button>
    </div>

    <div class="card">
      <h2>Your data</h2>
      <button class="btn secondary" data-action="export-data">Export backup (JSON)</button>
      <label class="field" style="margin-top:12px">
        <span>Import backup (paste JSON)</span>
        <textarea id="import-data" rows="3" placeholder='{"days":[…]}'></textarea>
      </label>
      <button class="btn ghost" data-action="import-data">Import & merge</button>
      <button class="btn ghost" data-action="show-qr" style="margin-top:10px">Copy npub for sharing</button>
    </div>

    <div class="card">
      <h2>Account & backup</h2>
      <button class="btn secondary" data-action="manual-sync">Sync with Nostr now</button>
      ${
        id.kind === "local"
          ? `<div style="margin-top:10px">
               ${
                 state.revealKey
                   ? `<div class="code">${esc(nsec(id.secret))}</div>
                      <button class="btn ghost" data-action="copy-nsec" style="margin-top:8px">Copy secret key</button>`
                   : `<button class="btn ghost" data-action="reveal-key">Reveal secret key (nsec)</button>`
               }
               <p class="note">Anyone with this key controls your identity. Store it somewhere safe.</p>
             </div>`
          : `<p class="note" style="margin-top:10px">Signed in with a Nostr extension — your key stays in the extension.</p>`
      }
      <button class="btn danger" data-action="logout" style="margin-top:10px">Log out</button>
    </div>`;
}

/* ---------------- Events ---------------- */

async function onClick(e: MouseEvent) {
  const target = (e.target as HTMLElement).closest<HTMLElement>(
    "[data-action],[data-tab]"
  );
  if (!target) return;

  const tab = target.dataset.tab as View | undefined;
  if (tab) {
    switchView(tab);
    return;
  }

  const action = target.dataset.action!;
  switch (action) {
    case "connect-extension":
      await login(() => connectExtension());
      break;
    case "generate-key":
      await login(() => Promise.resolve(createLocalIdentity()), true);
      break;
    case "toggle-import":
      state.importing = !state.importing;
      render();
      break;
    case "import-key":
      try {
        const key = val("#import-key");
        await login(() => Promise.resolve(identityFromSecret(key)));
      } catch (err) {
        toast((err as Error).message);
      }
      break;
    case "set-mood":
      setJournalField("mood", Number(target.dataset.val));
      break;
    case "set-craving":
      setJournalField("craving", Number(target.dataset.val));
      break;
    case "save-journal":
      saveJournalNote();
      break;
    case "toggle-day":
      toggleDay(target.dataset.day!);
      break;
    case "cal-prev":
      shiftCalMonth(-1);
      break;
    case "cal-next":
      shiftCalMonth(1);
      break;
    case "cal-today":
      state.calMonth = todayIso().slice(0, 7);
      render();
      break;
    case "cal-challenge":
      state.calMonth = state.data.challenge.start.slice(0, 7);
      render();
      break;
    case "share-checkin":
      await postNote(val("#share-text"), true);
      break;
    case "post-message":
      await postNote(val("#community-text"), false);
      break;
    case "feed-tag":
      setFeedTag(target.dataset.tag as "dryjuly" | "mocktail");
      break;
    case "like":
      await likePost(target.dataset.id!, target.dataset.pubkey!);
      break;
    case "toggle-reply":
      state.openReply = state.openReply === target.dataset.id ? null : target.dataset.id!;
      render();
      break;
    case "send-reply":
      await sendReply(target.dataset.id!, target.dataset.pubkey!);
      break;
    case "toggle-replies": {
      const id = target.dataset.id!;
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      render();
      break;
    }
    case "toggle-zap":
      if (!hasWebln()) {
        toast("Install a Lightning (WebLN) wallet to zap");
        break;
      }
      state.openZap = state.openZap === target.dataset.id ? null : target.dataset.id!;
      render();
      break;
    case "zap-send":
      await zapPost(
        target.dataset.id!,
        target.dataset.pubkey!,
        Number(target.dataset.sats)
      );
      break;
    case "save-settings":
      saveSettings();
      break;
    case "save-challenge":
      saveChallenge();
      break;
    case "preset-challenge":
      applyChallengePreset(target.dataset.preset!);
      break;
    case "toggle-reminders":
      await toggleReminders();
      break;
    case "toggle-theme":
      state.data.settings.theme = state.data.settings.theme === "dark" ? "light" : "dark";
      applySettings();
      persist();
      render();
      break;
    case "save-relays":
      saveRelays();
      break;
    case "add-buddy":
      addBuddy(val("#buddy-npub"));
      break;
    case "remove-buddy":
      removeBuddy(target.dataset.pubkey!);
      break;
    case "refresh-leaderboard":
      await refreshLeaderboard();
      break;
    case "export-data":
      exportData();
      break;
    case "import-data":
      importData(val("#import-data"));
      break;
    case "show-qr":
      await showQr();
      break;
    case "copy-npub":
      copy(npub(state.identity!.pubkey), "Public key copied");
      break;
    case "reveal-key":
      state.revealKey = true;
      render();
      break;
    case "copy-nsec":
      if (state.identity?.kind === "local")
        copy(nsec(state.identity.secret), "Secret key copied — keep it safe");
      break;
    case "manual-sync":
      toast("Syncing…");
      await backgroundSync();
      toast("Synced with Nostr");
      break;
    case "logout":
      if (confirm("Log out? Make sure you've backed up your secret key.")) {
        clearIdentity();
        state.identity = null;
        state.data = loadLocalData();
        state.feedUnsub?.();
        state.interactionsUnsub?.();
        state.feedUnsub = null;
        state.interactionsUnsub = null;
        state.feed = [];
        state.reactions.clear();
        state.replies.clear();
        state.zaps.clear();
        state.zapReceipts.clear();
        state.expanded.clear();
        state.openReply = null;
        state.openZap = null;
        render();
      }
      break;
  }
}

function switchView(view: View) {
  state.view = view;
  render();
  if (view === "community" && !state.feedUnsub) startFeed();
}

async function login(
  fn: () => Promise<Identity>,
  isNew = false
) {
  try {
    const identity = await fn();
    state.identity = identity;
    saveIdentity(identity);
    state.data = loadLocalData();
    render();
    toast(isNew ? "New Nostr key created 🎉" : "Welcome back");
    backgroundSync();
    loadSelfProfile();
  } catch (err) {
    toast((err as Error).message || "Could not log in");
  }
}

function toggleDay(iso: string) {
  const idx = state.data.days.indexOf(iso);
  if (idx >= 0) {
    state.data.days.splice(idx, 1);
  } else {
    state.data.days.push(iso);
    state.data.days.sort();
    if (iso === todayIso()) toast("Logged. Keep it up! 🌿");
  }
  celebrateBadges();
  persist();
  render();
}

function setJournalField(field: "mood" | "craving", value: number) {
  const today = todayIso();
  const entry = { ...(state.data.journal[today] ?? {}) };
  // Tapping the active value again clears it.
  entry[field] = entry[field] === value ? undefined : value;
  entry.updatedAt = Date.now();
  state.data.journal[today] = entry;
  persist();
  render();
}

function saveJournalNote() {
  const today = todayIso();
  const note = val("#journal-note").trim();
  const entry = { ...(state.data.journal[today] ?? {}) };
  entry.note = note || undefined;
  entry.updatedAt = Date.now();
  state.data.journal[today] = entry;
  delete state.drafts["journal-note"];
  persist();
  render();
  toast("Saved");
}

/** Toast + remember when the user crosses a new milestone badge. */
function celebrateBadges() {
  const stats = computeStats(state.data);
  const top = topBadgeDays(stats);
  if (top > state.data.settings.lastBadgeSeen) {
    state.data.settings.lastBadgeSeen = top;
    const badge = badges(stats).find((b) => b.days === top);
    if (badge) toast(`${badge.icon} Milestone unlocked: ${badge.label}!`);
  }
}

function saveSettings() {
  const s = state.data.settings;
  s.displayName = val("#set-name").trim();
  s.drinksPerDay = Math.max(0, Number(val("#set-drinks")) || 0);
  s.costPerDrink = Math.max(0, Number(val("#set-cost")) || 0);
  s.currency = val("#set-currency").trim() || "$";
  s.caloriesPerDrink = Math.max(0, Number(val("#set-cal")) || 0);
  s.savingsGoal = Math.max(0, Number(val("#set-goal")) || 0);
  persist();
  render();
  toast("Saved");
}

function saveChallenge() {
  const c = state.data.challenge;
  c.title = val("#set-ch-title").trim() || "Dry July";
  const start = val("#set-ch-start").trim();
  if (start) c.start = start;
  c.length = Math.min(366, Math.max(1, Number(val("#set-ch-length")) || 31));
  persist();
  render();
  toast("Challenge updated");
}

/** The next occurrence (this year or next) of the 1st of a given month. */
function nextMonthStart(month0: number): string {
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let year = now.getFullYear();
  if (new Date(year, month0, 1) < todayMidnight) year += 1;
  return isoDate(new Date(year, month0, 1));
}

/** One-tap challenge presets so it's clearly not a July-only app. */
function applyChallengePreset(preset: string) {
  const c = state.data.challenge;
  switch (preset) {
    case "july":
      c.title = "Dry July";
      c.start = nextMonthStart(6);
      c.length = 31;
      break;
    case "january":
      c.title = "Dry January";
      c.start = nextMonthStart(0);
      c.length = 31;
      break;
    case "october":
      c.title = "Sober October";
      c.start = nextMonthStart(9);
      c.length = 31;
      break;
    case "30":
      c.title = "30 Days Dry";
      c.start = todayIso();
      c.length = 30;
      break;
    case "90":
      c.title = "90 Days Dry";
      c.start = todayIso();
      c.length = 90;
      break;
    default:
      return;
  }
  persist();
  render();
  toast(`Challenge set: ${c.title}`);
}

async function toggleReminders() {
  const s = state.data.settings;
  if (!s.reminders) {
    if (typeof Notification === "undefined") {
      toast("Notifications aren't supported here");
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      toast("Notification permission denied");
      return;
    }
    s.reminders = true;
    toast("Daily reminders on 🔔");
  } else {
    s.reminders = false;
    toast("Reminders off");
  }
  persist();
  scheduleReminder();
  render();
}

function saveRelays() {
  const lines = val("#set-relays")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  state.data.settings.relays = lines;
  applySettings();
  persist();
  // Reconnect the feed with the new relays if it's running.
  if (state.feedUnsub) {
    state.feedUnsub();
    state.interactionsUnsub?.();
    state.feedUnsub = null;
    state.interactionsUnsub = null;
    state.feed = [];
    startFeed();
  }
  render();
  toast(lines.length ? `Using ${lines.length} relay(s)` : "Using default relays");
}

function addBuddy(input: string) {
  try {
    const pubkey = pubkeyFromInput(input);
    if (pubkey === state.identity?.pubkey) {
      toast("That's you!");
      return;
    }
    const buddies = state.data.settings.buddies;
    if (buddies.includes(pubkey)) {
      toast("Already added");
      return;
    }
    buddies.push(pubkey);
    delete state.drafts["buddy-npub"];
    persist();
    render();
    refreshLeaderboard();
  } catch (err) {
    toast((err as Error).message);
  }
}

function removeBuddy(pubkey: string) {
  state.data.settings.buddies = state.data.settings.buddies.filter((p) => p !== pubkey);
  state.leaderboard = state.leaderboard.filter((e) => e.pubkey !== pubkey);
  persist();
  render();
}

async function refreshLeaderboard() {
  if (!state.identity) return;
  state.leaderboardLoading = true;
  render();
  const pubkeys = [state.identity.pubkey, ...state.data.settings.buddies];

  // Pull names + each person's public day list in parallel.
  const [profiles, dayLists] = await Promise.all([
    fetchProfiles(pubkeys),
    Promise.all(
      pubkeys.map(async (pk) =>
        pk === state.identity!.pubkey
          ? state.data.days
          : (await fetchAppDays(pk)) ?? []
      )
    )
  ]);
  profiles.forEach((v, k) => state.profiles.set(k, v));

  state.leaderboard = pubkeys
    .map((pk, i) => {
      const stats = computeStats({
        days: dayLists[i],
        settings: state.data.settings,
        challenge: state.data.challenge,
        journal: {},
        updatedAt: 0
      });
      return {
        pubkey: pk,
        name: state.profiles.get(pk)?.name || shortNpub(pk),
        challengeDays: stats.challengeDays,
        longestStreak: stats.longestStreak,
        isSelf: pk === state.identity!.pubkey
      };
    })
    .sort((a, b) => b.challengeDays - a.challengeDays || b.longestStreak - a.longestStreak);

  state.leaderboardLoading = false;
  render();
}

function exportData() {
  const blob = new Blob([JSON.stringify(state.data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dry-july-backup.json";
  a.click();
  URL.revokeObjectURL(url);
  toast("Backup downloaded");
}

function importData(text: string) {
  const raw = text.trim();
  if (!raw) {
    toast("Paste a backup first");
    return;
  }
  try {
    const parsed = JSON.parse(raw) as { days?: string[] };
    if (!Array.isArray(parsed.days)) throw new Error("No days found");
    const merged = new Set([...state.data.days, ...parsed.days]);
    state.data.days = [...merged].sort();
    delete state.drafts["import-data"];
    persist();
    render();
    toast(`Imported — ${state.data.days.length} dry days total`);
  } catch {
    toast("Couldn't read that backup");
  }
}

async function postNote(text: string, isCheckin: boolean) {
  const body = text.trim();
  if (!body) {
    toast("Write something first");
    return;
  }
  if (!state.identity) return;
  const stats = computeStats(state.data);
  const suffix = isCheckin ? `\n\nDay ${stats.currentStreak} of #dryjuly 🌿` : "";
  // Always carry #dryjuly so check-ins stay discoverable; add #mocktail when
  // posting from the mocktail tab so it shows in both feeds.
  const tags: string[][] = [
    [DRY_JULY_TAG],
    ["sober"]
  ].map((t) => ["t", ...t]);
  if (!isCheckin && state.feedTag === "mocktail") tags.push(["t", "mocktail"]);
  try {
    await publish(state.identity, {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: body + suffix
    });
    toast("Posted 🎉");
    const id = isCheckin ? "share-text" : "community-text";
    const ta = root.querySelector<HTMLTextAreaElement>(`#${id}`);
    if (ta) ta.value = "";
    delete state.drafts[id];
  } catch {
    toast("Couldn't reach relays — try again");
  }
}

async function likePost(id: string, pubkey: string) {
  if (!state.identity) return;
  const set = state.reactions.get(id) ?? new Set<string>();
  if (set.has(state.identity.pubkey)) return; // already liked
  set.add(state.identity.pubkey); // optimistic
  state.reactions.set(id, set);
  render();
  try {
    await react(state.identity, { id, pubkey });
  } catch {
    toast("Couldn't reach relays — try again");
  }
}

async function zapPost(id: string, pubkey: string, sats: number) {
  if (!state.identity) return;
  state.openZap = null;
  render();
  toast(`Requesting ⚡ ${sats} sats…`);
  try {
    await zap(state.identity, { id, pubkey }, sats);
    toast(`Zapped ⚡ ${sats} sats!`);
  } catch (err) {
    toast((err as Error).message || "Zap failed");
  }
}

async function sendReply(id: string, pubkey: string) {
  if (!state.identity) return;
  const draftId = `reply-${id}`;
  const body = val(`#${CSS.escape(draftId)}`).trim();
  if (!body) {
    toast("Write a reply first");
    return;
  }
  try {
    const event = await reply(state.identity, { id, pubkey }, body);
    // Optimistically show our own reply.
    addReply(id, {
      id: event.id,
      pubkey: event.pubkey,
      content: body,
      created_at: event.created_at
    });
    state.openReply = null;
    state.expanded.add(id);
    delete state.drafts[draftId];
    render();
    toast("Reply posted 🎉");
  } catch {
    toast("Couldn't reach relays — try again");
  }
}

function addReply(targetId: string, item: FeedItem) {
  const list = state.replies.get(targetId) ?? [];
  if (list.some((r) => r.id === item.id)) return;
  list.push(item);
  state.replies.set(targetId, list);
}

function startFeed() {
  state.feedUnsub = subscribeFeed((item) => {
    if (state.feed.some((f) => f.id === item.id)) return;
    state.feed.push(item);
    if (state.view === "community") scheduleRender();
    queueProfileFetch();
    refreshInteractions();
  }, state.feedTag);
}

/** Switch the community hashtag and restart the feed from scratch. */
function setFeedTag(tag: "dryjuly" | "mocktail") {
  if (state.feedTag === tag) return;
  state.feedTag = tag;
  state.feedUnsub?.();
  state.interactionsUnsub?.();
  state.feedUnsub = null;
  state.interactionsUnsub = null;
  state.feed = [];
  state.reactions.clear();
  state.replies.clear();
  state.zaps.clear();
  state.zapReceipts.clear();
  startFeed();
  render();
}

/** (Re)subscribe to likes & replies for the posts currently in the feed. */
let interactionsTimer: ReturnType<typeof setTimeout> | null = null;
function refreshInteractions() {
  if (interactionsTimer) return;
  interactionsTimer = setTimeout(() => {
    interactionsTimer = null;
    const ids = state.feed.map((f) => f.id);
    if (ids.length === 0) return;
    state.interactionsUnsub?.();
    state.interactionsUnsub = subscribeInteractions(ids, {
      like(targetId, pk) {
        const set = state.reactions.get(targetId) ?? new Set<string>();
        if (set.has(pk)) return;
        set.add(pk);
        state.reactions.set(targetId, set);
        if (state.view === "community") scheduleRender();
      },
      reply(targetId, item) {
        addReply(targetId, item);
        queueProfileFetch();
        if (state.view === "community") scheduleRender();
      },
      zap(targetId, receiptId, sats) {
        if (state.zapReceipts.has(receiptId)) return;
        state.zapReceipts.add(receiptId);
        state.zaps.set(targetId, (state.zaps.get(targetId) ?? 0) + sats);
        if (state.view === "community") scheduleRender();
      }
    });
  }, 1000);
}

let profileTimer: ReturnType<typeof setTimeout> | null = null;
function queueProfileFetch() {
  if (profileTimer) return;
  profileTimer = setTimeout(async () => {
    profileTimer = null;
    const authors = new Set<string>();
    state.feed.forEach((f) => authors.add(f.pubkey));
    state.replies.forEach((list) => list.forEach((r) => authors.add(r.pubkey)));
    const missing = [...authors].filter((p) => !state.profiles.has(p));
    if (missing.length === 0) return;
    const fetched = await fetchProfiles(missing);
    fetched.forEach((v, k) => state.profiles.set(k, v));
    if (state.view === "community") scheduleRender();
  }, 800);
}

async function copy(text: string, msg: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    toast("Copy failed — select manually");
  }
}

function closeModal() {
  document.getElementById("qr-modal")?.remove();
}

async function showQr() {
  if (!state.identity) return;
  const n = npub(state.identity.pubkey);
  let dataUrl: string;
  try {
    dataUrl = await QRCode.toDataURL(`nostr:${n}`, {
      width: 280,
      margin: 1,
      color: { dark: "#0b1020", light: "#ffffff" }
    });
  } catch {
    toast("Couldn't render QR code");
    return;
  }
  closeModal();
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.id = "qr-modal";
  overlay.innerHTML = `
    <div class="modal">
      <h2 style="margin-top:0">Your Nostr identity</h2>
      <p class="note" style="margin-top:0">Scan to follow you on any Nostr client.</p>
      <img class="qr" src="${dataUrl}" alt="npub QR code" />
      <div class="code" style="margin-top:12px">${esc(n)}</div>
      <button class="btn" id="qr-copy" style="margin-top:12px">Copy npub</button>
      <button class="btn ghost" id="qr-close" style="margin-top:8px">Close</button>
    </div>`;
  overlay.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t === overlay || t.id === "qr-close") closeModal();
    if (t.id === "qr-copy") copy(n, "npub copied");
  });
  document.body.appendChild(overlay);
}
