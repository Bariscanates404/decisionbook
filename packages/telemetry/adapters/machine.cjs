// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What a report says of the machine it ran on, read here once: Node's major version and the OS family (contracts/wire.json `os`).
const machineFacts = (osWords) => ({ node: Number(process.versions.node.split('.')[0]), os: osWords[process.platform] ?? 'other' });

module.exports = { machineFacts };
