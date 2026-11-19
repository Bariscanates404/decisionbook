// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The AI host's files of this user, found on this machine from the host's data (`io.host.user`, contracts/host.json `hostUser`).

/** Where the AI host keeps this user's own files -> { fs, said, settings, local, state } (the host data's keys there): the folder its
 * `env` names when set, else the home; null where this user has neither. The port's seal and the leftovers verb both ask here. */
function userHost(io) {
  const { env: named, inDir, inHome } = io.host.user;
  const dir = io.env.get(named);
  return dir ? { fs: io.machine.fsAt(dir), ...inDir, said: dir } : io.home && { fs: io.home, ...inHome, said: '~' };
}

module.exports = { userHost };
