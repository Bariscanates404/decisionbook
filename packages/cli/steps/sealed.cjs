// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The port's seal of the product's own files, wired whatever module is on. A write tool or a shell command's write into the product's
// store is refused (kit's seal, STORE_SEALED). What setup wrote for the host (the settings file's hooks and permissions, the .gitignore
// block, each command file) and the records an installed package's manifest seals (its module on or off) change only through the
// product, and the host's other settings files, here and the user's own, can switch every hook off: a write tool that changes one, or
// a shell command that writes one (or names one, where its write cannot be placed), asks the person; where no one is asked it is
// refused. A name is the same file in any case (a disk that folds case opens `Settings.json` as the host's), and a copy is judged
// where it lands. Named limit: a path its text never holds.
const { paths: { resolveFrom, folderAfter, dirOf, nameOf }, host: { WRITE_TOOLS, SHELL_TOOLS }, person: { asksPerson },
  store: { sealedFile, sealedByShell, sealedReason }, scripts: { scriptReaders }, text: { shell: { writtenBy } } } = require('@atlasbound/kit');
const { changesOwn } = require('../core/sealed.cjs');
const { PORT_GATE, PORT_READ_MS } = require('../contracts/shapes.cjs');
const { shortOf, ruleOf } = require('../contracts/codes.cjs');
const { shellRefused } = require('./person.cjs');
const { userHost } = require('./host.cjs');

/** `io` whose disks (the repository, the home, any folder the machine opens) answer no key for a name they cannot hold: no file of the
 * product's is named so, and the gate that judges the write says the rest. Any other disk error is the port's to note. */
function namesHeld(io) {
  const keyAt = (fs) => (host) => {
    try {
      return fs.keyAt(host);
    } catch (err) {
      if (err.code !== 'ENAMETOOLONG') throw err;
      return null;
    }
  };
  const held = (fs) => fs && { ...fs, keyAt: keyAt(fs) };
  return { ...io, fs: held(io.fs), home: held(io.home), machine: { ...io.machine, fsAt: (dir) => held(io.machine.fsAt(dir)) } };
}

/** THE rows of the seal, by the disk each is on (a folder's key ends in `/`). In the repository: the settings file and the .gitignore
 * block it shares with the person (`kind`: only a change of the product's entries asks), and what any write of asks: each installed
 * package's sealed records, the host's other settings file and each command file this install placed. Where the host keeps
 * the user's own files: both settings files. -> `at(host)`: the row a path is in any case, with its text; `holds(host, rooted)`: the
 * folder written that holds one (a folder above one; `rooted`: the disk's own folder too); `named(command)`: the first a command's text
 * names, by its whole key or by its folder and its name (a `cd` the reader lost). Each is said as the person reads the file. */
function ownFiles(io) {
  const { settings, ignore, marks, whole } = io.host.ownFiles;
  const user = userHost(io);
  const disks = [{ fs: io.fs, said: (key) => key, files: [{ key: settings, kind: 'settings' }, { key: ignore, kind: 'ignore', marks },
    ...[...io.packages.installed().manifests.flatMap((manifest) => manifest.sealed ?? []), ...whole()].map((key) => ({ key }))] },
  ...(user ? [{ fs: user.fs, said: (key) => `${user.said}/${key}`, files: [user.settings, user.local].map((key) => ({ key })) }] : [])];
  const on = (host, pick, rooted = false) => disks.reduce((found, disk) => { // `rooted`: the disk's own folder counts, as the key ''
    const key = found === null ? disk.fs.keyAt(host) ?? (rooted && disk.fs.keyAt(resolveFrom(host, '**')) === '**' ? '' : null) : null;
    return key === null ? found : pick(disk, key);
  }, null);
  const fold = (key) => key.toLowerCase(); // a name is the same file in any case
  const names = (text, key) => text.includes(key.replace(/\/$/, ''))
    || (!key.endsWith('/') && dirOf(key) !== '' && text.includes(dirOf(key)) && text.includes(nameOf(key)));
  return {
    at: (host) => on(host, (disk, key) => {
      const file = disk.files.find((one) => (one.key.endsWith('/') ? fold(key).startsWith(fold(one.key)) : fold(key) === fold(one.key)));
      return file ? { ...file, said: disk.said(key), text: () => disk.fs.readText(key) } : null;
    }),
    holds: (host, rooted) => on(host, (disk, key) => (disk.files.some((file) => key === '' || fold(file.key).startsWith(`${fold(key)}/`))
      ? disk.said(`${key || '.'}/`) : null), rooted),
    named: (command) => disks.flatMap((disk) => disk.files.filter((file) => names(fold(command.replace(/\\/g, '/')), fold(file.key)))
      .map((file) => disk.said(file.key)))[0] ?? null,
  };
}

function byWriteTool(io, payload, own) {
  const host = resolveFrom(payload.cwd || io.root, payload.tool_input[WRITE_TOOLS[payload.tool_name]]);
  const store = sealedFile(io, host);
  if (store) return { code: 'STORE_SEALED', file: store };
  const file = own.at(host);
  const changes = file && (!file.kind || changesOwn(file, file.text(), payload.tool_name, payload.tool_input));
  return changes ? { code: 'own-file', file: file.said } : null;
}

function byShell(io, payload, own) {
  const until = io.clock.elapsedMs() + PORT_READ_MS;
  const past = () => io.clock.elapsedMs() > until;
  const command = String(payload.tool_input.command);
  // the script a command runs is read with it (`sh x.sh`, `npm run x`): what it writes is judged as if it were typed
  const read = writtenBy(command, past, { lang: SHELL_TOOLS[payload.tool_name], ...scriptReaders(io, payload.cwd || io.root, past) });
  const store = sealedByShell(io, command, read, payload.cwd || io.root);
  if (store) return { code: 'STORE_SEALED', file: store };
  // a write reaches the path itself; a copy, each source's name under it or (none named) the folder its contents fill; else what it holds
  const held = (file) => own.at(file)?.said ?? own.holds(file);
  const under = (host, from) => from.map((source) => held(resolveFrom(host, nameOf(source.replace(/\\/g, '/'))))).find(Boolean);
  const reached = (host, from) => own.at(host)?.said ?? (from?.length ? under(host, from) : own.holds(host, Boolean(from)));
  // each write placed while the time lasts; past it, the text is read for the names alone
  const said = read.writes.map((write) => (past() ? null : [folderAfter(write.cd, payload.cwd || io.root, past), write]))
    .map((at) => at && at[0] !== null && reached(resolveFrom(at[0], at[1].path), at[1].from)).find(Boolean);
  if (said) return { code: 'own-file', file: said };
  const named = read.unplaced || past() ? own.named(command) : null;
  return named ? { code: 'own-file', file: named } : null;
}

/** The seal's answer on a write or shell tool -> a decision, or null for any other event, tool or file; one coded trace row each. */
function sealedOf(io, event, payload) {
  if (event !== PORT_GATE.event) return null;
  const by = (Object.hasOwn(WRITE_TOOLS, payload.tool_name) && byWriteTool) || (Object.hasOwn(SHELL_TOOLS, payload.tool_name) && byShell);
  const disks = namesHeld(io);
  const found = by ? by(disks, payload, ownFiles(disks)) : null;
  if (!found) return null;
  io.trace.event(io.run, 'cli.verb', { code: found.code, msg: found.file });
  const store = found.code === 'STORE_SEALED';
  const reason = store ? sealedReason(found.file) : `atlasbound: own-file: ${found.file}: ${shortOf('own-file')}. ${ruleOf('own-file')}`;
  return { verdict: store || !asksPerson(payload.permission_mode) ? 'deny' : 'ask', pkg: 'cli', key: `cli.${found.code}`, reason };
}

/** The port's own gates, whatever module is on: the verbs only a person runs, then the seal of the product's own files. */
const portGates = (io, event, payload) => [shellRefused(io, event, payload), sealedOf(io, event, payload)].filter(Boolean);

module.exports = { portGates };
