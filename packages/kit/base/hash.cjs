// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE digest owner: sha256 over bytes, and over a value as JSON with keys sorted at every depth (array order is content), so a digest is a
// content address.
const crypto = require('node:crypto');
const { canonical } = require('./canonical.cjs');

const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
}

const digest = (value) => sha256(JSON.stringify(sorted(value)) ?? 'undefined');

/** The address of a value another machine can recompute: `sha256:<hex>` over the UTF-8 bytes of its canonical JSON (RFC 8785), or
 * canonical's refusal. */
const address = (value) => `sha256:${sha256(canonical(value))}`;

module.exports = { sha256, digest, address };
