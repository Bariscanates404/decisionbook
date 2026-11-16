// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Bad files, bad names and bad locks on the REAL filesystem, real git and real processes (the fake fs cannot fail these).
// Every [I-n] names one invariant of this package.
const test = require('node:test');
const assert = require('node:assert/strict');
const nodeFs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const kit = require('@atlasbound/kit');

const { createFs, createGit, proc, env } = kit.io;
const { isFail } = kit.errors;
const { withLock, lockLine } = kit.lock;

const tmp = () => nodeFs.realpathSync(nodeFs.mkdtempSync(path.join(os.tmpdir(), 'kit-hard-')));
const inTmp = async (fn) => { const dir = tmp(); try { return await fn(dir); } finally { kit.testing.trash(dir); } };
const coded = (code) => (e) => isFail(e, code);

/** Runs a read in a child with a limit: a read that hangs or fills memory must fail this test, not the suite. */
function readInChild(dir, key, opts = {}) {
  const entry = require.resolve('@atlasbound/kit');
  const script = `try { process.stdout.write('read ' + require(${JSON.stringify(entry)}).io.createFs(${JSON.stringify(dir)}).readText(${JSON.stringify(key)}, ${JSON.stringify(opts)}).length); } catch (err) { process.stdout.write('code ' + err.code); }`;
  const t0 = performance.now();
  const res = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 20000, killSignal: 'SIGKILL' });
  return { said: res.stdout, signal: res.signal, ms: performance.now() - t0 };
}

const sparse = (file, bytes) => {
  const fd = nodeFs.openSync(file, 'w');
  nodeFs.ftruncateSync(fd, bytes);
  nodeFs.closeSync(fd);
};

test('[I-42] a read is bounded and of regular files only: a link to a device, a FIFO and a directory answer a code at once', () => inTmp((dir) => {
  nodeFs.symlinkSync('/dev/zero', path.join(dir, 'zero'));
  spawnSync('mkfifo', [path.join(dir, 'pipe')]);
  nodeFs.mkdirSync(path.join(dir, 'dir'));
  for (const key of ['zero', 'pipe', 'dir']) {
    const res = readInChild(dir, key);
    assert.equal(res.signal, null, `${key} hung`);
    assert.equal(res.said, 'code io-read-failed', key);
  }
  sparse(path.join(dir, 'huge'), 3 * 2 ** 30);
  const huge = readInChild(dir, 'huge');
  assert.equal(huge.said, 'code io-read-too-large');
  const fs = createFs(dir);
  fs.writeAtomic('some.txt', '12345');
  assert.equal(fs.readText('some.txt', { maxBytes: 5 }), '12345');
  assert.throws(() => fs.readText('some.txt', { maxBytes: 4 }), (e) => isFail(e, 'io-read-too-large') && /some\.txt/.test(e.message));
  assert.equal(fs.readText('absent.txt', { maxBytes: 4 }), null);
}));

test('[I-43] a swap after the check is refused by the open itself: a no-link read and append never follow the link', () => inTmp((root) => {
  const dir = path.join(root, 'repo');
  nodeFs.mkdirSync(dir);
  const secret = path.join(root, 'outside.txt');
  nodeFs.writeFileSync(secret, 'outside\n');
  const plant = (key) => {
    nodeFs.rmSync(path.join(dir, key), { force: true });
    nodeFs.symlinkSync(secret, path.join(dir, key));
  };
  // The swap lands exactly between refuseLinks and the open: the first call after the check.
  const racing = (key, call) => ({ ...nodeFs, [call]: (...args) => { plant(key); return nodeFs[call](...args); } });
  nodeFs.writeFileSync(path.join(dir, 'notes.md'), 'mine\n');
  assert.throws(() => createFs(dir, { impl: racing('notes.md', 'openSync') }).readText('notes.md', { noLink: true }), coded('path-link'));
  nodeFs.rmSync(path.join(dir, 'log'), { force: true });
  assert.throws(() => createFs(dir, { impl: racing('log', 'appendFileSync') }).append('log', 'x\n'), coded('path-link'));
  assert.equal(nodeFs.readFileSync(secret, 'utf8'), 'outside\n');
  // A plain read still follows a link: only a caller that asks refuses.
  assert.equal(createFs(dir).readText('log'), 'outside\n');
  // An append with no swap works, creating the file.
  const fs = createFs(dir);
  fs.append('fresh/log', 'a\n');
  fs.append('fresh/log', 'b\n');
  assert.equal(fs.readText('fresh/log'), 'a\nb\n');
}));

function gitRepo(dir, names) {
  const git = (...args) => spawnSync('git', args, { cwd: dir, encoding: 'utf8', input: args.at(-1) === '--index-info' ? names : undefined, env: { PATH: env.get('PATH'), HOME: dir } });
  git('init', '-q');
  return git;
}
const gitOf = (dir) => createGit({ proc, root: dir, env: env.pick(['PATH', 'HOME']) });

test('[I-44] one odd name is one named row, never the whole listing: a drive-letter shape, tracked or untracked', () => inTmp(async (dir) => {
  const git = gitRepo(dir);
  for (const name of ['ok.js', 'C:x']) nodeFs.writeFileSync(path.join(dir, name), 'x\n');
  git('add', '-A');
  const tracked = await gitOf(dir).lsFiles();
  assert.deepEqual(tracked.map((r) => [r.disk, r.key, r.refused || null]).sort(), [['C:x', null, 'path-absolute'], ['ok.js', 'ok.js', null]]);
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x');
  nodeFs.writeFileSync(path.join(dir, 'c:foo.txt'), 'x\n');
  nodeFs.writeFileSync(path.join(dir, 'plain.txt'), 'x\n');
  const status = await gitOf(dir).statusZ();
  assert.deepEqual(status.map((r) => [r.xy, r.disk, r.key, r.refused || null]).sort(), [['??', 'c:foo.txt', null, 'path-absolute'], ['??', 'plain.txt', 'plain.txt', null]]);
}));

test('[I-9] a repository\'s config runs nothing through the port, and an unspellable filter name is refused', () => inTmp(async (dir) => {
  const git = gitRepo(dir);
  const marks = tmp();
  const evil = path.join(dir, '.git', 'evil.sh');
  nodeFs.writeFileSync(evil, `#!/bin/sh\necho ran >> "${marks}/ran"\ncat\n`, { mode: 0o755 });
  nodeFs.writeFileSync(path.join(dir, 'a.txt'), 'x\n');
  nodeFs.writeFileSync(path.join(dir, '.gitattributes'), '* filter=ev\n');
  git('add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'x');
  git('config', 'core.fsmonitor', evil);
  git('config', 'filter.ev.clean', evil);
  git('config', 'filter.ev.required', 'true');
  nodeFs.writeFileSync(path.join(dir, 'a.txt'), 'y\n');
  nodeFs.writeFileSync(path.join(dir, 'new.txt'), 'z\n');
  const port = gitOf(dir);
  assert.deepEqual((await port.lsFiles()).map((r) => r.disk).sort(), ['.gitattributes', 'a.txt']);
  assert.ok((await port.statusZ()).some((r) => r.xy === '??' && r.disk === 'new.txt'));
  assert.deepEqual(nodeFs.readdirSync(marks), []);
  nodeFs.appendFileSync(path.join(dir, '.git', 'config'), `[filter "a=b"]\n\tclean = ${evil}\n`);
  await assert.rejects(gitOf(dir).statusZ(), (e) => isFail(e, 'git-failed') && /cannot be closed/.test(e.message));
  assert.deepEqual(nodeFs.readdirSync(marks), []);
}));

test('[I-53] childEnv is what a child gets: no repository directory on its PATH by any spelling, a link included', () => inTmp(async (dir) => {
  const link = path.join(tmp(), 'in');
  nodeFs.mkdirSync(path.join(dir, 'bin'));
  nodeFs.symlinkSync(path.join(dir, 'bin'), link);
  const held = { ...env, pick: (keys) => Object.fromEntries(keys.map((key) => [key, `${path.join(dir, 'bin')}:.::${link}:/usr/bin`])) };
  assert.deepEqual(kit.paths.childEnv(held, ['PATH'], dir), { PATH: '/usr/bin' });
}));

test('[I-45] a listing past the default cap still answers: git\'s cap is sized for a big monorepo', () => inTmp(async (dir) => {
  const row = (i) => `100644 e69de29bb2d1d6434b8b29ae775ad8c2e48c5391 0\t${String(i).padStart(1000, 'n')}\n`;
  const count = Math.ceil((8 * 1024 * 1024 + 1) / row(0).length); // one byte past a child's default output cap
  const git = gitRepo(dir, Array.from({ length: count }, (_, i) => row(i)).join(''));
  assert.equal(git('update-index', '--add', '--index-info').status, 0);
  const rows = await gitOf(dir).lsFiles();
  assert.equal(rows.length, count);
  const fake = { run: async (spec) => ({ code: null, stdout: '', killedBy: 'cap', error: null, seen: spec }) };
  await assert.rejects(createGit({ proc: fake, root: dir, env: {} }).lsFiles(), (e) => isFail(e, 'git-failed') && /cap/.test(e.message));
}));

const lockText = (over = {}) => `${JSON.stringify({ pid: process.pid, nonce: 'a'.repeat(64), at: '2026-11-03T00:00:00.000Z', ...over })}\n`;
/** A real file and real pids; only time is scripted, so 600 s of waiting costs nothing. */
const lockWorld = (dir, { now = '2026-11-03T00:00:01.000Z', pid = 7 } = {}) => {
  let waited = 0;
  return { fs: createFs(dir), proc: { pid: () => pid, alive: proc.alive }, clock: { now: () => now, elapsedMs: () => waited, sleep: async (ms) => { waited += ms; } } };
};

test('[I-46] a garbage lock is judged like a torn one: reclaimed after the torn wait and named by doctor, never held forever', () => inTmp(async (dir) => {
  const io = lockWorld(dir);
  for (const garbage of ['not json at all\n', '{"pid":"x","nonce":1}\n', 'null\n']) {
    io.fs.writeAtomic('L', garbage);
    assert.equal(lockLine(io, 'L').stuck, true, garbage);
    assert.equal(await withLock(io, 'L', async () => 'reclaimed'), 'reclaimed', garbage);
    assert.equal(io.fs.readText('L'), null);
    assert.deepEqual(nodeFs.readdirSync(dir).filter((name) => name.startsWith('L.')), []);
  }
}));

test('[I-47] a recycled pid does not hold a lock forever: behind an old lock it is reclaimed', () => inTmp(async (dir) => {
  const aged = lockWorld(dir, { now: '2026-11-03T02:00:00.000Z' });
  aged.fs.writeAtomic('L', lockText());
  const says = lockLine(aged, 'L');
  assert.equal(says.stuck, true);
  assert.match(says.says, new RegExp(`pid ${process.pid}`));
  assert.match(says.says, /older than/);
  assert.equal(await withLock(aged, 'L', async () => 'reclaimed'), 'reclaimed');
  const young = lockWorld(dir, { now: '2026-11-03T00:30:00.000Z' });
  young.fs.writeAtomic('L', lockText());
  assert.equal(lockLine(young, 'L').stuck, false);
  await assert.rejects(withLock(young, 'L', async () => 'no'), coded('lock-held'));
  assert.ok(young.fs.readText('L').includes(`"pid":${process.pid}`), 'a young lock that reads alive is never stolen');
}));

test('[I-48] a holder can ask whether the lock is still its own, and is refused after another writer took it', () => inTmp(async (dir) => {
  const io = lockWorld(dir);
  await withLock(io, 'L', async (_, mine) => {
    assert.doesNotThrow(mine);
    io.fs.writeAtomic('L', lockText({ pid: 12345 }));
    assert.throws(mine, (e) => isFail(e, 'lock-held') && /another writer/.test(e.message));
  });
  assert.ok(io.fs.readText('L').includes('"pid":12345'), 'a holder that lost the lock does not release the winner');
}));

test('[I-49] a trace event keeps its code whatever the length of its message: every writer clips in one place', () => inTmp(async (dir) => {
  const fs = createFs(dir);
  const io = { fs, clock: kit.io.clock, trace: kit.io.createTrace({ fs, clock: kit.io.clock }).forPackage('kit', { steps: ['s'], isCode: kit.codes.isCode }) };
  io.trace.event('r1', 's', { code: 'path-outside-repo', msg: 'a/'.repeat(500) });
  const step = kit.traced(io, 's', async () => { throw kit.errors.fail('path-outside-repo', 'b/'.repeat(500)); });
  await assert.rejects(step({}, { run: 'r1' }), coded('path-outside-repo'));
  const rows = fs.readText('.atlasbound/trace/r1.ndjson').trim().split('\n').map((line) => kit.createValidate({ shapes: {}, enums: {}, refuse: {}, isCode: () => true }).json(line));
  assert.deepEqual(rows.map((r) => r.err.code), ['path-outside-repo', 'path-outside-repo']);
  rows.forEach((r) => assert.ok(r.err.msg.length <= kit.errors.MSG_CAP));
}));

test('[I-50] the line door keeps the rows that fit and names each line it refused; a torn line never costs the rest', () => {
  const validate = kit.createValidate({ shapes: { Row: { n: 'int' } }, enums: {}, refuse: { Row: 'not-found' }, isCode: kit.codes.isCode });
  const { rows, refused } = validate.kept('{"n":1}\n{"torn\n{"n":"x"}\n{"n":2}\n', 'Row');
  assert.deepEqual(rows, [{ n: 1 }, { n: 2 }]);
  assert.deepEqual(refused.map((r) => [r.code, r.line]), [['not-found', 2], ['not-found', 3]]);
  const { rows: mine } = validate.kept('{"n":1}\n{"n":2}\n', 'Row', (row) => row.n > 1);
  assert.deepEqual(mine, [{ n: 2 }]);
});

// the same table over the fake and the real fs. Whatever differs here is a bug a contract suite on the fake could never fail.
const SAME = [
  ['a parent spelling is refused on write', (fs) => { fs.writeAtomic('../x', 'y'); }, 'path-outside-repo'],
  ['an absolute spelling is refused on write', (fs) => { fs.writeAtomic('/abs', 'y'); }, 'path-absolute'],
  ['a parent spelling is refused on read', (fs) => fs.readText('../x'), 'path-outside-repo'],
  ['an empty spelling is refused', (fs) => fs.readText(''), 'path-empty'],
  ['a directory does not read as text', (fs) => { fs.writeAtomic('d/f', 'x'); return fs.readText('d'); }, 'io-read-failed'],
  ['a cap is a coded refusal', (fs) => { fs.writeAtomic('f', '12345'); return fs.readText('f', { maxBytes: 4 }); }, 'io-read-too-large'],
];
const ANSWERS = [
  ['absent is null', (fs) => fs.readText('nope'), null],
  ['an absent directory lists null', (fs) => fs.list('nope'), null],
  ['an emptied directory lists empty', (fs) => { fs.writeAtomic('d/f', 'x'); fs.remove('d/f'); return fs.list('d'); }, []],
  ['removing what is not there makes no folder', (fs) => { fs.remove('a/b/never.txt'); return [fs.exists('a/b'), fs.list('a')]; }, [false, null]],
  ['a folder whose last file was removed stays, and so do the folders above it', (fs) => { fs.append('top/a/b', 'x'); fs.remove('top/a/b');
    return [fs.list('top'), fs.list('top/a'), fs.exists('top/a'), fs.exists('top'), fs.readText('top/a/b')]; }, [['a'], [], true, true, null]],
  ['a made folder is there and empty, its parents too, and making it again changes nothing', (fs) => { fs.makeDir('a/b'); fs.makeDir('a/b');
    return [fs.exists('a/b'), fs.list('a/b'), fs.list('a')]; }, [true, [], ['b']]],
  ['a list is sorted and one level', (fs) => { fs.writeAtomic('d/b', 'x'); fs.writeAtomic('d/a/c', 'x'); return fs.list('d'); }, ['a', 'b']],
  ['createExclusive says who created it', (fs) => [fs.createExclusive('x', '1'), fs.createExclusive('x', '2'), fs.readText('x')], [true, false, '1']],
  ['rename says whether it moved', (fs) => { fs.writeAtomic('from', 'x'); return [fs.rename('from', 'to'), fs.rename('from', 'to'), fs.readText('to')]; }, [true, false, 'x']],
  ['the real spelling of a plain file is itself, of an absent one null', (fs) => { fs.writeAtomic('d/f', 'x'); return [fs.real('d/f'), fs.real('d/none')]; }, ['d/f', null]],
  ['a file says when it last changed, an absent one null, and nothing of it is read', (fs) => { fs.writeAtomic('d/f', 'x'); return [typeof fs.mtimeMs('d/f'), fs.mtimeMs('d/none')]; }, ['number', null]],
];
for (const [name, make] of [['fake', () => kit.testing.memoryFs()], ['real', (dir) => createFs(dir)]]) {
  test(`[I-51] the fake fs and the real one answer alike: ${name}`, () => inTmp((dir) => {
    for (const [what, act, code] of SAME) assert.throws(() => act(make(path.join(dir, what))), coded(code), what);
    for (const [what, act, want] of ANSWERS) assert.deepEqual(act(make(path.join(dir, what))), want, what);
  }));
}

test('placeAt on the real disk: a second name of a known file is that file, of an unknown one its own key', () => inTmp(async (dir) => {
  const fs = createFs(path.join(dir, 'repo'));
  fs.writeAtomic('src/a.js', 'a');
  fs.writeAtomic('b.js', 'b');
  nodeFs.linkSync(path.join(dir, 'repo', 'src', 'a.js'), path.join(dir, 'repo', 'twin.js'));
  nodeFs.linkSync(path.join(dir, 'repo', 'src', 'a.js'), path.join(dir, 'out.js'));
  let asked = 0;
  const known = (keys) => () => {
    asked += 1;
    return keys;
  };
  const placed = [];
  for (const spelled of ['twin.js', path.join(dir, 'out.js'), 'src/a.js', 'b.js', 'new.js', '']) placed.push(await fs.placeAt(spelled, known(['src/a.js'])));
  assert.deepEqual(placed, ['src/a.js', 'src/a.js', 'src/a.js', 'b.js', 'new.js', null]);
  assert.equal(asked, 3, 'the known files are asked for only where the file has a second name');
  assert.equal(await fs.placeAt('twin.js', known(['b.js'])), 'twin.js', 'two names of a file nobody knows: its own key');
  assert.equal(await fs.placeAt('twin.js', async () => ['src/a.js']), 'src/a.js', 'the known files may come later');
  assert.equal(await kit.testing.memoryFs({ 'd/f': 'x' }).placeAt('/fake/d/f', known([])), 'd/f', 'the memory disk has one name each');
}));

test('[I-53] env: a child gets only the named keys that are set, an empty value is absent, a relative home is refused', () => {
  const was = { ...process.env };
  const realInfo = os.userInfo;
  try {
    process.env.FX_SET = 'v';
    process.env.FX_EMPTY = '';
    delete process.env.FX_UNSET;
    assert.deepEqual(env.pick(['FX_SET', 'FX_EMPTY', 'FX_UNSET']), { FX_SET: 'v' });
    assert.equal(env.get('FX_SET'), 'v');
    assert.equal(env.get('FX_EMPTY'), null);
    assert.equal(env.get('FX_UNSET'), null);
    assert.equal(env.get('constructor'), null, 'what process.env inherits is no value');
    os.userInfo = () => ({ homedir: 'relative/home' });
    assert.throws(() => env.stateHome(), coded('config-invalid'));
    os.userInfo = () => ({ homedir: '/somewhere/home/' });
    process.env.HOME = '/somewhere/home';
    assert.equal(env.stateHome(), '/somewhere/home/.atlasbound');
    process.env.HOME = '/elsewhere';
    assert.throws(() => env.stateHome(), coded('config-invalid'), 'a HOME that is not the user\'s home reads no approval');
  } finally {
    os.userInfo = realInfo;
    Object.keys(process.env).filter((key) => !(key in was)).forEach((key) => delete process.env[key]);
    Object.assign(process.env, was);
  }
});

test('[I-52] real answers the one spelling of a file on disk, through a link and in the disk\'s case; outside the root is null', () => inTmp((root) => {
  const dir = path.join(root, 'repo');
  nodeFs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  nodeFs.writeFileSync(path.join(dir, 'src', 'a.js'), 'x\n');
  nodeFs.writeFileSync(path.join(root, 'outside.js'), 'x\n');
  nodeFs.symlinkSync('src/a.js', path.join(dir, 'link.js'));
  nodeFs.symlinkSync('src', path.join(dir, 'linked'));
  nodeFs.symlinkSync(path.join(root, 'outside.js'), path.join(dir, 'away.js'));
  const fs = createFs(dir);
  assert.equal(fs.real('src/a.js'), 'src/a.js');
  assert.equal(fs.real('link.js'), 'src/a.js');
  assert.equal(fs.real('linked/a.js'), 'src/a.js');
  assert.equal(fs.real('away.js'), null);
  assert.equal(fs.real('missing.js'), null);
  const folds = nodeFs.existsSync(path.join(dir, 'SRC', 'A.JS'));
  assert.equal(fs.real('SRC/A.JS'), folds ? 'src/a.js' : null, 'one answer on either kind of disk');
}));

test('[I-52] keyAt answers the key a host path writes: through a link, in the disk\'s case, dot-dot applied; outside is null', () => inTmp((root) => {
  const dir = path.join(root, 'repo');
  nodeFs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  nodeFs.writeFileSync(path.join(dir, 'src', 'a.js'), 'x\n');
  nodeFs.writeFileSync(path.join(root, 'outside.js'), 'x\n');
  nodeFs.symlinkSync('src/a.js', path.join(dir, 'link.js'));
  nodeFs.symlinkSync(path.join(root, 'outside.js'), path.join(dir, 'away.js'));
  nodeFs.symlinkSync(dir, path.join(root, 'alias'));
  const folds = nodeFs.existsSync(path.join(dir, 'SRC', 'A.JS'));
  const table = [[`${dir}/src/a.js`, 'src/a.js'], [`${dir}/link.js`, 'src/a.js'], [`${dir}/lib/../src/a.js`, 'src/a.js'], [`${root}/alias/src/a.js`, 'src/a.js'],
    [`${dir}/src/new/b.js`, 'src/new/b.js'], [`${dir}/away.js`, 'away.js'], [`${root}/outside.js`, null], [dir, null], ['src/a.js', 'src/a.js'], ['', null], [null, null],
    ...(folds ? [[`${dir}/SRC/A.JS`, 'src/a.js'], [`${dir}/Src/New.js`, 'src/New.js']] : [])];
  for (const [hostPath, key] of table) assert.equal(createFs(dir).keyAt(hostPath), key, String(hostPath));
}));
