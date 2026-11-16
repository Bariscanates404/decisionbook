// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The one reader and writer of the consent record, in the home from the password database (HOME cannot redirect it); a link is not
// followed, an unreadable record closes.
const { errors: { fail, isFail }, trace: { TRACE_DIR } } = require('@atlasbound/kit');
const { consent, SWITCHES } = require('../core/consent.cjs');
const { CONSENT_PATH, HINT_PATH, SCHEMA, validate } = require('../contracts/shapes.cjs');
const { shortOf } = require('../contracts/codes.cjs');

function asked(io) {
  if (!io.home) return { refused: 'telemetry-no-home' };
  try {
    const text = io.home.readText(CONSENT_PATH, { noLink: true });
    return { record: text === null ? null : validate.json(text) };
  } catch (err) {
    if (!isFail(err)) throw err;
    return { refused: 'telemetry-consent-unreadable' };
  }
}

async function read(_input, io) {
  const { record, refused } = asked(io);
  const state = consent(Object.fromEntries(SWITCHES.map((name) => [name, String(io.env.get(name) ?? '').trim().toLowerCase()])), record, refused);
  return { out: { consent: state, url: state.url, chose: Boolean(record) }, n: {}, codes: { [state.code]: 1 } };
}

// setup's and doctor's one line, only to a person at a terminal (an AI's shell would act on it) who never chose, at most once a day
// in each repository.
async function hint({ person }, io) {
  const { out: { consent: state, chose } } = await read(null, io);
  const today = io.clock.now().slice(0, 10);
  const saidToday = () => (io.fs.readText(HINT_PATH) || '').trim() === today;
  if (!person || chose || state.code !== 'telemetry-off' || io.fs.list(TRACE_DIR) === null || saidToday()) return { out: { line: null }, n: {}, codes: {} };
  io.fs.writeAtomic(HINT_PATH, `${today}\n`);
  return { out: { line: shortOf('telemetry-hint') }, n: { hinted: 1 }, codes: { 'telemetry-hint': 1 } };
}

async function write({ on }, io) {
  if (!io.home) throw fail('telemetry-no-home');
  io.home.writeAtomic(CONSENT_PATH, `${JSON.stringify({ schema: SCHEMA.consent, on, at: io.clock.now() })}\n`);
  return read(null, io);
}

module.exports = { read, write, hint };
