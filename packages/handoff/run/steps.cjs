// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Every hook handler and every verb is ONE traced step of its own name. A failure rethrows after its trace record: the cli's hook port
// isolates it (a hook never blocks), the cli's verb port prints it.
const { traced } = require('@atlasbound/kit');
const { stepResult: said } = require('../contracts/shapes.cjs');
const { shortOf } = require('../contracts/codes.cjs');
const { isSessionId } = require('../steps/store.cjs');
const { startStep, messageStep, touchedStep, compactStep, stopStep } = require('../steps/session.cjs');
const { handoffStep, keepStep, showStep, dropStep } = require('../steps/verbs.cjs');

const HOOKS = { start: startStep, prompt: messageStep, touched: touchedStep, compact: compactStep, stop: stopStep };
const VERBS = { handoff: handoffStep, keep: keepStep, show: showStep, drop: dropStep };
// the store is the person's home: without one nothing is kept and nothing is said
const homeless = async () => said('handoff-no-home', { text: `handoff: ${shortOf('handoff-no-home')}\n` });
// a hook answers its code alone: an event with no usable session id is nobody's, and no home is nowhere to keep
const codeOnly = (code) => async () => said(code);

const handlers = Object.freeze(Object.fromEntries(Object.entries(HOOKS).map(([step, fn]) => [step, async (event, io) => {
  const known = isSessionId(event.session_id);
  const run = known && io.home ? fn : codeOnly(io.home ? 'handoff-no-session' : 'handoff-no-home');
  return (await traced(io, step, run)(event, { run: io.run, ref: known ? { session: event.session_id } : {} })).out;
}])));

const verbs = Object.freeze(Object.fromEntries(Object.entries(VERBS).map(([step, fn]) => [step, async (io, args = {}) => {
  const given = { flags: args.flags || {}, rest: args.rest || [] };
  const verb = step === 'handoff' ? 'handoff' : `handoff ${step}`;
  const { out: { text, exit = 0, ...out } } = await traced(io, step, io.home ? fn : homeless)(given, { run: io.run, ref: { verb } });
  return { out, text, exit }; // a refusal that wrote nothing leaves non-zero, so a script can tell it from a write
}])));

module.exports = { handlers, verbs };
