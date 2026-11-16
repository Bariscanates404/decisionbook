// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// @atlasbound/telemetry: every verb is `(io, args)`; `net` defaults to the one real port (send only). Opting in is a person's alone: its
// row says so (package.json `by: person`), and the cli refuses anyone else before this code runs.
const codes = require('./contracts/codes.cjs');
const rules = require('./contracts/rules.cjs');
const { PKG, SCHEMA, ENUMS, STORE, SENT_PATH, CONSENT_PATH, INGEST_URL, SHAPES } = require('./contracts/shapes.cjs');
const { redact } = require('./core/redact.cjs');
const run = require('./run/telemetry.cjs');
const { viewOf, stateView, render } = require('./debug/telemetry.cjs');
const { createNet } = require('./adapters/net.cjs');

const ctxOf = (io, args = {}) => ({ run: args.run ?? io.run, version: args.version ?? io.version, net: args.net });
const readerOf = (io) => ({ person: io.actor().who === 'terminal' }); // the hint is for a person: who acts is kit's one answer
// The preview first, so the consent's own record is no row of what the view measures.
const debugView = async (io, ctx) => {
  const found = await run.preview(io, ctx);
  return viewOf((await run.status(io, ctx)).consent, found);
};
const stateVerb = (verb) => async (io, args) => stateView(await verb(io, ctxOf(io, args)), INGEST_URL);

module.exports = {
  vocabulary: { steps: ENUMS.step, isCode: codes.isCode },
  preview: (io, args) => run.preview(io, ctxOf(io, args)),
  send: (io, args) => run.send(io, { ...ctxOf(io, args), net: args?.net || createNet() }),
  optIn: stateVerb(run.optIn), optOut: stateVerb(run.optOut), status: stateVerb(run.status),
  hint: (io, args) => run.hint(io, ctxOf(io, args), readerOf(io)),
  doctor: (io) => run.consentDoctor(io, ctxOf(io)), spareStores: run.unsentStores,
  keptStores: { [STORE]: 'the day telemetry\'s hint was last shown here and a copy of what was sent (your choice is kept in your home)' },
  debug: { telemetry: (io, args) => debugView(io, ctxOf(io, args)), render },
  redact, codes, PKG, SCHEMA, SHAPES, SENT_PATH, CONSENT_PATH, INGEST_URL,
  PAYLOAD_BYTE_CAP: rules.PAYLOAD_BYTE_CAP, MAX_ROWS_PER_SEND: rules.MAX_ROWS_PER_SEND,
};
