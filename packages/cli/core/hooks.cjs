// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: the hook logic: which handlers an event reaches, the one row that wakes the port, the merged verdict, a lost verdict, the reply in
// the host's protocol.
const { text: { secrets: { scrub }, shell: { writtenBy } } } = require('@atlasbound/kit');
const { EVENTS, SHELL_GATE } = require('../contracts/shapes.cjs');
const { shortOf } = require('../contracts/codes.cjs');

const PLAIN = /^[A-Za-z0-9_|]+$/;
const RANK = ['deny', 'ask', 'allow'];

function fires(matcher, value) {
  if (!matcher) return true;
  return PLAIN.test(matcher) ? matcher.split('|').includes(value) : new RegExp(matcher).test(value);
}

/** A regex in the union anchors the plain lists, so `Edit` never wakes on `NotebookEdit`. */
function unionOf(matchers) {
  if (matchers.some((m) => !m)) return null;
  const unique = [...new Set(matchers)];
  if (unique.every((m) => PLAIN.test(m))) return [...new Set(unique.flatMap((m) => m.split('|')))].join('|');
  return unique.map((m) => (PLAIN.test(m) ? `^(?:${m})$` : `(?:${m})`)).join('|');
}

const declaredFor = (manifests, event) => manifests.flatMap(({ name, hooks }) => (hooks || []).filter((h) => h.event === event)
  .map((h) => ({ pkg: name, handler: h.handler, matcher: h.matcher, timeout: h.timeout })));

/** The rows that wake the port: one per event a package declared a handler for, and the port's own shell gate with them. */
function portRows(manifests) {
  return Object.keys(EVENTS).flatMap((event) => {
    const declared = [...declaredFor(manifests, event), ...[SHELL_GATE].filter((row) => row.event === event)];
    if (!declared.length) return [];
    return [{ event, matcher: unionOf(declared.map((d) => d.matcher)), timeout: Math.max(...declared.map((d) => d.timeout)) }];
  });
}

const reached = (manifests, event, payload) => {
  const on = EVENTS[event].on;
  return declaredFor(manifests, event).filter((d) => !on || fires(d.matcher, payload[on]));
};

/** Whether a row these manifests wire (the port's own shell gate among them) wakes on this event and payload. */
const wakes = (manifests, event, payload) => reached([{ name: 'port', hooks: portRows(manifests) }], event, payload).length > 0;

function merge(decisions) {
  const verdict = RANK.find((v) => decisions.some((d) => d.verdict === v)) || null;
  const reasons = decisions.filter((d) => d.verdict === verdict && d.reason)
    .map((d) => ({ key: d.key, text: d.reason, short: d.short, reason: true, pkg: d.pkg }));
  return { verdict,
    items: [...reasons,
    ...decisions.flatMap((d) => [...(d.context ? [{ text: d.context }] : []), ...(d.say || [])].map((it) => ({ ...it, pkg: d.pkg })))] };
}

/** Per package, what reached the agent: a text only where its event carries context, a reason only where the event tells its verdict; the
 * rest unsent. */
function reachedAgent(event, verdict, sizes) {
  const rule = EVENTS[event] || { context: false, blocks: [] };
  return sizes.reduce((per, s) => {
    const sent = s.reason ? rule.blocks.includes(verdict) : rule.context;
    const row = per[s.pkg] || { said: 0, held: 0, unsent: 0 };
    return { ...per, [s.pkg]: { said: row.said + (sent ? s.said : 0), held: row.held + s.held, unsent: row.unsent + (sent ? 0 : s.said) } };
  }, {});
}

function onlyReads(payload, past) {
  const { command } = (payload && payload.tool_input) || {};
  if (typeof command !== 'string') return false;
  const read = writtenBy(command, past);
  return !read.writes.length && !read.unplaced;
}

/** Where the event can ask, gates that formed no verdict (`lost`) ask in their place, never deny; a payload that only reads keeps its notes
 * alone. */
function lostAsk(event, payload, lost, past) {
  const can = lost.length > 0 && Object.hasOwn(EVENTS, event) && EVENTS[event].blocks.includes('ask');
  return can && !onlyReads(payload, past) ? { verdict: 'ask', reason: `atlasbound: hook-lost: ${lost.join(', ')}: ${shortOf('hook-lost')}` } : null;
}

/** Allow is never passed on (it would skip the host's permission prompt); the one door into the agent's context, so no secret shape leaves
 * it.
 * `plain`: lines for the person that are no verdict and no failure (a row of a module that is off). */
function replyOf(event, merged, notes, plain) {
  const rule = Object.hasOwn(EVENTS, event) ? EVENTS[event] : null;
  const text = scrub(merged.texts.join('\n'));
  const reason = rule && rule.blocks.includes(merged.verdict) ? scrub(merged.reasons.join(' ; ')) : null;
  const hookSpecificOutput = { hookEventName: event, permissionDecision: merged.verdict, permissionDecisionReason: reason };
  const decision = reason === null ? {} : event === 'Stop' ? { decision: 'block', reason } : { hookSpecificOutput };
  const specific = rule && rule.context && text
    ? { hookSpecificOutput: { hookEventName: event, ...decision.hookSpecificOutput, additionalContext: text } } : {};
  const system = [...plain, ...notes.slice(0, 1).map(() => `atlasbound: no verdict formed by ${notes.join(', ')}`)];
  return { ...decision, ...specific, ...(system.length ? { systemMessage: system.join('\n') } : {}) };
}

module.exports = { portRows, wakes, reached, merge, reachedAgent, lostAsk, replyOf };
