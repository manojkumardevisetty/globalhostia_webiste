// Reference renewal prices of a major registrar (USD), shown publicly only as "Others". Checked 2026-09-10.
// Update these when GoDaddy changes prices. Renewal is the fair comparison (first-year promos expire).
export const GODADDY_CHECKED = '2026-09-10';
export const GODADDY: Record<string, { reg: number; renew: number }> = {
  '.com': { reg: 5.19, renew: 23.19 }, '.net': { reg: 15.19, renew: 25.19 }, '.org': { reg: 10.19, renew: 24.19 },
  '.xyz': { reg: 2.19, renew: 26.19 }, '.io': { reg: 60.19, renew: 90.19 }, '.shop': { reg: 1.19, renew: 60.19 },
  '.online': { reg: 1.19, renew: 55.19 }, '.info': { reg: 6.19, renew: 42.19 }, '.co': { reg: 18.19, renew: 60.19 },
  '.ai': { reg: 105.19, renew: 160.19 }, '.in': { reg: 13.19, renew: 13.19 }, '.uk': { reg: 13.19, renew: 13.19 },
  '.de': { reg: 10.19, renew: 10.19 }, '.eu': { reg: 9.19, renew: 13.19 }, '.biz': { reg: 12.19, renew: 36.19 },
  '.store': { reg: 1.19, renew: 84.19 }, '.tech': { reg: 10.19, renew: 98.19 }, '.site': { reg: 1.19, renew: 55.19 },
};
