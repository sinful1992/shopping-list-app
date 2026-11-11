/**
 * SH-2 (audit 137, team task 142): database.rules.json lets a user reset their
 * own free-tier counters by writing a new `lastResetDate`. That is harmless
 * only while no tier has a numeric cap and nothing on the server reads the
 * counters. This guard fails the day a numeric cap comes back, so the rule is
 * tightened (or the cap moved server-side) in the same change.
 */
import fs from 'fs';
import path from 'path';
import { SUBSCRIPTION_LIMITS } from '../SubscriptionConfig';

const ROOT = path.resolve(__dirname, '..', '..', '..');

describe('SH-2 guard: free-limit counters', () => {
  it('no tier has a numeric cap while the reset rule stays client-trusted', () => {
    const rules = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
    const resetIsClientTrusted = rules.includes(
      "newData.child('usageCounters/lastResetDate').val() != data.child('usageCounters/lastResetDate').val()",
    );
    expect(resetIsClientTrusted).toBe(true); // if this changes, re-read SH-2 and update the guard
    const numericCaps = Object.entries(SUBSCRIPTION_LIMITS).flatMap(([tier, limits]) =>
      Object.entries(limits)
        .filter(([, v]) => typeof v === 'number')
        .map(([k, v]) => `${tier}.${k}=${v}`),
    );
    expect(numericCaps).toEqual([]);
  });

  it('no server code reads the usage counters', () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|js|mjs)$/.test(e.name) && /listsCreated|ocrProcessed|urgentItemsCreated/.test(fs.readFileSync(p, 'utf8'))) {
          hits.push(path.relative(ROOT, p));
        }
      }
    };
    walk(path.join(ROOT, 'functions', 'src'));
    walk(path.join(ROOT, 'supabase', 'functions'));
    expect(hits).toEqual([]);
  });
});
