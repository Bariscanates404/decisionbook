// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What an earlier AtlasBound left in this user's home (core/leftovers says what each is), read from the AI host's own files
// where the host keeps them, and from the machine's processes (kit's one reader). Doctor names them; `leftovers remove`, a person's verb,
// first keeps a copy of every file it changes or takes in a backup folder of this user's own store, then takes only the earlier version's
// rows, server and files out. While the earlier version's server still runs it takes nothing (that server writes its files back) and
// names the processes; it ends none: that is the person's. Where the process listing does not answer it takes nothing either.
const validate = require('../contracts/validate.cjs');
const { STORE } = require('../contracts/shapes.cjs');
const { withoutOldHooks, withoutOldServer, oldServers, leftoverSaid, runningSaid, alsoSaid, nextSaid, leftoversLine, LEFT_FILES,
  OBSERVATORY } = require('../core/leftovers.cjs');
const { WORDS: { leftovers: W } } = require('../contracts/codes.cjs');
const { userHost } = require('./host.cjs');

const BACKUP = `${STORE}/leftovers-backup`;

/** What the earlier product left here -> { places, settings, state, hooks, servers, files, running, store, unread, found }; null where
 * this user has no home to look in. A host file that is not there is no leftover; one that is not JSON is named, never guessed at, and
 * so is a process listing that does not answer. `found` counts what is the earlier version's: what `store` and `running.copies` name
 * is said beside it. */
function leftoversOf(io) {
  const places = userHost(io);
  if (!places) return null;
  const [settings, state] = [places.settings, places.state].map((key) => {
    const text = places.fs.readText(key);
    const value = text === null ? null : validate.jsonOrNull(text);
    if (text === null || (value && typeof value === 'object')) return { value, text };
    return { value: null, unread: leftoversLine('notJson', { key }) };
  });
  const hooks = settings.value ? withoutOldHooks(settings.value) : { gone: 0 };
  const servers = state.value ? withoutOldServer(state.value) : { where: [] };
  const files = io.home ? (io.home.list(STORE) || []).filter((name) => LEFT_FILES.test(name)).map((name) => `${STORE}/${name}`) : [];
  const rows = io.proc.running();
  const running = oldServers(rows ?? []);
  const kept = io.home ? io.home.list(OBSERVATORY) : null;
  const unread = [settings.unread, state.unread, rows === null && W.processesUnread].filter(Boolean);
  return { places, settings, state, hooks, servers, files, running, store: kept && kept.length, unread, unlisted: rows === null,
    found: hooks.gone + servers.where.length + files.length + running.earlier.length };
}

/** `atlasbound leftovers`: what is left, what stands beside it, and what takes it out (the open sessions first, where its server runs). */
function leftovers(_args, io) {
  const left = leftoversOf(io);
  const { found, lines, running, next } = left ? { found: left.found, lines: [...leftoverSaid(left), ...alsoSaid(left)],
    running: left.running.earlier.map((row) => row.pid), next: nextSaid(left) } : { found: 0, lines: [W.noHome], running: [], next: [] };
  const none = leftoversLine(left && lines.length ? 'noneBeside' : 'none');
  const head = leftoversLine('head', { what: found ? leftoversLine('left') : none });
  const text = [head, ...lines.map((line) => `  ${line}`), ...next].join('\n');
  return { out: { found, said: lines, running }, n: { found, running: running.length }, codes: {}, text: `${text}\n` };
}

/** The earlier version's server still runs, or the listing that would tell did not answer: nothing is taken, and the person is told why. */
function stillRunning(left) {
  const pids = left.running.earlier.map((row) => row.pid);
  const [code, why] = left.unlisted ? ['leftovers-unread', W.unlisted]
    : ['leftovers-running', leftoversLine('stillRuns', { pids: pids.join(', ') })];
  const text = [leftoversLine('notTaken', { why }), ...runningSaid(left.running).map((line) => `  ${line}`), W.closeFirst, W.again];
  return { out: { taken: [], running: pids }, n: { taken: 0, running: pids.length }, codes: { [code]: 1 },
    text: `${text.join('\n')}\n`, exit: 1 };
}

/** `atlasbound leftovers remove`: the copy first (the whole host file as it was, each taken file), then each file without its leftovers. */
function leftoversRemove(args, io) {
  const left = leftoversOf(io);
  if (!left?.found) return leftovers(args, io);
  if (left.running.earlier.length || left.unlisted) return stillRunning(left);
  const backup = `${BACKUP}/${io.clock.now().replaceAll(':', '-').replaceAll('.', '-')}`;
  const keep = (key, text) => io.home.writeAtomic(`${backup}/${key.split('/').pop()}`, text);
  const { fs, settings, state, said } = left.places;
  // a host file: its copy as it was, then the file without the leftovers
  const rewrite = (key, was, now) => {
    keep(key, was.text);
    fs.writeAtomic(key, `${JSON.stringify(now, null, 2)}\n`);
    return `${said}/${key}`;
  };
  const hooks = () => leftoversLine('tookHooks', { n: left.hooks.gone, file: rewrite(settings, left.settings, left.hooks.settings) });
  const taken = [...(left.hooks.gone ? [hooks()] : []),
    ...(left.servers.where.length ? [leftoversLine('tookServer', { file: rewrite(state, left.state, left.servers.state) })] : [])];
  left.files.forEach((key) => {
    keep(key, io.home.readText(key));
    io.home.remove(key);
    taken.push(`~/${key}`);
  });
  const text = [leftoversLine('tookHead'), ...taken.map((what) => leftoversLine('took', { what })), leftoversLine('copied', { backup }),
    ...alsoSaid(left).map((line) => `  ${line}`), W.restart];
  return { out: { taken, backup: `~/${backup}` }, n: { taken: taken.length }, codes: {}, text: `${text.join('\n')}\n` };
}

module.exports = { leftovers, leftoversRemove, leftoversOf };
