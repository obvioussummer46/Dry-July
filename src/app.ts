import {
  connectExtension,
  createLocalIdentity,
  DRY_JULY_TAG,
  fetchProfiles,
  hasExtension,
  identityFromSecret,
  npub,
  nsec,
  publish,
  shortNpub,
  subscribeFeed,
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
import { computeStats, julyGrid, julyStartOffset, todayIso } from "./stats";
import { icons, logoSvg } from "./icons";

type View = "today" | "calendar" | "community" | "profile";

interface State {
  identity: Identity | null;
  data: AppData;
  view: View;
  importing: boolean;
  feed: FeedItem[];
  profiles: Map<string, { name?: string; picture?: string }>;
  feedUnsub: (() => void) | null;
  revealKey: boolean;
}

const state: State = {
  identity: loadIdentity(),
  data: loadLocalData(),
  view: "today",
  importing: false,
  feed: [],
  profiles: new Map(),
  feedUnsub: null,
  revealKey: false
};

let root: HTMLElement;

export function mount(el: HTMLElement) {
  root = el;
  root.addEventListener("click", onClick);
  render();
  if (state.identity) backgroundSync();
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
  return state.identity ? shortNpub(state.identity.pubkey) : "anon";
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
    return;
  }
  root.innerHTML = `
    ${renderHeader()}
    <div class="screen">${renderView()}</div>
    ${renderTabbar()}
  `;
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
    case "calendar":
      return renderCalendar();
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
      ${tab("calendar", "Calendar", icons.calendar)}
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
        Go alcohol-free for the month and cheer each other on.<br/>
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
  const pct = Math.min(100, (stats.julyDays / 31) * 100);
  const { currency } = state.data.settings;

  return `
    <div class="card hero" style="--pct:${pct}%">
      <div class="ring">
        <div>
          <div class="num">${stats.currentStreak}</div>
          <div class="lbl">day streak</div>
        </div>
      </div>
      <p class="sub">
        ${
          checkedToday
            ? "Nice — today is logged alcohol-free 🌿"
            : "Have you stayed dry today?"
        }
      </p>
      ${
        checkedToday
          ? `<button class="btn done" data-action="check-in">${icons.check} Logged for today</button>`
          : `<button class="btn" data-action="check-in">${icons.check} I stayed dry today</button>`
      }
    </div>

    <div class="stats">
      <div class="stat green"><div class="v">${stats.julyDays}<span class="muted" style="font-size:15px">/31</span></div><div class="k">July days dry</div></div>
      <div class="stat gold"><div class="v">${stats.longestStreak}</div><div class="k">Longest streak</div></div>
      <div class="stat blue"><div class="v">${currency}${stats.moneySaved.toLocaleString()}</div><div class="k">Money saved</div></div>
      <div class="stat"><div class="v">${stats.caloriesSaved.toLocaleString()}</div><div class="k">Calories avoided</div></div>
    </div>

    <div class="card">
      <h2>Share your win</h2>
      <p class="note" style="margin-top:0">Post an update to the #dryjuly community on Nostr.</p>
      <textarea id="share-text" rows="2" placeholder="Day ${stats.currentStreak} and feeling great…"></textarea>
      <button class="btn secondary" data-action="share-checkin" style="margin-top:10px">Post to community</button>
    </div>`;
}

/* ---- Calendar ---- */

function renderCalendar(): string {
  const year = new Date().getFullYear();
  const grid = julyGrid(year);
  const offset = julyStartOffset(year);
  const set = new Set(state.data.days);
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
      const action = future ? "" : `data-action="toggle-day" data-day="${c.iso}"`;
      return `<div class="${cls.join(" ")}" ${action}>${c.dom}</div>`;
    })
    .join("");

  const stats = computeStats(state.data);

  return `
    <div class="card">
      <div class="flex-between" style="margin-bottom:14px">
        <h2 style="margin:0">July ${year}</h2>
        <span class="pill">${stats.julyDays} of 31 dry</span>
      </div>
      <div class="cal">
        ${dows.map((d) => `<div class="dow">${d}</div>`).join("")}
        ${spacers}${cells}
      </div>
      <p class="note" style="margin-bottom:0">
        Tap any past day to toggle it. Days sync to your Nostr account automatically.
      </p>
    </div>

    <div class="stats">
      <div class="stat green"><div class="v">${stats.total}</div><div class="k">Total dry days</div></div>
      <div class="stat gold"><div class="v">${stats.currentStreak}</div><div class="k">Current streak</div></div>
    </div>`;
}

/* ---- Community ---- */

function renderCommunity(): string {
  const items = state.feed
    .slice()
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 50);

  const list =
    items.length === 0
      ? `<div class="center" style="padding:30px 0">
           <div class="spinner"></div>
           <p class="muted">Listening for #dryjuly posts on Nostr…</p>
         </div>`
      : items.map(renderFeedItem).join("");

  return `
    <div class="card">
      <h2>Cheer the crew on</h2>
      <textarea id="community-text" rows="3" placeholder="Share encouragement, a milestone, a recipe…"></textarea>
      <button class="btn" data-action="post-message" style="margin-top:10px">Post to #dryjuly</button>
    </div>
    <div class="card">
      <h2>Live feed</h2>
      ${list}
    </div>`;
}

function renderFeedItem(item: FeedItem): string {
  const prof = state.profiles.get(item.pubkey);
  const name = prof?.name || shortNpub(item.pubkey);
  const initial = (name[0] || "?").toUpperCase();
  const avatar = prof?.picture
    ? `<img src="${esc(prof.picture)}" alt="" />`
    : esc(initial);
  return `
    <div class="feed-item">
      <div class="avatar">${avatar}</div>
      <div class="body">
        <div><span class="who">${esc(name)}</span><span class="when">${timeAgo(item.created_at)}</span></div>
        <p class="txt">${esc(item.content)}</p>
      </div>
    </div>`;
}

/* ---- Profile ---- */

function renderProfile(): string {
  const id = state.identity!;
  const s = state.data.settings;
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
      <button class="btn" data-action="save-settings">Save</button>
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
    case "check-in":
      toggleDay(todayIso());
      break;
    case "toggle-day":
      toggleDay(target.dataset.day!);
      break;
    case "share-checkin":
      await postNote(val("#share-text"), true);
      break;
    case "post-message":
      await postNote(val("#community-text"), false);
      break;
    case "save-settings":
      saveSettings();
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
        state.feedUnsub = null;
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
  persist();
  render();
}

function saveSettings() {
  const s = state.data.settings;
  s.displayName = val("#set-name").trim();
  s.drinksPerDay = Math.max(0, Number(val("#set-drinks")) || 0);
  s.costPerDrink = Math.max(0, Number(val("#set-cost")) || 0);
  s.currency = val("#set-currency").trim() || "$";
  s.caloriesPerDrink = Math.max(0, Number(val("#set-cal")) || 0);
  persist();
  render();
  toast("Saved");
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
  try {
    await publish(state.identity, {
      kind: 1,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["t", DRY_JULY_TAG],
        ["t", "sober"]
      ],
      content: body + suffix
    });
    toast("Posted to #dryjuly 🎉");
    const ta = root.querySelector<HTMLTextAreaElement>(
      isCheckin ? "#share-text" : "#community-text"
    );
    if (ta) ta.value = "";
  } catch {
    toast("Couldn't reach relays — try again");
  }
}

function startFeed() {
  state.feedUnsub = subscribeFeed((item) => {
    if (state.feed.some((f) => f.id === item.id)) return;
    state.feed.push(item);
    // Refresh profiles for new authors, then re-render if on community view.
    if (state.view === "community") render();
    queueProfileFetch();
  });
}

let profileTimer: ReturnType<typeof setTimeout> | null = null;
function queueProfileFetch() {
  if (profileTimer) return;
  profileTimer = setTimeout(async () => {
    profileTimer = null;
    const missing = [
      ...new Set(state.feed.map((f) => f.pubkey))
    ].filter((p) => !state.profiles.has(p));
    if (missing.length === 0) return;
    const fetched = await fetchProfiles(missing);
    fetched.forEach((v, k) => state.profiles.set(k, v));
    if (state.view === "community") render();
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
