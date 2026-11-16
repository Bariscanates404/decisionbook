// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The verbs, each step traced. Fail-open: a coded failure becomes a coded answer (already traced) and the caller's work never stops; an
// uncoded error rethrows.
const { traced, errors: { isFail } } = require('@atlasbound/kit');
const { collect: collectStep } = require('../steps/collect.cjs');
const { redactAll } = require('../steps/redact.cjs');
const { post } = require('../steps/send.cjs');
const consentStep = require('../steps/consent.cjs');
const { STORE, SENT_PATH, CONSENT_PATH } = require('../contracts/shapes.cjs');
const { shortOf } = require('../contracts/codes.cjs');
const { rulesOf, WORDS_FILE } = require('../contracts/rules.cjs');

// The rules over the words the installed packages declare: the cli hands each one's contracts/telemetry.json (io.packageData).
const rulesHere = (io) => rulesOf(io.packageData(WORDS_FILE));

async function collect(io, ctx, rules) {
  const { out } = await traced(io, 'collect', collectStep)({ version: ctx.version ?? null, rules }, ctx);
  return out;
}

async function preview(io, ctx) {
  const rules = rulesHere(io);
  const found = await collect(io, ctx, rules);
  const { out } = await traced(io, 'redact', redactAll)({ events: found.events, sentState: found.sentState, rules }, ctx);
  return { ...found, ...out, rules };
}

const consentVerb = (step, fn, input) => async (io, ctx, given = {}) => (await traced(io, step, fn)({ ...input, ...given }, ctx)).out;
const optIn = consentVerb('consent-on', consentStep.write, { on: true });
const optOut = consentVerb('consent-off', consentStep.write, { on: false });
const status = consentVerb('consent-status', consentStep.read, {});
const hint = consentVerb('hint', consentStep.hint, {});
// The consent is read as its own `consent-status` record first, so the trace shows what the send was judged by.
async function send(io, ctx) {
  const { consent: state } = await status(io, ctx);
  try {
    const view = state.on ? await preview(io, ctx) : null;
    const { out } = await traced(io, 'send', post)({ state, view }, ctx);
    return out;
  } catch (err) {
    if (!isFail(err)) throw err;
    return { sent: false, code: err.code };
  }
}

// doctor: the choice as status reads it; a stored choice that cannot be read is a problem (the person chose, and it no longer holds), said
// with its file.
async function consentDoctor(io, ctx) {
  const { consent: { on, code } } = await status(io, ctx);
  const where = code === 'telemetry-consent-unreadable' ? ` (~/${CONSENT_PATH})` : '';
  return { ok: !where, says: `${on ? 'on' : 'off'}: ${code}: ${shortOf(code)}${where}` };
}

const unsentStores = (io) => (io.fs.readText(SENT_PATH) === null ? [STORE] : []);

module.exports = { preview, send, optIn, optOut, status, hint, consentDoctor, unsentStores };
