// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE. The names of the person's own rows in DecisionBook's home folder for this repository (kit paths.hereKey): one file per session's
// reads and start, one per plan's close.
const { hash: { sha256 } } = require('@atlasbound/kit');

const sessionName = (session) => `recall-${sha256(String(session)).slice(0, 16)}.jsonl`;
const isSessionName = (name) => /^recall-[0-9a-f]{16}\.jsonl$/.test(name);
const startName = (session) => `start-${sha256(String(session)).slice(0, 16)}.json`;
const closeName = (id) => `close-${sha256(String(id)).slice(0, 16)}.json`;

module.exports = { sessionName, isSessionName, startName, closeName };
