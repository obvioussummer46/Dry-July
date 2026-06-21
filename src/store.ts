import {
  APP_DATA_D,
  APP_DATA_KIND,
  fetchLatest,
  identityFromSecret,
  nsec,
  publish,
  type Identity
} from "./nostr";

const IDENTITY_KEY = "dryjuly.identity";
const DATA_KEY = "dryjuly.data";

export interface Settings {
  /** Typical drinks per day before going dry. */
  drinksPerDay: number;
  /** Cost of one drink in the user's currency. */
  costPerDrink: number;
  /** Currency symbol for display. */
  currency: string;
  /** Approx calories per drink. */
  caloriesPerDrink: number;
  /** Optional display name shown alongside check-ins. */
  displayName: string;
  /** Optional money-saved goal (0 = no goal). */
  savingsGoal: number;
  /** Whether daily check-in reminders are enabled. */
  reminders: boolean;
  /** Top badge (in days) the user has already celebrated. */
  lastBadgeSeen: number;
  /** Custom relay list; empty means use defaults. */
  relays: string[];
  /** UI theme. */
  theme: "dark" | "light";
  /** Followed buddy pubkeys (hex) for the leaderboard. */
  buddies: string[];
}

/** A configurable challenge — defaults to Dry July of the current year. */
export interface Challenge {
  title: string;
  /** Inclusive start date (YYYY-MM-DD). */
  start: string;
  /** Length in days. */
  length: number;
}

export interface AppData {
  /** ISO dates (YYYY-MM-DD) the user logged as alcohol-free. */
  days: string[];
  settings: Settings;
  challenge: Challenge;
  updatedAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  drinksPerDay: 2,
  costPerDrink: 8,
  currency: "$",
  caloriesPerDrink: 150,
  displayName: "",
  savingsGoal: 0,
  reminders: false,
  lastBadgeSeen: 0,
  relays: [],
  theme: "dark",
  buddies: []
};

/** Dry July of the current year. */
export function defaultChallenge(): Challenge {
  const year = new Date().getFullYear();
  return { title: "Dry July", start: `${year}-07-01`, length: 31 };
}

export function emptyData(): AppData {
  return {
    days: [],
    settings: { ...DEFAULT_SETTINGS },
    challenge: defaultChallenge(),
    updatedAt: 0
  };
}

/* ---------- Identity persistence ---------- */

export function loadIdentity(): Identity | null {
  const raw = localStorage.getItem(IDENTITY_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as
      | { kind: "nip07"; pubkey: string }
      | { kind: "local"; nsec: string };
    if (parsed.kind === "nip07") {
      return { kind: "nip07", pubkey: parsed.pubkey };
    }
    return identityFromSecret(parsed.nsec);
  } catch {
    return null;
  }
}

export function saveIdentity(identity: Identity): void {
  if (identity.kind === "nip07") {
    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({ kind: "nip07", pubkey: identity.pubkey })
    );
  } else {
    localStorage.setItem(
      IDENTITY_KEY,
      JSON.stringify({ kind: "local", nsec: nsec(identity.secret) })
    );
  }
}

export function clearIdentity(): void {
  localStorage.removeItem(IDENTITY_KEY);
  localStorage.removeItem(DATA_KEY);
}

/* ---------- App data persistence (local + Nostr NIP-78) ---------- */

export function loadLocalData(): AppData {
  const raw = localStorage.getItem(DATA_KEY);
  if (!raw) return emptyData();
  try {
    const parsed = JSON.parse(raw) as Partial<AppData>;
    return {
      days: parsed.days ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      challenge: { ...defaultChallenge(), ...(parsed.challenge ?? {}) },
      updatedAt: parsed.updatedAt ?? 0
    };
  } catch {
    return emptyData();
  }
}

export function saveLocalData(data: AppData): void {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

/** Pull the latest app data from relays and merge with what we have. */
export async function syncFromNostr(
  identity: Identity,
  local: AppData
): Promise<AppData> {
  const event = await fetchLatest({
    kinds: [APP_DATA_KIND],
    authors: [identity.pubkey],
    "#d": [APP_DATA_D]
  });
  if (!event) return local;
  try {
    const remote = JSON.parse(event.content) as Partial<AppData>;
    const merged = mergeData(local, {
      days: remote.days ?? [],
      settings: { ...DEFAULT_SETTINGS, ...(remote.settings ?? {}) },
      challenge: { ...defaultChallenge(), ...(remote.challenge ?? {}) },
      updatedAt: event.created_at * 1000
    });
    saveLocalData(merged);
    return merged;
  } catch {
    return local;
  }
}

/** Merge two data sets: union of days, newest settings/challenge win. */
export function mergeData(a: AppData, b: AppData): AppData {
  const days = Array.from(new Set([...a.days, ...b.days])).sort();
  const newest = a.updatedAt >= b.updatedAt ? a : b;
  return {
    days,
    settings: newest.settings,
    challenge: newest.challenge,
    updatedAt: Math.max(a.updatedAt, b.updatedAt)
  };
}

/** Persist app data to Nostr as a NIP-78 replaceable event. */
export async function pushToNostr(
  identity: Identity,
  data: AppData
): Promise<void> {
  await publish(identity, {
    kind: APP_DATA_KIND,
    created_at: Math.floor(Date.now() / 1000),
    tags: [["d", APP_DATA_D]],
    content: JSON.stringify({
      days: data.days,
      settings: data.settings,
      challenge: data.challenge
    })
  });
}
