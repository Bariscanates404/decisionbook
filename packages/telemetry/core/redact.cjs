// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE wall: raw event -> the only shape that may leave, by the rules of the installed packages' words; pure and total, drop by default.
// `dropped` names fields for the LOCAL view only (a name can be a repository's text).
const { PAYLOAD_BYTE_CAP } = require('../contracts/rules.cjs');
const { SCHEMA } = require('../contracts/shapes.cjs');
const { isRecord } = require('../contracts/declared.cjs');

const ENVELOPE = ['event', 'at', 'cv', 'payload'];
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][0-9A-Za-z.+-]{1,40})?$/;
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})(T[\d:.]+Z)?$/;

const fits = (rule, key, value) => (rule.counts.includes(key) ? Number.isSafeInteger(value) && value >= 0 : Object.hasOwn(rule.enums, key)
  && rule.enums[key].includes(value));

// Sorted keys, so one event is always the same bytes; an absent value stays absent.
function payloadOf(rule, raw, dropped) {
  const source = isRecord(raw) ? raw : {};
  const payload = {};
  for (const key of Object.keys(source).sort()) {
    if (fits(rule, key, source[key])) payload[key] = source[key];
    else dropped.push(`payload.${key}`);
  }
  return payload;
}

function stamped(raw, event, dropped) {
  const day = typeof raw.at === 'string' ? TIMESTAMP.exec(raw.at) : null;
  if (day) event.at = day[1];
  else if (raw.at !== undefined && raw.at !== null) dropped.push('at');
  if (typeof raw.cv === 'string' && VERSION.test(raw.cv)) event.cv = raw.cv;
  else if (raw.cv !== undefined && raw.cv !== null) dropped.push('cv');
}

function redact(raw, { rules: { EVENT_RULES }, cap = PAYLOAD_BYTE_CAP }) {
  const input = isRecord(raw) ? raw : {};
  const name = typeof input.event === 'string' && Object.hasOwn(EVENT_RULES, input.event) ? input.event : null;
  const dropped = Object.keys(input).filter((key) => !ENVELOPE.includes(key));
  if (!name) return { event: null, dropped: [...dropped, 'event', 'payload.*'] };
  const event = { schema: SCHEMA.event, event: name };
  stamped(input, event, dropped);
  event.payload = payloadOf(EVENT_RULES[name], input.payload, dropped);
  event.dropped = dropped.length;
  if (Buffer.byteLength(JSON.stringify(event), 'utf8') > cap) return { event: { ...event, payload: {}, oversize: true }, dropped };
  return { event, dropped };
}

module.exports = { redact };
