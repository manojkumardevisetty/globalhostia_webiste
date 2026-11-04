// Results maths for A/B tests: conversion rate, uplift, two-proportion z-test, Bayesian probability to beat the control
// (Beta(1,1) prior, normal approximation of the posterior difference) and minimum-sample guidance. Pure, unit-tested.
import type { AbMetric } from './core';

export type Counts = { views: number; visitors: number; cta: number; carts: number; orders: number; revenue: number };
export const ZERO: Counts = { views: 0, visitors: 0, cta: 0, carts: 0, orders: 0, revenue: 0 };
export const MIN_VISITORS = 100;     // per variant, before any verdict
export const MIN_CONVERSIONS = 10;   // per variant (control and the variant), before any verdict
export const ALPHA = 0.05;

/** Standard normal CDF (Abramowitz–Stegun 7.1.26, |error| < 1.5e-7). */
export function phi(z: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

/** Two-sided two-proportion z-test. p = 1 when there is nothing to compare. */
export function zTest(cA: number, nA: number, cB: number, nB: number) {
  if (nA <= 0 || nB <= 0) return { z: 0, p: 1 };
  const pool = (cA + cB) / (nA + nB);
  const se = Math.sqrt(pool * (1 - pool) * (1 / nA + 1 / nB));
  if (!(se > 0)) return { z: 0, p: 1 };
  const z = (cB / nB - cA / nA) / se;
  return { z, p: Math.min(1, 2 * (1 - phi(Math.abs(z)))) };
}

/** P(rate B > rate A) with Beta(1 + conversions, 1 + misses) posteriors. */
export function probBeats(cA: number, nA: number, cB: number, nB: number) {
  const beta = (c: number, n: number) => { const a = 1 + c, b = 1 + Math.max(0, n - c); return { m: a / (a + b), v: (a * b) / ((a + b) ** 2 * (a + b + 1)) }; };
  const A = beta(cA, nA), B = beta(cB, nB);
  const sd = Math.sqrt(A.v + B.v);
  return sd > 0 ? phi((B.m - A.m) / sd) : 0.5;
}

/** Visitors per variant to detect a relative lift `mde` on base rate `p` (two-sided α 0.05, power 80%). */
export function sampleNeeded(p: number, mde = 0.2) {
  if (!(p > 0 && p < 1)) return 0;
  const p2 = Math.min(0.999, p * (1 + mde));
  const zA = 1.959964, zB = 0.841621;
  return Math.ceil(((zA + zB) ** 2 * (p * (1 - p) + p2 * (1 - p2))) / (p2 - p) ** 2);
}

/** The count that converts for a metric (revenue tests use orders for significance and report revenue per visitor). */
export const conversions = (c: Counts, m: AbMetric) => Math.min(c.visitors, m === 'cta' ? c.cta : m === 'cart' ? c.carts : c.orders);

export type Verdict = 'control' | 'collecting' | 'winning' | 'losing' | 'flat';
export type Row = Counts & { key: string; rate: number; rpv: number; uplift: number | null; rpvUplift: number | null; p: number | null; prob: number | null; verdict: Verdict; note: string };

/** One results row per variant (index 0 = control). */
export function analyse(variants: (Counts & { key: string })[], metric: AbMetric): Row[] {
  const ctl = variants[0];
  const cC = ctl ? conversions(ctl, metric) : 0;
  const rateC = ctl && ctl.visitors ? cC / ctl.visitors : 0;
  const rpvC = ctl && ctl.visitors ? ctl.revenue / ctl.visitors : 0;
  return variants.map((v, i) => {
    const c = conversions(v, metric);
    const rate = v.visitors ? c / v.visitors : 0;
    const rpv = v.visitors ? v.revenue / v.visitors : 0;
    if (i === 0) return { ...v, rate, rpv, uplift: null, rpvUplift: null, p: null, prob: null, verdict: 'control' as const, note: 'Baseline' };
    const uplift = rateC > 0 ? rate / rateC - 1 : null;
    const rpvUplift = rpvC > 0 ? rpv / rpvC - 1 : null;
    const { p } = zTest(cC, ctl.visitors, c, v.visitors);
    const prob = ctl.visitors && v.visitors ? probBeats(cC, ctl.visitors, c, v.visitors) : null;
    const fewVisitors = Math.min(ctl.visitors, v.visitors) < MIN_VISITORS;
    const fewConv = Math.min(cC, c) < MIN_CONVERSIONS;
    let verdict: Verdict, note: string;
    if (fewVisitors || fewConv) {
      verdict = 'collecting';
      const base = rateC || rate;
      const need = sampleNeeded(base || 0.02);
      note = `Not significant yet: wait for at least ${MIN_VISITORS} visitors and ${MIN_CONVERSIONS} conversions in each group${need ? ` (about ${need.toLocaleString('en-US')} visitors per group to detect a 20% lift${base ? '' : ' at a typical 2% conversion rate'})` : ''}.`;
    } else if (p < ALPHA && rate > rateC) { verdict = 'winning'; note = `Significant: beats the control (p = ${p.toFixed(3)}).`; }
    else if (p < ALPHA && rate < rateC) { verdict = 'losing'; note = `Significant: worse than the control (p = ${p.toFixed(3)}).`; }
    else { verdict = 'flat'; note = `Not significant yet (p = ${p.toFixed(2)}). Keep it running, or treat the variants as equal.`; }
    return { ...v, rate, rpv, uplift, rpvUplift, p, prob, verdict, note };
  });
}

export function sumCounts(rows: Partial<Counts>[]): Counts {
  const o = { ...ZERO };
  for (const r of rows) for (const k of Object.keys(ZERO) as (keyof Counts)[]) o[k] += Number(r[k]) || 0;
  return o;
}
