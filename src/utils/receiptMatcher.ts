import type { Item, ReceiptLineItem } from '../models/types';

export interface MatchCandidate {
  listItem: Item;
  receiptItem: ReceiptLineItem;
  receiptIndex: number;
  score: number;
  method: 'token' | 'dice' | 'manual';
}

export interface UnmatchedReceiptEntry {
  item: ReceiptLineItem;
  index: number;
}

export interface MatchResult {
  matches: MatchCandidate[];
  unmatchedReceipt: UnmatchedReceiptEntry[];
  unmatchedList: Item[];
}

const TOKEN_THRESHOLD = 0.6;
const DICE_THRESHOLD = 0.55;

const NOISE_WORDS = new Set([
  'tesco', 'lidl', 'aldi', 'asda', 'sainsbury', 'sainsburys',
  'morrisons', 'coop', 'waitrose', 'iceland', 'm&s',
  'kg', 'g', 'ml', 'cl', 'l', 'ltr', 'pk', 'pcs', 'pc', 'ea', 'x',
]);

const TOKEN_SPLIT = /[\s.,()\-/]+/;
const DIGIT_ONLY = /^\d+$/;

export function stem(token: string): string {
  if (token.endsWith('ies')) {
    return token.length > 4 ? token.slice(0, -3) + 'y' : token;
  }
  if (token.length > 3 && token.endsWith('oes')) {
    return token.slice(0, -2);
  }
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function normalize(input: string): string {
  return input.normalize('NFKC').toLowerCase().trim();
}

export function tokenize(input: string): string[] {
  return normalize(input)
    .split(TOKEN_SPLIT)
    .filter(t => t.length > 0)
    .map(stem);
}

function stripNoise(tokens: string[]): string[] {
  return tokens.filter(t => !NOISE_WORDS.has(t) && !DIGIT_ONLY.test(t));
}

function bigrams(s: string): string[] {
  if (s.length < 2) return [];
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) {
    out.push(s.slice(i, i + 2));
  }
  return out;
}

export function dice(a: string, b: string): number {
  const aNorm = normalize(a);
  const bNorm = normalize(b);
  if (aNorm.length < 2 || bNorm.length < 2) {
    return aNorm === bNorm && aNorm.length > 0 ? 1 : 0;
  }
  const aBigrams = bigrams(aNorm);
  const bBigrams = bigrams(bNorm);

  const counts = new Map<string, number>();
  for (const bg of aBigrams) counts.set(bg, (counts.get(bg) ?? 0) + 1);

  let intersection = 0;
  for (const bg of bBigrams) {
    const c = counts.get(bg);
    if (c && c > 0) {
      intersection++;
      counts.set(bg, c - 1);
    }
  }

  return (2 * intersection) / (aBigrams.length + bBigrams.length);
}

const MIN_DICE_TOKEN_LEN = 4;

function bestDice(listTokens: string[], receiptTokens: string[]): number {
  let best = 0;
  for (const lt of listTokens) {
    if (lt.length < MIN_DICE_TOKEN_LEN) continue;
    for (const rt of receiptTokens) {
      if (rt.length < MIN_DICE_TOKEN_LEN) continue;
      const s = dice(lt, rt);
      if (s > best) best = s;
    }
  }
  return best;
}

interface PairScore {
  score: number;
  method: 'token' | 'dice';
  matched: number;
}

function scorePair(listTokens: string[], receiptTokens: string[]): PairScore {
  if (listTokens.length === 0 || receiptTokens.length === 0) {
    return { score: 0, method: 'token', matched: 0 };
  }

  const receiptSet = new Set(receiptTokens);
  let matched = 0;
  for (const t of listTokens) {
    if (receiptSet.has(t)) matched++;
  }

  if (matched === listTokens.length) {
    return { score: 1, method: 'token', matched };
  }
  if (matched >= 1) {
    const denom = Math.min(listTokens.length, receiptTokens.length);
    const exactScore = matched / denom;

    // For unmatched tokens, check dice to handle typos/variants ("chocolate" vs "chocolat")
    const unmatchedList = listTokens.filter(t => !receiptSet.has(t));
    const matchedReceiptTokens = new Set(listTokens.filter(t => receiptSet.has(t)));
    const unusedReceipt = receiptTokens.filter(t => !matchedReceiptTokens.has(t));
    let diceBonus = 0;
    for (const lt of unmatchedList) {
      if (lt.length < MIN_DICE_TOKEN_LEN) continue;
      let best = 0;
      for (const rt of unusedReceipt) {
        if (rt.length < MIN_DICE_TOKEN_LEN) continue;
        const s = dice(lt, rt);
        if (s > best) best = s;
      }
      if (best >= DICE_THRESHOLD) diceBonus += best / denom;
    }

    return { score: Math.min(1, exactScore + diceBonus), method: 'token', matched };
  }
  return { score: bestDice(listTokens, receiptTokens), method: 'dice', matched: 0 };
}

function lineTotal(line: ReceiptLineItem): number | null {
  if (line.price != null) return line.price;
  if (line.unitPrice != null) return line.unitPrice * (line.quantity != null && line.quantity > 0 ? line.quantity : 1);
  return null;
}

/**
 * The per-unit price to store on a list item from the receipt lines linked to
 * it. Item.price is per-unit app-wide (totals multiply by unitQty), while a
 * receipt line's price is the line total.
 *
 * One line keeps the line's own unit price when the item counts more than one
 * unit. Several lines (the same product rung up twice) are summed and spread
 * over the item's units, so price x unitQty is what was actually paid.
 */
export function unitPriceFromLines(lines: ReceiptLineItem[], unitQty: number): number | null {
  if (lines.length === 0) return null;
  const qty = unitQty > 0 ? unitQty : 1;

  if (lines.length === 1) {
    const line = lines[0];
    if (qty === 1) return line.price ?? line.unitPrice;
    const lineQty = line.quantity != null && line.quantity > 0 ? line.quantity : qty;
    return line.unitPrice ?? (line.price != null ? line.price / lineQty : null);
  }

  let total = 0;
  for (const line of lines) {
    const t = lineTotal(line);
    if (t == null) return null;
    total += t;
  }
  return total / qty;
}

export function matchReceiptToList(
  receiptItems: ReceiptLineItem[],
  listItems: Item[],
): MatchResult {
  const eligibleReceipt = receiptItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.price != null && item.description.trim().length > 0);

  const receiptPrep = eligibleReceipt.map(({ item, index }) => ({
    item,
    index,
    tokens: stripNoise(tokenize(item.description)),
    description: item.description,
  }));

  const listPrep = listItems.map(item => ({
    item,
    tokens: tokenize(item.name),
    name: item.name,
  }));

  interface ScoredCandidate extends MatchCandidate {
    matched: number;
    listTokenCount: number;
  }

  const candidates: ScoredCandidate[] = [];
  for (const l of listPrep) {
    for (const r of receiptPrep) {
      const { score, method, matched } = scorePair(l.tokens, r.tokens);
      const threshold = method === 'token' ? TOKEN_THRESHOLD : DICE_THRESHOLD;
      if (score >= threshold) {
        candidates.push({
          listItem: l.item,
          receiptItem: r.item,
          receiptIndex: r.index,
          score,
          method,
          matched,
          listTokenCount: l.tokens.length,
        });
      }
    }
  }

  candidates.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.method !== b.method) return a.method === 'token' ? -1 : 1;
    if (b.matched !== a.matched) return b.matched - a.matched;
    return b.listTokenCount - a.listTokenCount;
  });

  const assignedListIds = new Set<string>();
  const assignedReceiptIndices = new Set<number>();
  const matches: MatchCandidate[] = [];
  for (const c of candidates) {
    if (assignedListIds.has(c.listItem.id)) continue;
    if (assignedReceiptIndices.has(c.receiptIndex)) continue;
    matches.push({
      listItem: c.listItem,
      receiptItem: c.receiptItem,
      receiptIndex: c.receiptIndex,
      score: c.score,
      method: c.method,
    });
    assignedListIds.add(c.listItem.id);
    assignedReceiptIndices.add(c.receiptIndex);
  }

  const unmatchedReceipt = receiptPrep
    .filter(({ index }) => !assignedReceiptIndices.has(index))
    .map(({ item, index }) => ({ item, index }));

  const unmatchedList = listItems.filter(item => !assignedListIds.has(item.id));

  return { matches, unmatchedReceipt, unmatchedList };
}
