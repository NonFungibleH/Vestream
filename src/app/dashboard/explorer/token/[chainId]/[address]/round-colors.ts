// Shared round colour palette so the chart bands and the rounds list use the
// same colour for the same round index.
export const ROUND_COLORS = [
  "#1CB8B8", "#7c3aed", "#F0992E", "#3FA568",
  "#2563eb", "#E063A0", "#0BA0CB", "#B3322E",
];

export const roundColor = (i: number): string => ROUND_COLORS[i % ROUND_COLORS.length];
