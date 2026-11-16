// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: THE context rule. A hook text stays in the agent's context, so within one context a key's first text is said in full, the same text
// never again, a new one as its short form; no key: every time. A start that does not keep the transcript begins anew.
const { hash: { sha256 } } = require('@atlasbound/kit');
const { EVENTS } = require('../contracts/shapes.cjs');

const startsAnew = (event, payload) => event === 'SessionStart' && !EVENTS.SessionStart.keeps.includes(payload && payload.source);

const foldSaid = (rows) => rows.slice(rows.findLastIndex((row) => row.anew) + 1)
  .reduce((m, { k, d }) => m.set(k, new Set([...(m.get(k) || []), d])), new Map());

/** A reason is never held, only shortened: a refusal is the reminder its event needs. */
const asOf = (seen, d, { short, reason }) => ((seen && seen.has(d) && !reason) ? null : (seen && short ? 'short' : 'full'));
/** `sizes`: per item, whose it is, its key and form (`as`: full, short, or null when held) and the characters said and held back (a short
 * form holds the rest of its text), what debug inject sums and the hook port's hook.said rows say. */
function sayNow(record, items) {
  const known = new Map(record);
  const out = { texts: [], reasons: [], rows: [], sizes: [] };
  for (const item of items) {
    const d = sha256(item.text);
    const seen = item.key && known.get(item.key);
    const as = asOf(seen, d, item);
    const text = as === 'short' ? item.short : as ? item.text : '';
    out.sizes.push({ pkg: item.pkg || 'cli', key: item.key, as, said: text.length, held: Math.max(0, item.text.length - text.length), reason: Boolean(item.reason) });
    if (!as) continue;
    out[item.reason ? 'reasons' : 'texts'].push(text);
    if (!item.key) continue;
    out.rows.push({ k: item.key, d, as });
    known.set(item.key, new Set([...(seen || []), d]));
  }
  return { ...out, n: { items: items.length, said: out.texts.length + out.reasons.length, short: out.rows.filter((r) => r.as === 'short').length } };
}

module.exports = { startsAnew, foldSaid, sayNow };
