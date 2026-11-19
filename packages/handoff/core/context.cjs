// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: how full the session's context is, and whether the one notice is due. The windows and the notice point are data (CONTEXT).
const { text: { safe: { clip }, lines: { filled } } } = require('@atlasbound/kit');
const WORDS = require('../contracts/words.json');

const TOKENS = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
const isMain = (row) => row && row.type === 'assistant' && !row.isSidechain && row.message && row.message.model !== '<synthetic>';
const mainUsage = (row) => (isMain(row) && row.message.usage) || null;

/** The window of `model` and what chose it; `env` as read at the edge: { max, no1m } -> { window, by } (window null: unknown). */
function windowOf(model, env, { windows, reduced, env: names }) {
  if (Number(env.max) > 0) return { window: Math.floor(Number(env.max)), by: names.max };
  const row = (model && windows.find((w) => w.id.test(model))) || { row: WORDS.windowUnknown, tokens: null };
  const off = row.tokens > reduced && env.no1m && !['0', 'false'].includes(String(env.no1m).toLowerCase());
  return off ? { window: reduced, by: `${row.row}, ${names.no1m}` } : { window: row.tokens, by: row.row };
}

/** The session's context now: the usage of the transcript's last main-thread assistant message (input + cache read + cache creation) and
 * its window when the count fits in it. `json`: text -> value or null. null: no such message in the text. */
function contextOf(text, { env, rules }, json) {
  const line = String(text || '').split('\n').findLast((l) => l.startsWith('{') && mainUsage(json(l)));
  if (!line) return null;
  const { message } = json(line);
  const tokens = TOKENS.reduce((sum, k) => sum + (Number(message.usage[k]) || 0), 0);
  const model = typeof message.model === 'string' ? message.model : null;
  const { window, by } = windowOf(model, env, rules);
  return window && tokens > window ? { tokens, model, window: null, by: filled(WORDS.countOver, { by }) } : { tokens, model, window, by };
}

const isDue = ({ tokens, window }, { percent, unknownTokens }) => (window ? tokens * 100 >= window * percent : tokens >= unknownTokens);

/** Unread says nothing; once said, never again in the session. */
function noticeCode(seen, before, rules) {
  if (!seen) return 'context-unread';
  if (before && before.noticed) return 'context-noticed';
  return isDue(seen, rules) ? 'context-notice' : 'context-below';
}

/** The tokens always; the percentage only beside a known window. `modelChars`: how much of a model's name the line names. */
function contextLine(seen, modelChars) {
  const count = filled(WORDS.contextHolds, { tokens: seen.tokens.toLocaleString('en-US') });
  if (!seen.window) return filled(WORDS.contextUnknown, { count, model: clip(seen.model || 'this model', modelChars) });
  return `${count} (${Math.round((seen.tokens * 100) / seen.window)} % of ${seen.window.toLocaleString('en-US')})`;
}

module.exports = { contextOf, noticeCode, contextLine };
