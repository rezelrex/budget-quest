import { CATEGORIES, SPEND_CATEGORIES, cat, CategoryId } from "./categories";

export interface Tx {
  id: number;
  statement_id: number | null;
  date: string; // YYYY-MM-DD
  description: string;
  merchant: string;
  amount: number; // negative = money out
  category: CategoryId;
}
export interface Statement {
  id: number;
  label: string;
  period_start: string | null;
  period_end: string | null;
}
export interface Quest {
  id: number;
  category: CategoryId;
  title: string;
  baseline: number;
  target: number;
  month: string; // YYYY-MM
}
export interface Goal {
  name: string;
  amount: number;
}
export interface AppData {
  statements: Statement[];
  transactions: Tx[];
  budgets: Partial<Record<CategoryId, number>>;
  settings: { goal?: Goal };
  quests: Quest[];
}

export interface Period {
  key: string;
  label: string;
  kind: "month" | "statement" | "all";
  start: string;
  end: string;
}

const DAY = 86_400_000;
const toDate = (s: string) => new Date(s + "T00:00:00Z");
const fmtISO = (d: Date) => d.toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY) + 1;
const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return fmtISO(new Date(Date.UTC(y, m, 0)));
};
export const daysInMonth = (ym: string) => Number(monthEnd(ym).slice(8));
export const nextMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return fmtISO(new Date(Date.UTC(y, m, 1))).slice(0, 7);
};
export const monthLabel = (ym: string) =>
  toDate(ym + "-01").toLocaleDateString("en-SG", { month: "long", year: "numeric", timeZone: "UTC" });
export const shortDate = (d: string) =>
  toDate(d).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" });

export const money = (n: number, cents = true) =>
  "$" + Math.abs(n).toLocaleString("en-SG", { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });

export function dataRange(txs: Tx[]): { min: string; max: string } | null {
  if (!txs.length) return null;
  let min = txs[0].date, max = txs[0].date;
  for (const t of txs) {
    if (t.date < min) min = t.date;
    if (t.date > max) max = t.date;
  }
  return { min, max };
}

export function buildPeriods(data: AppData): Period[] {
  const range = dataRange(data.transactions);
  if (!range) return [];
  const months = Array.from(new Set(data.transactions.map((t) => t.date.slice(0, 7)))).sort().reverse();
  const out: Period[] = data.statements
    .filter((s) => s.period_start && s.period_end)
    .slice()
    .reverse()
    .map((s) => ({
      key: `s${s.id}`,
      label: `Statement: ${shortDate(s.period_start!)} – ${shortDate(s.period_end!)}`,
      kind: "statement" as const,
      start: s.period_start!,
      end: s.period_end!,
    }));
  for (const m of months) {
    out.push({ key: `m${m}`, label: monthLabel(m), kind: "month", start: m + "-01", end: monthEnd(m) });
  }
  out.push({ key: "all", label: "All time", kind: "all", start: range.min, end: range.max });
  return out;
}

/** Days of the period actually covered by uploaded data — used to pro-rate budgets honestly. */
export function coveredDays(period: Period, txs: Tx[]): number {
  const range = dataRange(txs);
  if (!range) return 0;
  const s = period.start > range.min ? period.start : range.min;
  const e = period.end < range.max ? period.end : range.max;
  return Math.max(0, daysBetween(s, e));
}

export interface CategorySummary {
  id: CategoryId;
  total: number;
  count: number;
}
export interface Summary {
  txs: Tx[];
  spend: number;
  income: number;
  net: number;
  days: number;
  byCategory: CategorySummary[];
  topMerchants: { merchant: string; total: number; count: number; category: CategoryId }[];
  daily: { date: string; total: number }[];
}

export function summarize(all: Tx[], period: Period): Summary {
  const txs = all.filter((t) => t.date >= period.start && t.date <= period.end);
  const days = coveredDays(period, all);
  let spend = 0, income = 0;
  const byCat = new Map<CategoryId, CategorySummary>();
  const byMerchant = new Map<string, { merchant: string; total: number; count: number; category: CategoryId }>();
  const byDay = new Map<string, number>();
  for (const t of txs) {
    if (t.amount > 0) {
      income += t.amount;
      continue;
    }
    const v = -t.amount;
    spend += v;
    const c = byCat.get(t.category) ?? { id: t.category, total: 0, count: 0 };
    c.total += v;
    c.count++;
    byCat.set(t.category, c);
    const mk = t.merchant.toLowerCase();
    const m = byMerchant.get(mk) ?? { merchant: t.merchant, total: 0, count: 0, category: t.category };
    m.total += v;
    m.count++;
    byMerchant.set(mk, m);
    byDay.set(t.date, (byDay.get(t.date) ?? 0) + v);
  }
  const daily: { date: string; total: number }[] = [];
  const range = dataRange(all);
  if (range) {
    const s = period.start > range.min ? period.start : range.min;
    const e = period.end < range.max ? period.end : range.max;
    for (let d = toDate(s); fmtISO(d) <= e; d = new Date(d.getTime() + DAY)) {
      daily.push({ date: fmtISO(d), total: byDay.get(fmtISO(d)) ?? 0 });
    }
  }
  return {
    txs,
    spend,
    income,
    net: income - spend,
    days,
    byCategory: Array.from(byCat.values()).sort((a, b) => b.total - a.total),
    topMerchants: Array.from(byMerchant.values()).sort((a, b) => b.total - a.total).slice(0, 8),
    daily,
  };
}

/** Budget for a period, pro-rated by the days of data it covers. */
export function periodBudget(budgets: AppData["budgets"], category: CategoryId, days: number): number | null {
  const b = budgets[category];
  if (!b) return null;
  return (b * days) / 30.4;
}
export function totalBudget(budgets: AppData["budgets"]): number {
  return Object.values(budgets).reduce<number>((a, b) => a + (b ?? 0), 0);
}

export interface Opportunity {
  id: string;
  emoji: string;
  title: string;
  detail: string;
  monthlySaving: number;
  category?: CategoryId;
  cut?: number; // fraction to cut for a quest
}

const CUTS: Partial<Record<CategoryId, number>> = {
  coffee: 0.5,
  food: 0.25,
  shopping: 0.4,
  entertainment: 0.3,
  subscriptions: 0.2,
};

export function opportunities(s: Summary): Opportunity[] {
  const out: Opportunity[] = [];
  if (!s.days) return out;
  const perMonth = 30.4 / s.days;
  const find = (id: CategoryId) => s.byCategory.find((c) => c.id === id);

  const coffee = find("coffee");
  if (coffee && coffee.total * perMonth >= 15) {
    const avg = coffee.total / coffee.count;
    out.push({
      id: "coffee",
      emoji: "🧋",
      category: "coffee",
      cut: CUTS.coffee,
      title: "Halve the coffee & bubble tea runs",
      detail: `${coffee.count} drinks at about ${money(avg)} each, ${money(coffee.total)} in total. Make every second one at home or the office pantry.`,
      monthlySaving: coffee.total * perMonth * CUTS.coffee!,
    });
  }

  const food = find("food");
  if (food && food.total * perMonth >= 60) {
    const avg = food.total / food.count;
    const pricey = s.txs.filter((t) => t.category === "food" && -t.amount >= 12);
    const priceyTotal = pricey.reduce((a, t) => a - t.amount, 0);
    out.push({
      id: "food",
      emoji: "🍜",
      category: "food",
      cut: CUTS.food,
      title: "Swap pricier meals for hawker or home-cooked",
      detail: `${food.count} meals averaging ${money(avg)}. ${pricey.length} of them were $12+ (${money(priceyTotal)}) — those are the easiest to trim.`,
      monthlySaving: food.total * perMonth * CUTS.food!,
    });
  }

  for (const id of ["shopping", "entertainment"] as CategoryId[]) {
    const c = find(id);
    if (c && c.total * perMonth >= 30) {
      out.push({
        id,
        emoji: cat(id).emoji,
        category: id,
        cut: CUTS[id],
        title: `Put a cap on ${cat(id).label.toLowerCase()}`,
        detail: `${c.count} purchases, ${money(c.total)}. Try a 48-hour wait before buying anything non-essential.`,
        monthlySaving: c.total * perMonth * CUTS[id]!,
      });
    }
  }

  const subs = s.txs.filter((t) => t.category === "subscriptions" && t.amount < 0);
  if (subs.length) {
    const total = subs.reduce((a, t) => a - t.amount, 0);
    const names = Array.from(new Set(subs.map((t) => t.merchant))).slice(0, 5).join(", ");
    out.push({
      id: "subs",
      emoji: "📱",
      category: "subscriptions",
      cut: CUTS.subscriptions,
      title: "Audit your subscriptions",
      detail: `${names} — ${money(total)}. Cancel anything you didn't use this month or switch to a cheaper tier.`,
      monthlySaving: total * perMonth * CUTS.subscriptions!,
    });
  }

  // Repeat charges: same merchant and amount ≥ $10 more than once in the period.
  const seen = new Map<string, Tx[]>();
  for (const t of s.txs) {
    if (t.amount >= 0 || -t.amount < 10 || t.category === "transport") continue;
    const k = t.merchant.toLowerCase() + "|" + t.amount.toFixed(2);
    seen.set(k, [...(seen.get(k) ?? []), t]);
  }
  for (const group of seen.values()) {
    if (group.length < 2) continue;
    group.sort((x, y) => (x.date < y.date ? -1 : 1));
    const t = group[0];
    out.push({
      id: "dup-" + t.merchant,
      emoji: "🔁",
      title: `Check the repeat ${t.merchant} charge`,
      detail: `${group.length} × ${money(t.amount)} on ${group.map((g) => shortDate(g.date)).join(", ")}. If it's a subscription you forgot, cancel it; if it's a double charge, dispute it with the bank.`,
      monthlySaving: 0,
    });
  }

  // Small frequent purchases (the "latte factor"), excluding transport fares.
  const small = s.txs.filter((t) => t.amount < 0 && -t.amount < 6 && t.category !== "transport");
  if (small.length >= 10) {
    const total = small.reduce((a, t) => a - t.amount, 0);
    out.push({
      id: "small",
      emoji: "🪙",
      title: "Watch the small stuff",
      detail: `${small.length} purchases under $6 added up to ${money(total)}. Snacks, drinks and vending machines are where money leaks quietly.`,
      monthlySaving: 0,
    });
  }

  return out.sort((a, b) => b.monthlySaving - a.monthlySaving);
}

/* ---------------------------- Gamification ---------------------------- */

export interface Badge {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  earned: boolean;
}
export type QuestStatus = { state: "active" | "won" | "lost"; spent: number; progress: number };

export function questStatus(q: Quest, txs: Tx[]): QuestStatus {
  const range = dataRange(txs);
  const end = monthEnd(q.month);
  const spent = txs
    .filter((t) => t.date.startsWith(q.month) && t.category === q.category && t.amount < 0)
    .reduce((a, t) => a - t.amount, 0);
  const progress = q.target > 0 ? spent / q.target : spent > 0 ? 2 : 0;
  if (range && range.max >= end) return { state: spent <= q.target ? "won" : "lost", spent, progress };
  if (spent > q.target) return { state: "lost", spent, progress };
  return { state: "active", spent, progress };
}

const TITLES = [
  "Kopi Kadet",
  "Hawker Hustler",
  "Coin Collector",
  "Budget Apprentice",
  "Thrift Ranger",
  "Ledger Knight",
  "Savings Samurai",
  "Compound Wizard",
  "Wealth Warden",
  "Financial Legend",
];

export interface MonthResult {
  month: string;
  complete: boolean;
  spend: number;
  income: number;
  budget: number;
  underBudget: boolean | null;
  categoriesUnder: number;
}

export function monthResults(data: AppData): MonthResult[] {
  const range = dataRange(data.transactions);
  if (!range) return [];
  const months = Array.from(new Set(data.transactions.map((t) => t.date.slice(0, 7)))).sort();
  const tb = totalBudget(data.budgets);
  return months.map((m) => {
    const p: Period = { key: m, label: m, kind: "month", start: m + "-01", end: monthEnd(m) };
    const s = summarize(data.transactions, p);
    const budget = tb ? (tb * s.days) / 30.4 : 0;
    let categoriesUnder = 0;
    for (const c of SPEND_CATEGORIES) {
      const b = periodBudget(data.budgets, c.id, s.days);
      if (b === null) continue;
      const spent = s.byCategory.find((x) => x.id === c.id)?.total ?? 0;
      if (spent <= b) categoriesUnder++;
    }
    return {
      month: m,
      complete: range.max >= monthEnd(m),
      spend: s.spend,
      income: s.income,
      budget,
      underBudget: tb ? s.spend <= budget : null,
      categoriesUnder,
    };
  });
}

export interface Player {
  xp: number;
  level: number;
  title: string;
  levelFloor: number;
  levelCeil: number;
  streak: number;
  badges: Badge[];
  log: { label: string; xp: number }[];
}

const xpForLevel = (l: number) => 75 * (l - 1) * l; // 0, 150, 450, 900, 1500…

export function player(data: AppData): Player {
  const log: { label: string; xp: number }[] = [];
  const add = (label: string, xp: number) => xp && log.push({ label, xp });

  add(`Logged ${data.statements.length} statement${data.statements.length === 1 ? "" : "s"}`, data.statements.length * 100);
  if (Object.keys(data.budgets).length) add("Set up a budget", 50);
  if (data.settings.goal?.amount) add("Picked a savings goal", 50);

  const months = monthResults(data);
  for (const m of months) {
    if (!m.complete || m.underBudget === null) continue;
    if (m.underBudget) add(`${monthLabel(m.month)} under budget`, 150);
    if (m.categoriesUnder) add(`${monthLabel(m.month)}: ${m.categoriesUnder} categories on target`, m.categoriesUnder * 20);
  }
  const statuses = data.quests.map((q) => ({ q, s: questStatus(q, data.transactions) }));
  const won = statuses.filter((x) => x.s.state === "won");
  if (won.length) add(`Completed ${won.length} quest${won.length === 1 ? "" : "s"}`, won.length * 250);

  const xp = log.reduce((a, l) => a + l.xp, 0);
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;

  // Streak: consecutive complete months under budget, counting back from the latest complete month.
  let streak = 0;
  for (const m of months.filter((m) => m.complete).reverse()) {
    if (m.underBudget) streak++;
    else break;
  }

  // Badges
  const anyMonth = (fn: (s: Summary) => boolean) =>
    Array.from(new Set(data.transactions.map((t) => t.date.slice(0, 7)))).some((m) =>
      fn(summarize(data.transactions, { key: m, label: m, kind: "month", start: m + "-01", end: monthEnd(m) }))
    );
  const catOf = (s: Summary, id: CategoryId) => s.byCategory.find((c) => c.id === id);

  const badges: Badge[] = [
    { id: "first", emoji: "📜", name: "First Loot", desc: "Upload your first statement", earned: data.statements.length >= 1 },
    { id: "hoarder", emoji: "🗂️", name: "Record Keeper", desc: "Log 3 months of data", earned: months.length >= 3 },
    { id: "planner", emoji: "🎯", name: "Planner", desc: "Set a budget and a savings goal", earned: Object.keys(data.budgets).length > 0 && !!data.settings.goal?.amount },
    {
      id: "hawker",
      emoji: "🥢",
      name: "Hawker Hero",
      desc: "Average meal under $7 in a month (10+ meals)",
      earned: anyMonth((s) => {
        const f = catOf(s, "food");
        return !!f && f.count >= 10 && f.total / f.count < 7;
      }),
    },
    {
      id: "kopi",
      emoji: "☕",
      name: "Kopi Kontrol",
      desc: "Spend under $20 on coffee & bubble tea in a full month",
      earned: months.some((m) => {
        if (!m.complete) return false;
        const s = summarize(data.transactions, { key: m.month, label: "", kind: "month", start: m.month + "-01", end: monthEnd(m.month) });
        return s.days >= 28 && (catOf(s, "coffee")?.total ?? 0) < 20;
      }),
    },
    { id: "saver", emoji: "🐷", name: "In the Green", desc: "More money in than out in a full month", earned: months.some((m) => m.complete && m.income > m.spend) },
    { id: "boss", emoji: "👑", name: "Budget Boss", desc: "Finish a month under your total budget", earned: months.some((m) => m.complete && m.underBudget) },
    { id: "streak3", emoji: "🔥", name: "On Fire", desc: "3 months in a row under budget", earned: streak >= 3 },
    { id: "quest", emoji: "⚔️", name: "Quest Slayer", desc: "Complete a savings quest", earned: won.length > 0 },
  ];

  return {
    xp,
    level,
    title: TITLES[Math.min(level - 1, TITLES.length - 1)],
    levelFloor: xpForLevel(level),
    levelCeil: xpForLevel(level + 1),
    streak,
    badges,
    log,
  };
}

export function healthScore(s: Summary, budgets: AppData["budgets"]): { score: number; notes: string[] } {
  let score = 100;
  const notes: string[] = [];
  if (!s.spend) return { score: 100, notes };
  for (const c of s.byCategory) {
    const b = periodBudget(budgets, c.id, s.days);
    if (b !== null && c.total > b) {
      score -= 8;
      notes.push(`${cat(c.id).label} over budget`);
    }
  }
  const tb = totalBudget(budgets);
  if (tb && s.spend > (tb * s.days) / 30.4) {
    score -= 15;
    notes.push("Total spending over budget");
  }
  const disc = s.byCategory.filter((c) => cat(c.id).discretionary).reduce((a, c) => a + c.total, 0);
  if (disc / s.spend > 0.4) {
    score -= 10;
    notes.push("Over 40% of spending is optional");
  }
  if (s.income && s.spend > s.income) {
    score -= 15;
    notes.push("Spent more than came in");
  }
  return { score: Math.max(0, Math.min(100, score)), notes };
}

/** Suggested monthly budgets from history, rounded up to the nearest $10. */
export function suggestBudgets(data: AppData): Partial<Record<CategoryId, number>> {
  const range = dataRange(data.transactions);
  if (!range) return {};
  const s = summarize(data.transactions, { key: "all", label: "", kind: "all", start: range.min, end: range.max });
  const out: Partial<Record<CategoryId, number>> = {};
  for (const c of s.byCategory) {
    const monthly = (c.total * 30.4) / Math.max(s.days, 1);
    const cut = CUTS[c.id] ? 1 - CUTS[c.id]! / 2 : 1; // nudge optional categories down a little
    out[c.id] = Math.max(10, Math.ceil((monthly * cut) / 10) * 10);
  }
  return out;
}

export { CATEGORIES };
