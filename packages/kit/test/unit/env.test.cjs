// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// io/env's behaviour: the one reader of process.env. Every case saves and restores the keys it touches.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { io: { env }, errors: { isFail } } = require('@atlasbound/kit');

/** Run `fn` with exactly these keys changed (undefined = unset); the old values come back even when `fn` throws. */
function withEnv(values, fn) {
  const saved = Object.keys(values).map((key) => [key, process.env[key]]);
  const put = ([key, value]) => { if (value === undefined) delete process.env[key]; else process.env[key] = value; };
  Object.entries(values).forEach(put);
  try {
    return fn();
  } finally {
    saved.forEach(put);
  }
}
const refused = (e) => isFail(e, 'config-invalid');
/** stateHome on a machine whose password database answers `homedir`. */
function home(homedir) {
  const real = os.userInfo;
  os.userInfo = () => ({ ...real(), homedir });
  try {
    return withEnv({ HOME: undefined }, env.stateHome);
  } finally {
    os.userInfo = real;
  }
}

test('the public shape is exactly get, pick, realOf, stateHome, userHome', () => {
  assert.deepEqual(Object.keys(env).sort(), ['get', 'pick', 'realOf', 'stateHome', 'userHome']);
});

test('get: a set value is returned as it is', () => {
  assert.equal(withEnv({ TOY_A: '1' }, () => env.get('TOY_A')), '1');
});

test('get: empty and unset are both null, never an empty string', () => {
  assert.equal(withEnv({ TOY_A: '' }, () => env.get('TOY_A')), null);
  assert.equal(withEnv({ TOY_A: undefined }, () => env.get('TOY_A')), null);
});

test('get: a name process.env inherits from Object is unset, not a function', () => {
  assert.equal(env.get('constructor'), null);
  assert.equal(env.get('__proto__'), null);
});

test('pick: only the named keys that are set; unset and empty are omitted, not null', () => {
  const values = { TOY_PATH: '/bin', TOY_USER: 'u', TOY_EMPTY: '', TOY_NOPE: undefined, TOY_OTHER_SECRET: 's' };
  const picked = withEnv(values, () => env.pick(['TOY_PATH', 'TOY_USER', 'TOY_EMPTY', 'TOY_NOPE']));
  assert.deepEqual(picked, { TOY_PATH: '/bin', TOY_USER: 'u' });
});

test('pick: an empty allowlist hands the child nothing, and an inherited name is not a key', () => {
  assert.deepEqual(env.pick([]), {});
  assert.deepEqual(env.pick(['constructor', 'toString']), {});
});

test('approvals sit in the password database\'s home, and only while HOME names that same home', () => {
  const realHome = os.userInfo().homedir;
  const real = `${realHome.replace(/\/+$/, '')}/.atlasbound`;
  assert.equal(withEnv({ HOME: realHome, ATLASBOUND_HOME: '/planted' }, env.stateHome), real);
  assert.equal(withEnv({ HOME: `${realHome}/`, ATLASBOUND_HOME: undefined }, env.stateHome), real, 'a trailing slash is the same home');
  assert.equal(withEnv({ HOME: undefined }, env.stateHome), real, 'no HOME: the password database alone');
  const planted = { HOME: '/planted', ATLASBOUND_HOME: '/planted', USERPROFILE: '/planted' };
  assert.throws(() => withEnv(planted, env.stateHome), (e) => refused(e) && /HOME is not this user's home/.test(e.message));
  assert.equal(withEnv(planted, env.userHome), realHome, 'the writer\'s name still comes from the password database');
  // And in a fresh process that starts with them set: a home read once at load would pass the case above.
  const script = "const { env } = require('@atlasbound/kit').io; try { env.stateHome(); } catch (e) { process.stdout.write(e.code); }";
  const res = spawnSync(process.execPath, ['-e', script], { cwd: __dirname, encoding: 'utf8', env: { PATH: process.env.PATH, ...planted } });
  assert.equal(res.stdout, 'config-invalid', res.stderr);
});

test('stateHome: the trailing slash of the home is trimmed', () => {
  assert.equal(home('/home/u'), '/home/u/.atlasbound');
  assert.equal(home('/home/u/'), '/home/u/.atlasbound');
  assert.equal(home('/'), '/.atlasbound');
});

test('stateHome: a relative home is refused with config-invalid, never resolved against cwd', () => {
  for (const base of ['rel/dir', './rel', '../up', '.', 'C:rel', 'C:']) assert.throws(() => home(base), refused, base);
});

test('an absolute Windows or backslash home is accepted; only a trailing / is trimmed', () => {
  assert.equal(home('C:\\Users\\u'), 'C:\\Users\\u/.atlasbound');
  assert.equal(home('C:/Users/u/'), 'C:/Users/u/.atlasbound');
  assert.equal(home('\\\\server\\share'), '\\\\server\\share/.atlasbound');
});

test('on Windows the HOME Git Bash hands and a plain terminal\'s none name the one home, in any case and with either separator', () => {
  const real = os.userInfo;
  os.userInfo = () => ({ ...real(), homedir: 'C:\\Users\\ana' });
  const onWindows = (HOME, platform = 'win32') => withEnv({ HOME }, () => env.stateHome(platform));
  try {
    for (const spelling of [undefined, 'C:\\Users\\ana', 'c:\\users\\Ana\\', 'C:/Users/ana', 'C:/Users/ana/']) {
      assert.equal(onWindows(spelling), 'C:\\Users\\ana/.atlasbound', String(spelling));
    }
    assert.throws(() => onWindows('C:\\Users\\other'), refused, 'another folder is still refused');
    assert.throws(() => onWindows('C:/Users/ana', 'linux'), refused, 'elsewhere a spelling is its bytes');
  } finally {
    os.userInfo = real;
  }
});

test('a machine with no password entry, or an empty home in it, is no home: refused, never a guess', () => {
  assert.throws(() => home(''), refused);
  const real = os.userInfo;
  os.userInfo = () => { throw Object.assign(new Error('uv_os_get_passwd returned ENOENT'), { code: 'ERR_SYSTEM_ERROR' }); };
  try {
    assert.equal(env.userHome(), null);
    assert.throws(() => withEnv({ HOME: undefined }, env.stateHome), refused);
    os.userInfo = () => { throw new TypeError('a bug, not a machine state'); };
    assert.throws(() => env.userHome(), TypeError);
  } finally {
    os.userInfo = real;
  }
});

test('withEnv leaves no key behind', () => {
  assert.throws(() => withEnv({ TOY_LEAK: 'x' }, () => { throw new Error('boom'); }), /boom/);
  assert.equal(env.get('TOY_LEAK'), null);
});

test('userHome reads the password database: HOME and ATLASBOUND_HOME cannot move it', () => {
  const real = os.userInfo().homedir;
  const seen = withEnv({ HOME: '/forged', ATLASBOUND_HOME: '/forged', USERPROFILE: '/forged' }, env.userHome);
  assert.equal(seen, real);
  assert.notEqual(seen, '/forged');
  // And in a fresh process that starts with them set.
  const script = `process.stdout.write(require('@atlasbound/kit').io.env.userHome())`;
  const res = spawnSync(process.execPath, ['-e', script], { cwd: __dirname, encoding: 'utf8', env: { PATH: process.env.PATH, HOME: '/forged', ATLASBOUND_HOME: '/forged' } });
  assert.equal(res.stdout, real);
});

test('realOf: where a host path really leads, and null for a PATH entry with nothing there', () => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'kit-real-')));
  fs.mkdirSync(path.join(dir, 'in'));
  fs.symlinkSync(path.join(dir, 'in'), path.join(dir, 'link'));
  fs.symlinkSync(path.join(dir, 'link-loop'), path.join(dir, 'link-loop'));
  assert.equal(env.realOf(path.join(dir, 'link')), path.join(dir, 'in'));
  assert.equal(env.realOf(path.join(dir, 'gone')), null);
  assert.equal(env.realOf(path.join(dir, 'link-loop')), null);
  fs.rmSync(dir, { recursive: true, force: true });
});
