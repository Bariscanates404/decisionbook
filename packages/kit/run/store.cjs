// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE seal of the product's own store (base/paths OWN_STORE), in a repository and in a person's home: only the product writes there, but
// for what the root says a session writes. Every gate asks here which store file a path lands in, and refuses it in this sentence.
const { OWN_STORE } = require('../base/paths.cjs');
const { shortOf, ruleOf } = require('../contracts/codes.cjs');

/** Whether a key lies in the store; the store's own folder does. */
const inStore = (key) => `${key}/`.startsWith(OWN_STORE);

/** The store file a HOST path lands in, as a person reads it (`~/` for the home's), or null: any other file, and in the repository what
 * `io.sessionWrites` opens: a folder (it ends in `/`) and all under it, a file by its whole name (an io that names none opens nothing). */
function sealedFile(io, host) {
  const key = io.fs.keyAt(host);
  const opens = (open) => (open.endsWith('/') ? `${key}/`.startsWith(open) : key === open);
  if (key !== null) return inStore(key) && !(io.sessionWrites?.() ?? []).some(opens) ? key : null;
  const home = io.home ? io.home.keyAt(host) : null;
  return home !== null && inStore(home) ? `~/${home}` : null;
}

/** STORE_SEALED's one sentence, naming the file. */
const sealedReason = (file) => `STORE_SEALED: ${shortOf('STORE_SEALED')} — ${file}. ${ruleOf('STORE_SEALED')}`;

module.exports = { inStore, sealedFile, sealedReason };
