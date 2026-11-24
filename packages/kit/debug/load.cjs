// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// debug/load: stored files read back through the CALLER's validator; a missing file is NAMED and a torn line `refused` while the rest is
// read (it must explain a killed run).

function createLoader(io, validate) {
  const refused = [];
  const missing = [];
  function read(key) {
    const text = io.fs.readText(key);
    if (text === null) missing.push(key);
    return text;
  }
  const rows = (keys, shape, keep) => keys.flatMap((key) => {
    const body = read(key);
    if (body === null) return [];
    const got = validate.kept(body, shape, keep);
    refused.push(...got.refused.map(({ line, code }) => ({ key, line, code })));
    return got.rows;
  });
  return { missing, refused, rows };
}

module.exports = { createLoader };
