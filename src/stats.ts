import type { AppData, Challenge } from "./store";

/** Format a Date as a local YYYY-MM-DD string. */
export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return isoDate(new Date());
}

function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + delta);
  return isoDate(date);
}

export interface Stats {
  total: number;
  currentStreak: number;
  longestStreak: number;
  moneySaved: number;
  caloriesSaved: number;
  challengeDays: number;
  challengeLength: number;
}

/** The number of days in July of the given year. */
export const JULY_DAYS = 31;

export interface Badge {
  days: number;
  label: string;
  icon: string;
  earned: boolean;
}

const BADGE_TIERS: { days: number; label: string; icon: string }[] = [
  { days: 1, label: "Day one", icon: "🌱" },
  { days: 3, label: "Three days", icon: "🌿" },
  { days: 7, label: "One week", icon: "⭐" },
  { days: 14, label: "Two weeks", icon: "🔥" },
  { days: 21, label: "Habit formed", icon: "💪" },
  { days: 31, label: "Dry July!", icon: "🏆" },
  { days: 60, label: "Two months", icon: "💎" },
  { days: 90, label: "90 days", icon: "👑" }
];

/** Badges keyed off the best streak achieved so far. */
export function badges(stats: Stats): Badge[] {
  return BADGE_TIERS.map((t) => ({
    ...t,
    earned: stats.longestStreak >= t.days
  }));
}

/** The highest badge-day threshold currently earned (0 if none). */
export function topBadgeDays(stats: Stats): number {
  return badges(stats)
    .filter((b) => b.earned)
    .reduce((max, b) => Math.max(max, b.days), 0);
}

export function computeStats(data: AppData): Stats {
  const set = new Set(data.days);
  const total = set.size;

  // Longest streak across all logged days.
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev = "";
  for (const day of sorted) {
    if (prev && addDays(prev, 1) === day) {
      run += 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = day;
  }

  // Current streak counts back from today (or yesterday if today not logged).
  let current = 0;
  let cursor = todayIso();
  if (!set.has(cursor)) cursor = addDays(cursor, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }

  const { drinksPerDay, costPerDrink, caloriesPerDrink } = data.settings;
  const moneySaved = total * drinksPerDay * costPerDrink;
  const caloriesSaved = total * drinksPerDay * caloriesPerDrink;

  const challengeSet = new Set(challengeGrid(data.challenge).map((c) => c.iso));
  const challengeDays = [...set].filter((d) => challengeSet.has(d)).length;

  return {
    total,
    currentStreak: current,
    longestStreak: longest,
    moneySaved,
    caloriesSaved,
    challengeDays,
    challengeLength: data.challenge.length
  };
}

/** Build the calendar grid for a challenge window. */
export function challengeGrid(
  challenge: Challenge
): { iso: string; dom: number }[] {
  const [y, m, d] = challenge.start.split("-").map(Number);
  const cells: { iso: string; dom: number }[] = [];
  for (let i = 0; i < challenge.length; i++) {
    const date = new Date(y, m - 1, d + i);
    cells.push({ iso: isoDate(date), dom: date.getDate() });
  }
  return cells;
}

/** Last N days as {iso, on} ending today — for a trend sparkline. */
export function recentTrend(
  days: string[],
  n = 14
): { iso: string; on: boolean }[] {
  const set = new Set(days);
  const out: { iso: string; on: boolean }[] = [];
  const today = todayIso();
  for (let i = n - 1; i >= 0; i--) {
    const iso = addDays(today, -i);
    out.push({ iso, on: set.has(iso) });
  }
  return out;
}

/** Weekday index (0=Mon … 6=Sun) of the challenge start, for grid alignment. */
export function challengeStartOffset(challenge: Challenge): number {
  const [y, m, d] = challenge.start.split("-").map(Number);
  const first = new Date(y, m - 1, d).getDay(); // 0=Sun
  return (first + 6) % 7; // shift so Monday = 0
}
