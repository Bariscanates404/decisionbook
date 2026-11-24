// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The verbs, each a traced step; a coded failure becomes a coded answer and the caller's work never stops. Closing and sending run only
// under the one sender lock (no wait: a second process answers busy and leaves). `due` is the cli's, after a verb's answer was written:
// never in a hook, never under an environment switch.
const { errors: { fail } } = require('@atlasbound/kit');
const { spacesIn } = require('../contracts/rules.cjs');
const { WIRE } = require('../contracts/shapes.cjs');
const { TEXT, forLine } = require('../contracts/codes.cjs');
const { modulesNamed, tracedOut, codedAnswer, withSendLock } = require('../contracts/helpers.cjs');
const consent = require('../steps/consent.cjs');
const { closeDays, queued, dropWaiting } = require('../steps/collect.cjs');
const { attempt, attemptOf, nextRequest, storeSummary } = require('../steps/send.cjs');
const { storedPeriod, renew, forgetWaiting } = require('../steps/period.cjs');

async function consentStatus(io, ctx) {
  const { spaces, refused } = spacesIn(io);
  return { ...(await tracedOut(io, 'consent-status', consent.read)({ spaces }, ctx)), here: storeSummary(io), refused };
}

/** `telemetry next`: closes finished days into reports here (local files only) and shows the request the next attempt would post. */
async function nextShown(io, ctx) {
  const view = await consentStatus(io, ctx);
  const shown = async () => ({ out: await withSendLock(io, async () => {
    await closeDays({ states: view.states, version: ctx.version }, io, ctx);
    return { body: nextRequest(io, view.states, !view.killed).body }; // under a switch nothing here is written or deleted
  }).catch(codedAnswer), n: {}, codes: {} });
  return { body: null, ...view, ...(await tracedOut(io, 'next', shown)({}, ctx)) };
}

/** One attempt under the lock: close, then send. A person's `telemetry send` ignores the daily wait, never a 429's. */
async function sendNow(io, ctx) {
  if (consent.consentHeld(io).killed) return { code: 'telemetry-killed' };
  const last = attemptOf(io);
  if (last?.code === 'telemetry-throttled' && last.nextAt > Date.parse(io.clock.now())) return { code: 'telemetry-throttled' };
  return withSendLock(io, async () => {
    const statesNow = () => consent.namespaceStates(io, spacesIn(io).spaces);
    await tracedOut(io, 'collect', closeDays)({ states: statesNow(), version: ctx.version }, ctx);
    return tracedOut(io, 'send', attempt)({ statesNow }, ctx);
  }).catch(codedAnswer);
}

/** The cli's call after a verb's answer: before nextAt it reads one file and nothing else; nothing on and no forget waiting, nothing. */
async function dueNow(io, ctx) {
  const last = attemptOf(io);
  if (last && last.nextAt > Date.parse(io.clock.now())) return { code: 'telemetry-not-due' };
  const held = consent.consentHeld(io);
  const on = consent.namespaceStates(io, spacesIn(io).spaces, held).some((state) => state.on);
  if (held.killed || (!on && !storedPeriod(io)?.forget.length)) return { code: 'telemetry-off' };
  return tracedOut(io, 'due', async () => ({ out: await sendNow(io, ctx), n: {}, codes: {} }))({}, ctx);
}

/** `telemetry on [module]`: the namespaces it covers and what each says, above the phrase the person types. */
async function turnOn(io, ctx, args) {
  const { spaces } = spacesIn(io);
  const names = modulesNamed(spaces, args.rest);
  const info = [...(WIRE.url ? [] : [TEXT.onEmpty]), forLine(spaces.filter((space) => !names.length || names.includes(space.ns))).trim()];
  if (!args.ask || (await args.ask(info.join('\n'))) !== true) throw fail('telemetry-phrase-not-typed');
  return { ...(await tracedOut(io, 'consent-on', consent.writeChoice)({ act: 'on', names, spaces }, ctx)), here: storeSummary(io) };
}

/** `telemetry off [module]`: anyone's, never refused; the waiting reports of what it turned off are deleted here (best effort: the sender
 * drops them again before any dial). */
async function turnOff(io, ctx, args) {
  const { spaces } = spacesIn(io);
  const names = modulesNamed(spaces, args.rest);
  const view = await tracedOut(io, 'consent-off', consent.writeChoice)({ act: 'off', names, spaces }, ctx);
  dropWaiting(io, names.length ? names : null);
  return { ...view, here: storeSummary(io) };
}

// What a forget answers: the server asked now (done or pending; nothing asked: no id here ever sent), or with no address: an id that
// sent waits, else nothing was ever sent.
const forgetCode = (asked, waiting) => (asked ? (asked.pending && 'forget-pending') || (asked.done && 'forget-done') || 'forget-none'
  : (waiting && 'forget-unreachable') || 'forget-none');

// reset: the period ends, the waiting reports of its id are deleted; with forget, the ids that sent wait for deletion, asked of the server
// now when there is an address and no environment switch.
async function periodReset({ forget, killed }, io, ctx) {
  const deleted = dropWaiting(io, null);
  renew(io, { forget });
  const asked = forget && WIRE.forget && !killed ? await forgetWaiting(io, ctx.net) : null;
  const code = forget ? forgetCode(asked, storedPeriod(io)?.forget.length) : 'telemetry-reset';
  return { out: { code, deleted, forget }, n: { deleted }, codes: { [code]: 1 } };
}

async function resetNow(io, ctx, args) {
  const forget = Boolean(args.flags?.forget);
  if (forget) await tracedOut(io, 'consent-off', consent.writeChoice)({ act: 'off', names: [], spaces: spacesIn(io).spaces }, ctx);
  return tracedOut(io, 'reset', periodReset)({ forget, killed: consent.consentHeld(io).killed }, ctx);
}

const historyKept = (io, ctx) => tracedOut(io, 'history', async () => ({ out: { reports: queued(io).items }, n: {}, codes: {} }))({}, ctx);

/** `debug telemetry`: the state and the request the next attempt would post, without closing a day or writing anything. */
async function lookOnly(io, ctx) {
  const view = await consentStatus(io, ctx);
  return { ...view, body: nextRequest(io, view.states, false).body };
}

const hintSaid = (io, ctx, args) => tracedOut(io, 'hint', consent.choiceSaid)({ spaces: spacesIn(io).spaces, ask: args.ask ?? null }, ctx);
const noticeSaid = (io, ctx) => tracedOut(io, 'notice', consent.choiceSaid)({ spaces: spacesIn(io).spaces, host: true }, ctx);

module.exports = { consentStatus, nextShown, sendNow, dueNow, turnOn, turnOff, resetNow, historyKept, lookOnly, hintSaid, noticeSaid };
