// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Raw events through the wall into `body`, the one string preview shows and send posts. `due`: telemetry's own count alone is no news, or
// each send would earn the next.
const { redact } = require('../core/redact.cjs');
const { newsOf } = require('../core/window.cjs');
const { PKG, SCHEMA } = require('../contracts/shapes.cjs');
const { codesSaid } = require('../contracts/helpers.cjs');

const isNews = ({ payload }) => payload.pkg !== PKG;

async function redactAll({ events, sentState = '', rules }) {
  const results = events.map((raw) => redact(raw, { rules }));
  const passed = results.map((res) => res.event).filter(Boolean);
  const wire = newsOf(passed, sentState, rules.FORMS.state);
  const dropped = [...new Set(results.flatMap((res) => res.dropped))].sort();
  const oversize = wire.filter((event) => event.oversize).length;
  const codes = codesSaid({ 'field-dropped': dropped.length, 'event-unknown': results.length - passed.length, 'record-oversize': oversize });
  const unchanged = passed.length - wire.length;
  const body = JSON.stringify({ schema: SCHEMA.event, events: wire });
  return { out: { events: wire, due: wire.some(isNews), dropped, unchanged, body },
    n: { events: wire.length, dropped: dropped.length, unchanged }, codes };
}

module.exports = { redactAll };
