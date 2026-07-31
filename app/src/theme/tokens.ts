import { oklchToHex } from "./oklch";

export const colors = {
  canvas: "#F6F4EF",
  surface: "#FFFFFF",
  surfaceSheet: "#FBFAF7",
  ink: "#1B1A17",
  ink70: "rgba(27,26,23,.70)",
  ink55: "rgba(27,26,23,.55)",
  ink52: "rgba(27,26,23,.52)",
  ink50: "rgba(27,26,23,.50)",
  ink48: "rgba(27,26,23,.48)",
  ink45: "rgba(27,26,23,.45)",
  ink42: "rgba(27,26,23,.42)",
  ink38: "rgba(27,26,23,.38)",
  ink35: "rgba(27,26,23,.35)",
  ink16: "rgba(27,26,23,.16)",
  ink14: "rgba(27,26,23,.14)",
  ink06: "rgba(27,26,23,.06)",
  ink07: "rgba(27,26,23,.07)",
  ink08: "rgba(27,26,23,.08)",
  ink04: "rgba(27,26,23,.04)",
  ink20: "rgba(27,26,23,.2)",
  ink40: "rgba(27,26,23,.4)",
  hairline: "rgba(27,26,23,.06)",
  track: "rgba(27,26,23,.07)",
  onDark: "#F6F4EF",
  onDark60: "rgba(246,244,239,.6)",
  onDark50: "rgba(246,244,239,.5)",
  onDark40: "rgba(246,244,239,.4)",
  onDark15: "rgba(246,244,239,.15)",
  scrim: "rgba(27,26,23,.4)",

  success: oklchToHex(0.6, 0.09, 158),
  successText: oklchToHex(0.48, 0.08, 158),
  successRing: oklchToHex(0.8, 0.12, 158),
  successAvatarBg: oklchToHex(0.88, 0.05, 158),
  successAvatarText: oklchToHex(0.42, 0.07, 158),
  successTintCard: oklchToHex(0.94, 0.035, 158),
  successEmptyCircle: oklchToHex(0.92, 0.06, 158),
  successDoneCircle: oklchToHex(0.9, 0.07, 158),

  warnBg: oklchToHex(0.95, 0.045, 78),
  warnBorder: oklchToHex(0.88, 0.06, 78),
  warnSolid: oklchToHex(0.8, 0.13, 72),
  warnText: oklchToHex(0.55, 0.12, 62),
  warnRowBg: oklchToHex(0.97, 0.028, 78),

  over: oklchToHex(0.62, 0.14, 40),
};

export type CategoryId =
  | "Food"
  | "Groceries"
  | "Transport"
  | "Shopping"
  | "Bills"
  | "Entertainment"
  | "Health"
  | "Travel"
  | "Other";

const CATEGORY_HUES: Record<CategoryId, number> = {
  Food: 45,
  Groceries: 145,
  Transport: 235,
  Entertainment: 15,
  Shopping: 300,
  Bills: 190,
  Health: 350,
  Travel: 265,
  Other: 80,
};

export const CATEGORIES: CategoryId[] = [
  "Food",
  "Groceries",
  "Transport",
  "Shopping",
  "Bills",
  "Entertainment",
  "Health",
  "Travel",
  "Other",
];

// Money coming in needs its own taxonomy -- "Groceries"/"Transport" etc. don't mean anything for
// a salary deposit or a PayNow transfer received. "Transfer Received" specifically covers the
// PayNow-received bank alerts this app already parses.
export const CREDIT_CATEGORIES: string[] = [
  "Salary",
  "Transfer Received",
  "Refund",
  "Reimbursement",
  "Interest",
  "Gift",
  "Investment",
  "Other Income",
];

const CREDIT_CATEGORY_HUES: Record<string, number> = {
  Salary: 150,
  "Transfer Received": 170,
  Refund: 190,
  Reimbursement: 130,
  Interest: 200,
  Gift: 320,
  Investment: 210,
  "Other Income": 100,
};

export const FOOD_SUBCATEGORIES = ["Breakfast", "Lunch", "Dinner", "Beverage", "Others"] as const;
export const TRANSPORT_SUBCATEGORIES = ["Public", "Private", "Others"] as const;
export const TRAVEL_SUBCATEGORIES = [
  "Food",
  "Groceries",
  "Transport",
  "Shopping",
  "Entertainment",
  "Accommodations",
] as const;

export function subcategoriesFor(category: string): readonly string[] | null {
  if (category === "Food") return FOOD_SUBCATEGORIES;
  if (category === "Transport") return TRANSPORT_SUBCATEGORIES;
  if (category === "Travel") return TRAVEL_SUBCATEGORIES;
  return null;
}

/** Deterministic fallback hue for custom categories that aren't in the fixed CATEGORY_HUES map,
 * so they get a stable color with no need to store a hue server-side. */
function hashHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % 360;
}

function hueFor(id: string): number {
  return CATEGORY_HUES[id as CategoryId] ?? CREDIT_CATEGORY_HUES[id] ?? hashHue(id);
}

// "Uncategorized" isn't a real category -- give it a fixed neutral gray (chroma 0) at each
// function's usual lightness, rather than a hashed hue that could coincidentally collide with a
// real category's color and be misread as one.
const UNCATEGORIZED = "Uncategorized";

export function categoryColor(id: string): string {
  return id === UNCATEGORIZED ? oklchToHex(0.72, 0, 0) : oklchToHex(0.72, 0.1, hueFor(id));
}

export function categoryColorChip(id: string): string {
  return id === UNCATEGORIZED ? oklchToHex(0.62, 0, 0) : oklchToHex(0.62, 0.11, hueFor(id));
}

export function categoryColorBar(id: string): string {
  return id === UNCATEGORIZED ? oklchToHex(0.8, 0, 0) : oklchToHex(0.8, 0.08, hueFor(id));
}

export const friendHues = { green: 158, warm: 78, purple: 300 };
export function friendAvatarBg(hue: number): string {
  return oklchToHex(0.88, 0.05, hue);
}
export function friendAvatarText(hue: number): string {
  return oklchToHex(0.42, 0.07, hue);
}

export const typography = {
  fontFamily: {
    sans: "DMSans_400Regular",
    sansMedium: "DMSans_500Medium",
    serif: "InstrumentSerif_400Regular",
    mono: "JetBrainsMono_400Regular",
  },
  size: {
    xs: 10,
    xs5: 10.5,
    sm: 12,
    sm5: 12.5,
    base: 13,
    base5: 13.5,
    md: 14,
    md5: 14.5,
    lg: 15,
    xl: 17,
    displaySm: 18,
    displayMd: 20,
    displayLg: 21,
    displayXl: 22,
    title: 26,
    titleLg: 27,
    heading: 30,
    numberSm: 32,
    numberMd: 38,
    numberLg: 40,
    numberXl: 46,
    numberXxl: 52,
  },
};

export const spacing = {
  xs: 6,
  sm: 8,
  md: 10,
  lg: 14,
  xl: 18,
  xxl: 22,
  xxxl: 26,
  screenH: 22,
  screenTop: 58,
  screenBottom: 96,
};

export const radii = {
  chip: 12,
  pill: 9,
  card: 20,
  hero: 24,
  quickSort: 26,
  sheet: 28,
};

export const shadow = {
  card: {
    shadowColor: "#1B1A17",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  hero: {
    shadowColor: "#1B1A17",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 4,
  },
  quickSortCard: {
    shadowColor: "#1B1A17",
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.4,
    shadowRadius: 40,
    elevation: 8,
  },
} as const;
