// Arabic contextual shaping for the OG image generator (app/og/route.tsx). satori draws Arabic with its joining forms
// but measures each word with the wider isolated letters, so words get gaps and drift. Converting the text to the
// Unicode presentation forms (U+FE70–U+FEFC, present in IBM Plex Sans Arabic) first makes measuring and drawing agree.
// Pure module (edge-safe): tests/seo-og.test.mts.

// [isolated, final, initial, medial] — right-joining letters have only the first two
const FORMS: Record<number, number[]> = {
  0x0621: [0xfe80], 0x0622: [0xfe81, 0xfe82], 0x0623: [0xfe83, 0xfe84], 0x0624: [0xfe85, 0xfe86], 0x0625: [0xfe87, 0xfe88],
  0x0626: [0xfe89, 0xfe8a, 0xfe8b, 0xfe8c], 0x0627: [0xfe8d, 0xfe8e], 0x0628: [0xfe8f, 0xfe90, 0xfe91, 0xfe92], 0x0629: [0xfe93, 0xfe94],
  0x062a: [0xfe95, 0xfe96, 0xfe97, 0xfe98], 0x062b: [0xfe99, 0xfe9a, 0xfe9b, 0xfe9c], 0x062c: [0xfe9d, 0xfe9e, 0xfe9f, 0xfea0],
  0x062d: [0xfea1, 0xfea2, 0xfea3, 0xfea4], 0x062e: [0xfea5, 0xfea6, 0xfea7, 0xfea8], 0x062f: [0xfea9, 0xfeaa], 0x0630: [0xfeab, 0xfeac],
  0x0631: [0xfead, 0xfeae], 0x0632: [0xfeaf, 0xfeb0], 0x0633: [0xfeb1, 0xfeb2, 0xfeb3, 0xfeb4], 0x0634: [0xfeb5, 0xfeb6, 0xfeb7, 0xfeb8],
  0x0635: [0xfeb9, 0xfeba, 0xfebb, 0xfebc], 0x0636: [0xfebd, 0xfebe, 0xfebf, 0xfec0], 0x0637: [0xfec1, 0xfec2, 0xfec3, 0xfec4],
  0x0638: [0xfec5, 0xfec6, 0xfec7, 0xfec8], 0x0639: [0xfec9, 0xfeca, 0xfecb, 0xfecc], 0x063a: [0xfecd, 0xfece, 0xfecf, 0xfed0],
  0x0641: [0xfed1, 0xfed2, 0xfed3, 0xfed4], 0x0642: [0xfed5, 0xfed6, 0xfed7, 0xfed8], 0x0643: [0xfed9, 0xfeda, 0xfedb, 0xfedc],
  0x0644: [0xfedd, 0xfede, 0xfedf, 0xfee0], 0x0645: [0xfee1, 0xfee2, 0xfee3, 0xfee4], 0x0646: [0xfee5, 0xfee6, 0xfee7, 0xfee8],
  0x0647: [0xfee9, 0xfeea, 0xfeeb, 0xfeec], 0x0648: [0xfeed, 0xfeee], 0x0649: [0xfeef, 0xfef0], 0x064a: [0xfef1, 0xfef2, 0xfef3, 0xfef4],
};
// lam + alef variants → ligature [isolated, final]
const LAM_ALEF: Record<number, [number, number]> = { 0x0622: [0xfef5, 0xfef6], 0x0623: [0xfef7, 0xfef8], 0x0625: [0xfef9, 0xfefa], 0x0627: [0xfefb, 0xfefc] };
const TATWEEL = 0x0640;
/** harakat and other marks do not break or take part in joining */
const isMark = (c: number) => (c >= 0x064b && c <= 0x065f) || c === 0x0670 || (c >= 0x06d6 && c <= 0x06ed);
const dual = (c: number | undefined) => c === TATWEEL || (c !== undefined && (FORMS[c]?.length || 0) === 4);
const joins = (c: number | undefined) => c === TATWEEL || (c !== undefined && (FORMS[c]?.length || 0) >= 2);

/** Arabic text → presentation forms, in logical order. */
export function shapeArabic(text: string): string {
  const cs = [...text].map((ch) => ch.codePointAt(0)!);
  const out: number[] = [];
  const prevBase = (i: number) => { for (let j = i - 1; j >= 0; j--) if (!isMark(cs[j])) return cs[j]; return undefined; };
  const nextBase = (i: number) => { for (let j = i + 1; j < cs.length; j++) if (!isMark(cs[j])) return { c: cs[j], at: j }; return undefined; };
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    const f = FORMS[c];
    if (!f) { out.push(c); continue; }
    const p = prevBase(i);
    const linkPrev = dual(p);
    const n = nextBase(i);
    if (c === 0x0644 && n && LAM_ALEF[n.c]) { // lam-alef ligature (right-joining)
      for (let j = i + 1; j < n.at; j++) out.push(cs[j]); // marks on the lam
      out.push(LAM_ALEF[n.c][linkPrev ? 1 : 0]);
      i = n.at;
      continue;
    }
    const linkNext = f.length === 4 && joins(n?.c);
    out.push(f.length === 1 ? f[0] : linkPrev && linkNext ? f[3] : linkPrev ? f[1] : linkNext ? f[2] : f[0]);
  }
  return String.fromCodePoint(...out);
}

/**
 * One word for satori: shaped, then in visual (left-to-right drawing) order. satori does no bidi reordering, so the
 * letters are reversed here; a base letter keeps its marks after it, and digit / Latin runs inside the word keep
 * their own left-to-right order.
 */
export function visualArabicWord(word: string): string {
  const cs = [...shapeArabic(word)];
  const clusters: string[][] = [];
  for (const ch of cs) {
    const c = ch.codePointAt(0)!;
    const last = clusters[clusters.length - 1];
    const ltr = /[0-9A-Za-z.,%$+\-/]/.test(ch);
    if (last && (isMark(c) || (ltr && (last as any).ltr))) { last.push(ch); continue; }
    const k: string[] & { ltr?: boolean } = [ch]; k.ltr = ltr; clusters.push(k);
  }
  return clusters.reverse().map((k) => k.join('')).join('');
}
