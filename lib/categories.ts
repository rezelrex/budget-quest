export type CategoryId =
  | "food"
  | "coffee"
  | "groceries"
  | "transport"
  | "bills"
  | "subscriptions"
  | "health"
  | "shopping"
  | "entertainment"
  | "people"
  | "other"
  | "income";

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  /** Spending you can realistically cut back on */
  discretionary: boolean;
  hint: string;
}

export const CATEGORIES: Category[] = [
  { id: "food", label: "Food & Dining", emoji: "🍜", discretionary: true, hint: "Hawkers, restaurants, fast food, delivery, snacks" },
  { id: "coffee", label: "Coffee & Bubble Tea", emoji: "🧋", discretionary: true, hint: "Cafés, coffee chains, bubble tea, drinks stalls" },
  { id: "groceries", label: "Groceries & Essentials", emoji: "🛒", discretionary: false, hint: "Supermarkets, pharmacies, convenience stores" },
  { id: "transport", label: "Transport", emoji: "🚇", discretionary: false, hint: "Bus/MRT, Grab rides, bike share, fuel, parking" },
  { id: "bills", label: "Utilities & Bills", emoji: "💡", discretionary: false, hint: "SP utilities, town council, insurance, rent" },
  { id: "subscriptions", label: "Subscriptions & Telco", emoji: "📱", discretionary: true, hint: "Phone plans, software, streaming, cloud services" },
  { id: "health", label: "Health", emoji: "🦷", discretionary: false, hint: "Clinics, dental, gym, medical" },
  { id: "shopping", label: "Shopping", emoji: "🛍️", discretionary: true, hint: "Online shopping, retail, clothing, gadgets" },
  { id: "entertainment", label: "Fun & Leisure", emoji: "🎮", discretionary: true, hint: "Games, movies, events, hobbies" },
  { id: "people", label: "Transfers to People", emoji: "🤝", discretionary: false, hint: "PayNow/FAST to individuals" },
  { id: "other", label: "Other", emoji: "📦", discretionary: false, hint: "Anything that doesn't fit, unknown merchants" },
  { id: "income", label: "Money In", emoji: "💰", discretionary: false, hint: "Salary, refunds, cashback, transfers received" },
];

export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as CategoryId[];
export const SPEND_CATEGORIES = CATEGORIES.filter((c) => c.id !== "income");

export function cat(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES.find((c) => c.id === "other")!;
}
