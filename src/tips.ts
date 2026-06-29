// Lightweight educational + encouraging content for the Today screen.
// Everything here is static and on-device — no network, no tracking.

/** A rotating pool of practical, educational and just-plain-encouraging tips. */
const TIPS: string[] = [
  "Cravings usually peak for about 15 minutes. Set a timer, keep your hands busy, and ride it out.",
  "HALT: most cravings hit when you're Hungry, Angry, Lonely or Tired. Fix the real need first.",
  "Sparkling water with lime and a dash of bitters keeps the ritual without the alcohol.",
  "The money you're not spending on drinks adds up fast — name a goal and watch it grow.",
  "Tell one person you trust about your challenge. Saying it out loud makes it real.",
  "Alcohol disrupts deep sleep. A few dry nights and most people wake up genuinely more rested.",
  "Keep a non-alcoholic drink you actually like in the fridge, so water isn't your only out.",
  "Plan your exit before the party: your drink, your ride, and the time you'll leave.",
  "The first dry week is the hardest. After that, your brain starts to expect the new normal.",
  "Sometimes 'I want a drink' just means 'I'm thirsty.' Try a big glass of water first.",
  "Swap the habit, not just the drink: same glass, same chair, same time — different contents.",
  "Try a 0% IPA or a verjus spritz before deciding alcohol-free drinks aren't for you.",
  "Alcohol is about 7 calories a gram — nearly as much as pure fat. Dry days add up.",
  "Notice your triggers without judging them. Awareness is most of the work.",
  "A short walk after dinner is a classic wind-down that never comes with a hangover.",
  "Progress isn't a straight line. One off day doesn't erase the streak you built.",
  "Boredom is a craving in disguise. Have a go-to activity ready for the witching hour.",
  "Your liver begins repairing itself within days of your last drink.",
  "If someone offers you a drink, 'I'm good, thanks' is a complete sentence.",
  "Reward your milestones with something real — a book, a meal out, a small splurge.",
  "Going out? Order your non-alcoholic drink first, so it's in hand before anyone asks.",
  "Caffeine late in the day can mimic the restlessness people 'solve' with a drink.",
  "Screenshot a win and share it with the crew — accountability is a superpower.",
  "Hydration, a snack, and an early night beat almost every craving on a hard day."
];

/** Pick a stable tip for a given ISO date — rotates once per calendar day. */
export function dailyTip(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  // Whole-day number so the choice is stable across a day, regardless of time.
  const dayNumber = Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
  return TIPS[((dayNumber % TIPS.length) + TIPS.length) % TIPS.length];
}

/** A health/wellbeing milestone tied to how long the current streak is. */
export interface Benefit {
  /** Minimum current-streak length (days) at which this applies. */
  from: number;
  icon: string;
  title: string;
  body: string;
}

// Modest, commonly-cited benefits — framed as general info, not medical advice.
const BENEFITS: Benefit[] = [
  {
    from: 0,
    icon: "🌱",
    title: "Starting line",
    body: "Every dry day is a win. The benefits start from the very first one — log today to begin."
  },
  {
    from: 1,
    icon: "💧",
    title: "First 24 hours",
    body: "Your body has cleared most of the alcohol. Blood sugar and hydration are starting to rebalance."
  },
  {
    from: 3,
    icon: "😴",
    title: "Three days in",
    body: "As your system settles, many people notice deeper, more restful sleep."
  },
  {
    from: 7,
    icon: "⭐",
    title: "One week down",
    body: "Sleep and hydration are improving — and a lot of people report brighter skin and steadier energy."
  },
  {
    from: 14,
    icon: "🔥",
    title: "Two weeks strong",
    body: "Your stomach lining gets a break and digestion often settles around now."
  },
  {
    from: 21,
    icon: "💪",
    title: "Three weeks",
    body: "The brain's reward system is recalibrating — for most people, cravings start to ease."
  },
  {
    from: 30,
    icon: "🏆",
    title: "A full month",
    body: "A month off can lower blood pressure and gives your liver real time to recover."
  },
  {
    from: 60,
    icon: "💎",
    title: "Two months",
    body: "Sustained gains in sleep, mood and energy are common this far in. Keep going."
  },
  {
    from: 90,
    icon: "👑",
    title: "Ninety days",
    body: "A genuine reset — new routines have had time to become real habits."
  }
];

/** The highest benefit milestone reached for a given current streak. */
export function benefitForStreak(streak: number): Benefit {
  let pick = BENEFITS[0];
  for (const b of BENEFITS) if (streak >= b.from) pick = b;
  return pick;
}
