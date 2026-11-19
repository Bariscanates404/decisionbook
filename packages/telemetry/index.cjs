// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// @atlasbound/telemetry: every verb is `(io, args)`; `net` defaults to the one real port and `machine` to this machine's facts. A module
// registers by its descriptor and the counts its steps trace: it gets no handle of its own, no id, address, network client or free JSON.
const { isCode } = require('./contracts/codes.cjs');
const { PKG, SCHEMA, ENUMS, WIRE } = require('./contracts/shapes.cjs');
const run = require('./run/telemetry.cjs');
const { renderTelemetry, doctorOf } = require('./debug/telemetry.cjs');
const { createNet } = require('./adapters/net.cjs');
const { machineFacts } = require('./adapters/machine.cjs');

const ctxOf = (io, args = {}) => ({ run: args.run ?? io.run, version: args.version ?? io.version,
  net: args.net ?? createNet(WIRE.limits), machine: machineFacts(WIRE.os) });
const verb = (fn) => (io, args = {}) => fn(io, ctxOf(io, args), args);

module.exports = {
  vocabulary: { steps: ENUMS.step, isCode },
  status: verb(run.consentStatus), optIn: verb(run.turnOn), optOut: verb(run.turnOff), next: verb(run.nextShown),
  history: verb(run.historyKept), reset: verb(run.resetNow), send: verb(run.sendNow), due: verb(run.dueNow), hint: verb(run.hintSaid),
  doctor: async (io) => doctorOf(await run.consentStatus(io, ctxOf(io))),
  debug: { telemetry: verb(run.lookOnly), render: renderTelemetry },
  spareStores: () => ['.atlasbound/telemetry'],
  PKG, SCHEMA,
};
