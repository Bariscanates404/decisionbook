// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { store: { inStore, sealedFile, sealedReason } } = require('@atlasbound/kit');

// a disk that answers the key after its root, or null outside it
const diskAt = (root) => ({ keyAt: (host) => (host.startsWith(`${root}/`) ? host.slice(root.length + 1) : null) });
const io = { fs: diskAt('/repo'), home: diskAt('/home/ana'), sessionWrites: () => ['.atlasbound/drafts/', '.atlasbound/doctor-probe'] };

test('the store\'s seal: a file in the store here or in the home is named, what a session writes and any other file are not', () => {
  const sealed = (host, world = io) => sealedFile(world, host);
  assert.deepEqual(['/repo/.atlasbound/cli/x.json', '/repo/.atlasbound', '/home/ana/.atlasbound/db-here/ab/trust.json'].map((host) => sealed(host)),
    ['.atlasbound/cli/x.json', '.atlasbound', '~/.atlasbound/db-here/ab/trust.json'], 'a store file, the folder itself, the home\'s');
  assert.deepEqual(['/repo/.atlasbound/drafts/new.json', '/repo/.atlasbound/drafts', '/repo/.atlasbound/doctor-probe', '/repo/lib/a.cjs',
    '/repo/.atlasbound-mine/x', '/home/ana/notes.txt', '/elsewhere/.atlasbound/x'].map((host) => sealed(host)), Array(7).fill(null));
  assert.equal(sealed('/repo/.atlasbound/drafts/new.json', { fs: io.fs }), '.atlasbound/drafts/new.json', 'an io that names no session write opens nothing');
  assert.deepEqual(['/repo/.atlasbound/doctor-probe-evil', '/repo/.atlasbound/doctor-probe/x', '/repo/.atlasbound/drafts-mine/x'].map((host) => sealed(host)),
    ['.atlasbound/doctor-probe-evil', '.atlasbound/doctor-probe/x', '.atlasbound/drafts-mine/x'], 'a file a session writes opens that whole name, never a name it begins');
  assert.equal(sealed('/home/ana/.atlasbound/x', { fs: io.fs }), null, 'no home: only the repository is asked');
  assert.deepEqual(['.atlasbound', '.atlasbound/x', '.atlasbound-mine', 'lib/.atlasbound/x'].map(inStore), [true, true, false, false]);
  assert.equal(sealedReason('~/.atlasbound/x'), 'STORE_SEALED: only AtlasBound itself writes here: its state and what a person said — ~/.atlasbound/x. '
    + 'Leave it as it is; if something in it looks wrong, say so to the person.');
});
