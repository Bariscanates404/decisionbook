// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug/load: stored files read back through the CALLER's validator; a missing file is NAMED and a torn line `refused` while the rest is
// read (it must explain a killed run).
const { fail } = require('../base/errors.cjs');

function createLoader(io, validate) {
  const refused = [];
  const missing = [];
  function read(key) {
    const text = io.fs.readText(key);
    if (text === null) missing.push(key);
    return text;
  }
  function pointer(key) {
    const text = io.fs.readText(key);
    if (text === null || !text.trim()) throw fail('store-empty', key);
    return text.trim();
  }
  function one(key, shape, code) {
    const text = read(key);
    return text === null ? null : validate.shape(shape, validate.json(text, code));
  }
  const rows = (keys, shape, keep) => keys.flatMap((key) => {
    const body = read(key);
    if (body === null) return [];
    const got = validate.kept(body, shape, keep);
    refused.push(...got.refused.map(({ line, code }) => ({ key, line, code })));
    return got.rows;
  });
  return { missing, refused, pointer, one, rows };
}

module.exports = { createLoader };
