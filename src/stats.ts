import type { AppData } from "./store";

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
  julyDays: number;
}

/** The number of days in July of the given year. */
export const JULY_DAYS = 31;

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

  const year = new Date().getFullYear();
  const julyPrefix = `${year}-07-`;
  const julyDays = [...set].filter((d) => d.startsWith(julyPrefix)).length;

  return {
    total,
    currentStreak: current,
    longestStreak: longest,
    moneySaved,
    caloriesSaved,
    julyDays
  };
}

/** Build the calendar grid for July of the current year. */
export function julyGrid(year: number): { iso: string; dom: number }[] {
  const cells: { iso: string; dom: number }[] = [];
  for (let day = 1; day <= JULY_DAYS; day++) {
    const date = new Date(year, 6, day); // month 6 = July
    cells.push({ iso: isoDate(date), dom: day });
  }
  return cells;
}

/** Weekday index (0=Mon … 6=Sun) of July 1st, for grid alignment. */
export function julyStartOffset(year: number): number {
  const first = new Date(year, 6, 1).getDay(); // 0=Sun
  return (first + 6) % 7; // shift so Monday = 0
}
