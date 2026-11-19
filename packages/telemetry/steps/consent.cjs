// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one reader and writer of the choice (~/.atlasbound/telemetry-consent.json, in the home from the password database: HOME cannot
// redirect it, a link is not followed), and setup's question, notice or hint. What a record means is core/consent.
const { errors: { fail, isFail }, text: { lines: { dayOf } } } = require('@atlasbound/kit');
const { NONE, SWITCH_NAMES, switchOf, choiceRead, reportingState, unanswered, choiceAfter, noticeCovers } = require('../core/consent.cjs');
const { PATHS, SCHEMA, WIRE, validate } = require('../contracts/shapes.cjs');
const { TEXT, sentence, questionBlock } = require('../contracts/codes.cjs');
const { writeRecord } = require('../contracts/helpers.cjs');

const KNOWN = [SCHEMA.consent, SCHEMA.consentOld];
const recordRead = (record) => KNOWN.includes(record?.schema)
  && (record.schema === SCHEMA.consentOld ? typeof record.on === 'boolean' : validate.refusal('Consent', record) === null);
const NOTHING = { out: { line: null }, n: {}, codes: {} };

/** What holds this process: the environment switch, the choice as stored, and why none could be read. A record of a schema this client
 * does not know (a newer one) reads as off. */
function consentHeld(io) {
  const killed = switchOf(Object.fromEntries(SWITCH_NAMES.map((name) => [name, String(io.env.get(name) ?? '').trim().toLowerCase()])));
  if (!io.home) return { killed, choice: NONE, refused: 'telemetry-no-home' };
  try {
    const text = io.home.readText(PATHS.consent, { noLink: true });
    const record = text === null ? null : validate.jsonOrNull(text);
    if (text !== null && !recordRead(record)) return { killed, choice: NONE, refused: 'telemetry-consent-unreadable' };
    return { killed, choice: record ? choiceRead(record, SCHEMA) : NONE, refused: null };
  } catch (err) {
    if (!isFail(err)) throw err;
    return { killed, choice: NONE, refused: 'telemetry-consent-unreadable' };
  }
}

/** Each registered namespace with its state. */
const namespaceStates = (io, spaces, held = consentHeld(io)) => spaces.map((space) => ({ space,
  ...reportingState(held, { wire: WIRE, space, today: dayOf(io.clock.now()) }) }));

async function read({ spaces }, io) {
  const held = consentHeld(io);
  const states = namespaceStates(io, spaces, held);
  const codes = states.reduce((all, state) => ({ ...all, [state.code]: (all[state.code] ?? 0) + 1 }), {});
  return { out: { states, killed: held.killed, address: Boolean(WIRE.url) }, n: { on: states.filter((state) => state.on).length }, codes };
}

/** A command's choice (core/consent `choiceAfter`): off is anyone's and never refused; a record that does not read is written anew. */
async function writeChoice({ act, names, yes, spaces }, io) {
  if (!io.home) throw fail('telemetry-no-home');
  const here = Object.fromEntries(spaces.map((space) => [space.ns, space.policy]));
  const choice = choiceAfter(consentHeld(io).choice, { act, names, yes, here, core: WIRE.policy, at: io.clock.now() });
  writeRecord(io.home, PATHS.consent, { schema: SCHEMA.consent, at: io.clock.now(), ...choice });
  return read({ spaces }, io);
}

// Under `unchosen: on`, the notice once per (core, namespace) policy pair of the beta's namespaces; it is said, and `noticed` written
// with the pairs it covered, only here.
async function noticeOnce(io, spaces, beta) {
  await writeChoice({ act: 'notice', names: beta.map((space) => space.ns), spaces }, io);
  return { out: { line: questionBlock(sentence('notice', { until: WIRE.betaUntil }), beta) }, n: { noticed: 1 }, codes: {} };
}

// The question once per namespace without a choice under the current pair: Enter or y: on; n: off; anything else is asked once more,
// then said as no choice (nothing written); no answer at all (no terminal to read) is silent.
const YES = { '': true, y: true, yes: true, n: false, no: false };
async function askOnce(io, { held, spaces, ask }) {
  const open = spaces.filter((space) => unanswered(held.choice, { wire: WIRE, space }));
  if (!open.length) return NOTHING;
  const reply = async (text) => String(await ask(text) ?? 'unsaid').trim().toLowerCase();
  const first = await reply(`${questionBlock(TEXT.question, open)}\n${TEXT.yes}`);
  const answer = Object.hasOwn(YES, first) || first === 'unsaid' ? first : await reply(TEXT.yesAgain);
  const yes = Object.hasOwn(YES, answer) ? YES[answer] : undefined;
  if (yes !== undefined) await writeChoice({ act: 'answer', names: open.map((space) => space.ns), yes, spaces }, io);
  const line = yes === undefined && answer !== 'unsaid' ? TEXT.unchosen : null;
  return { out: { line }, n: { asked: open.length, yes: Number(yes === true) }, codes: {} };
}

// The hint, said at most once a day in a repository, while a namespace waits for a choice.
function hintOnce(io, states) {
  const today = dayOf(io.clock.now());
  const waiting = states.some((state) => state.code === 'telemetry-not-chosen');
  if (!waiting || (io.fs.readText(PATHS.hinted) || '').trim() === today) return NOTHING;
  io.fs.writeAtomic(PATHS.hinted, `${today}\n`);
  return { out: { line: TEXT.hint }, n: { hinted: 1 }, codes: { 'telemetry-hint': 1 } };
}

const silent = (held) => !WIRE.url || Boolean(held.killed || held.refused) || held.choice.all === 'off';
const plainPerson = (io, ask) => Boolean(ask) && io.actor().who === 'terminal' && !io.actor().wrapped;
/** setup's part, only where an address is set and no switch holds: for a person at a plain terminal (`ask` given, not wrapped) the notice
 * or the question; for anyone else, or doctor, at most the hint line once a day. */
async function setupSays({ spaces, ask }, io) {
  const held = consentHeld(io);
  if (silent(held)) return NOTHING;
  if (!plainPerson(io, ask)) return hintOnce(io, namespaceStates(io, spaces, held));
  const beta = WIRE.unchosen === 'on' ? spaces.filter((space) => WIRE.betaModules.includes(space.ns)) : [];
  if (!beta.every((space) => noticeCovers(held.choice.noticed, { wire: WIRE, space }))) return noticeOnce(io, spaces, beta);
  return askOnce(io, { held, spaces: spaces.filter((space) => !beta.includes(space)), ask });
}

module.exports = { consentHeld, namespaceStates, read, writeChoice, setupSays };
