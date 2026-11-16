// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE clock owner: the only reader of wall and monotonic time; nothing content-addressed may contain a value from here.
const now = () => new Date().toISOString();
const elapsedMs = () => performance.now();
const sleep = (ms) => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

module.exports = { now, elapsedMs, sleep };
