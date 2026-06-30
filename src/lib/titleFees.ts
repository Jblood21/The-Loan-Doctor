// Title-insurance premium schedule (title company rate card).
//
// Source: the uploaded "Title Fee Schedule" PDF. Premiums are indexed by amount
// "up to and including" each $10,000 tier, from $10,000 to $1,050,000 (105 tiers).
// Five policy columns per tier:
//   [0] Standard Owner's (Resid.)   — owner's policy, by purchase price
//   [1] ALTA Extended Loan Policy    — lender's/loan policy, by loan amount
//   [2] ALTA Homeowner's             — enhanced owner's policy, by purchase price
//   [3] Refinance / Builder Loan     — refinance loan policy, by loan amount
//   [4] Builder Owner's (65%)        — new-construction owner's, by purchase price
// Flat fees below are added on top of the applicable premium.

import type { ClosingCostItem, FeeBasis, TransactionType } from '@/types';

const STEP = 10000;
const MAX_TIER = 1050000;

/** 105 tiers x 5 policy columns. Row i covers amounts up to (i+1)*$10,000. */
export const TITLE_PREMIUMS: number[][] = [
  [200, 200, 220, 200, 200],
  [242, 200, 267, 200, 200],
  [284, 200, 313, 175, 200],
  [326, 229, 359, 201, 212],
  [368, 258, 405, 227, 240],
  [419, 294, 461, 258, 273],
  [470, 329, 517, 290, 306],
  [521, 365, 574, 321, 339],
  [572, 401, 630, 352, 372],
  [623, 437, 686, 384, 405],
  [669, 469, 736, 412, 435],
  [715, 501, 787, 440, 465],
  [761, 533, 838, 469, 495],
  [807, 565, 888, 497, 525],
  [853, 598, 939, 525, 555],
  [899, 630, 989, 553, 585],
  [945, 662, 1040, 582, 615],
  [991, 694, 1091, 610, 645],
  [1037, 726, 1141, 638, 675],
  [1083, 759, 1192, 667, 704],
  [1120, 784, 1232, 689, 728],
  [1157, 810, 1273, 712, 753],
  [1194, 836, 1314, 735, 777],
  [1231, 862, 1355, 758, 801],
  [1268, 888, 1395, 780, 825],
  [1305, 914, 1436, 803, 849],
  [1342, 940, 1477, 826, 873],
  [1379, 966, 1517, 849, 897],
  [1416, 992, 1558, 871, 921],
  [1453, 1018, 1599, 894, 945],
  [1490, 1043, 1639, 917, 969],
  [1527, 1069, 1680, 940, 993],
  [1564, 1095, 1721, 962, 1017],
  [1601, 1121, 1762, 985, 1041],
  [1638, 1147, 1802, 1008, 1065],
  [1675, 1173, 1843, 1031, 1089],
  [1712, 1199, 1884, 1053, 1113],
  [1749, 1225, 1924, 1076, 1137],
  [1786, 1251, 1965, 1099, 1161],
  [1823, 1277, 2006, 1122, 1185],
  [1860, 1302, 2046, 1144, 1209],
  [1897, 1328, 2087, 1167, 1234],
  [1934, 1354, 2128, 1190, 1258],
  [1971, 1380, 2169, 1213, 1282],
  [2008, 1406, 2209, 1235, 1306],
  [2045, 1432, 2250, 1258, 1330],
  [2082, 1458, 2291, 1281, 1354],
  [2119, 1484, 2331, 1304, 1378],
  [2156, 1510, 2372, 1326, 1402],
  [2193, 1536, 2413, 1349, 1426],
  [2212, 1549, 2434, 1361, 1438],
  [2231, 1562, 2455, 1373, 1451],
  [2250, 1575, 2475, 1384, 1463],
  [2269, 1589, 2496, 1396, 1475],
  [2288, 1602, 2517, 1408, 1488],
  [2307, 1615, 2538, 1419, 1500],
  [2326, 1629, 2559, 1431, 1512],
  [2345, 1642, 2580, 1443, 1525],
  [2364, 1655, 2601, 1454, 1537],
  [2383, 1669, 2622, 1466, 1549],
  [2402, 1682, 2643, 1478, 1562],
  [2421, 1695, 2664, 1489, 1574],
  [2440, 1708, 2684, 1501, 1586],
  [2459, 1722, 2705, 1513, 1599],
  [2478, 1735, 2726, 1524, 1611],
  [2497, 1748, 2747, 1536, 1624],
  [2516, 1762, 2768, 1548, 1636],
  [2535, 1775, 2789, 1560, 1648],
  [2554, 1788, 2810, 1571, 1661],
  [2573, 1802, 2831, 1583, 1673],
  [2592, 1815, 2852, 1595, 1685],
  [2611, 1828, 2873, 1606, 1698],
  [2630, 1841, 2893, 1618, 1710],
  [2649, 1855, 2914, 1630, 1722],
  [2668, 1868, 2935, 1641, 1735],
  [2687, 1881, 2956, 1653, 1747],
  [2706, 1895, 2977, 1665, 1759],
  [2725, 1908, 2998, 1676, 1772],
  [2744, 1921, 3019, 1688, 1784],
  [2763, 1935, 3040, 1700, 1796],
  [2782, 1948, 3061, 1711, 1809],
  [2801, 1961, 3082, 1723, 1821],
  [2820, 1974, 3102, 1735, 1833],
  [2839, 1988, 3123, 1746, 1846],
  [2858, 2001, 3144, 1758, 1858],
  [2877, 2014, 3165, 1770, 1871],
  [2896, 2028, 3186, 1782, 1883],
  [2915, 2041, 3207, 1793, 1895],
  [2934, 2054, 3228, 1805, 1908],
  [2953, 2068, 3249, 1817, 1920],
  [2972, 2081, 3270, 1828, 1932],
  [2991, 2094, 3291, 1840, 1945],
  [3010, 2107, 3311, 1852, 1957],
  [3029, 2121, 3332, 1863, 1969],
  [3048, 2134, 3353, 1875, 1982],
  [3067, 2147, 3374, 1887, 1994],
  [3086, 2161, 3395, 1898, 2006],
  [3105, 2174, 3416, 1910, 2019],
  [3124, 2187, 3437, 1922, 2031],
  [3143, 2201, 3458, 1933, 2043],
  [3162, 2214, 3479, 1945, 2056],
  [3181, 2227, 3500, 1957, 2068],
  [3200, 2240, 3520, 1968, 2080],
  [3219, 2254, 3541, 1980, 2093],
  [3238, 2267, 3562, 1992, 2105],
];

/** Look up a premium for an amount (rounded UP to the tier) in a given column 0-4. */
export function titlePremium(amount: number, col: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const c = Math.max(0, Math.min(4, col | 0));
  if (amount > MAX_TIER) {
    // Above the published table, extrapolate from the last $10k marginal rate.
    const last = TITLE_PREMIUMS[TITLE_PREMIUMS.length - 1][c];
    const prev = TITLE_PREMIUMS[TITLE_PREMIUMS.length - 2][c];
    const rate = (last - prev) / STEP;
    return Math.round(last + rate * (amount - MAX_TIER));
  }
  const idx = Math.max(0, Math.min(TITLE_PREMIUMS.length - 1, Math.ceil(amount / STEP) - 1));
  return TITLE_PREMIUMS[idx][c];
}

/** Schedule-driven fee bases: which column to read and whether priced by loan or price. */
export const TITLE_BASES: Record<string, { col: number; source: 'loan' | 'price'; label: string; short: string }> = {
  'title-owners': { col: 0, source: 'price', label: "Title: Owner's \u2014 Standard (Resid.)", short: "Owner's (Std)" },
  'title-homeowners': { col: 2, source: 'price', label: "Title: Owner's \u2014 ALTA Homeowner's", short: "Owner's (ALTA HO)" },
  'title-builder': { col: 4, source: 'price', label: "Title: Owner's \u2014 Builder (65%)", short: "Owner's (Builder)" },
  'title-loan': { col: 1, source: 'loan', label: "Title: Lender's \u2014 ALTA Loan Policy", short: "Lender's (ALTA)" },
  'title-refi': { col: 3, source: 'loan', label: "Title: Lender's \u2014 Refinance", short: "Lender's (Refi)" },
};

export function isTitleBasis(basis: string): boolean {
  return basis in TITLE_BASES;
}

/** Resolve a schedule-driven fee line to dollars from loan/price. Returns null if not a title basis. */
export function titleBasisAmount(basis: string, loan: number, price: number): number | null {
  const t = TITLE_BASES[basis];
  if (!t) return null;
  return titlePremium(t.source === 'loan' ? loan : price, t.col);
}

/** Flat title/settlement fees from the schedule, added on top of premiums. */
export const TITLE_FLAT_FEES: { label: string; value: number }[] = [
  { label: 'Closing / Settlement Fee', value: 225 },
  { label: 'Endorsements', value: 55 },
  { label: 'Courier / Wire Fee', value: 40 },
  { label: 'Closing Protection Letter (CPL)', value: 25 },
  { label: 'E-Recording', value: 10 },
  { label: 'Recording', value: 52 },
];

const TITLE_FLAT_LABELS = new Set(TITLE_FLAT_FEES.map((f) => f.label));

export interface TitleScheduleOpts {
  transaction?: TransactionType;
  /** Which owner's policy column to use on a purchase. */
  ownersBasis?: 'title-owners' | 'title-homeowners' | 'title-builder';
  /** 'full' = premiums + flat fees; 'premiums' = title premiums only. */
  mode?: 'full' | 'premiums';
  newId: () => string;
}

/** Build the title-related closing-cost lines for a scenario. */
export function buildTitleScheduleFees(opts: TitleScheduleOpts): ClosingCostItem[] {
  const { transaction = 'purchase', ownersBasis = 'title-owners', mode = 'full', newId } = opts;
  const items: ClosingCostItem[] = [];
  if (transaction === 'refinance') {
    items.push({ id: newId(), label: "Lender's Title Policy (Refi)", basis: 'title-refi' as FeeBasis, value: 0 });
  } else {
    items.push({ id: newId(), label: "Owner's Title Policy", basis: ownersBasis as FeeBasis, value: 0 });
    items.push({ id: newId(), label: "Lender's Title Policy", basis: 'title-loan' as FeeBasis, value: 0 });
  }
  if (mode === 'full') {
    for (const f of TITLE_FLAT_FEES) items.push({ id: newId(), label: f.label, basis: 'flat', value: f.value });
  }
  return items;
}

/** Replace any existing title premium lines + known flat title fees, keep the rest, then append a fresh set. */
export function applyTitleSchedule(items: ClosingCostItem[], opts: TitleScheduleOpts): ClosingCostItem[] {
  const kept = (items || []).filter((it) => !isTitleBasis(it.basis) && !TITLE_FLAT_LABELS.has(it.label));
  return [...kept, ...buildTitleScheduleFees(opts)];
}
