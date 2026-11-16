// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE git port: no shell, `-z` names, every child closed against the repository's own config; an unknown base is null, any other exit
// `git-failed`.
const { pathKey } = require('../base/paths.cjs');
const { fail, isFail } = require('../base/errors.cjs');

const NUL = '\u0000';
const RS = '\u001e';
const US = '\u001f';
const LINK_MODE = '120000';
const CAP_BYTES = 256 * 1024 * 1024; // the listing's own limit: about 2.4 M files of 60-byte paths; past it is `git-failed`
// A planted promisor must not make a read dial: no lazy fetch, and for a git too old for that word, no transport (beats protocol.*).
const CLOSED_ENV = Object.freeze({ GIT_NO_LAZY_FETCH: '1', GIT_ALLOW_PROTOCOL: 'none' });
const CLOSED_CONFIG = ['core.fsmonitor=false', 'core.hooksPath=/dev/null', 'log.showSignature=false'];
const FILTER_KEY = /^filter\.(.*)\.[^.]+$/;
const LIST_CONFIG = ['config', '--name-only', '-z', '--list']; // this verb fires nothing (measured verb by verb)
const LOG = ['log', '--no-merges', '-z', '--name-only', `--format=${RS}%H${US}%s${US}%b${US}`];
const fieldsOf = (text) => text.split(NUL).filter(Boolean);

// `required=false`: a required filter with no driver stops `status`; git splits `-c` at the first `=`, so a name holding one is refused.
function closedArgs(listed) {
  const names = [...new Set(fieldsOf(listed).map((key) => FILTER_KEY.exec(key)?.[1]).filter((name) => name !== undefined))];
  const open = names.find((name) => name.includes('='));
  if (open !== undefined) throw fail('git-failed', `a filter name holding "=" cannot be closed: ${open}`);
  const off = (name) => [`filter.${name}.clean=`, `filter.${name}.smudge=`, `filter.${name}.process=`, `filter.${name}.required=false`];
  return [...[...CLOSED_CONFIG, ...names.flatMap(off)].flatMap((pair) => ['-c', pair]), '--literal-pathspecs'];
}

function keyOf(disk) {
  try {
    return { key: pathKey(disk) };
  } catch (err) {
    if (!isFail(err)) throw err;
    return { key: null, refused: err.code };
  }
}

const lsFilesOf = (text) => [...new Map(fieldsOf(text).map((field) => {
  const mode = field.slice(0, field.indexOf(' '));
  const disk = field.slice(field.indexOf('\t') + 1);
  return [disk, { ...keyOf(disk), disk, mode, link: mode === LINK_MODE }];
})).values()];

function porcelainOf(text) {
  const fields = fieldsOf(text);
  const rows = [];
  for (let i = 0; i < fields.length; i += 1) {
    const xy = fields[i].slice(0, 2);
    const disk = fields[i].slice(3);
    rows.push({ xy, ...keyOf(disk), disk, ...(/[RC]/.test(xy) ? { from: fields[(i += 1)] } : {}) });
  }
  return rows;
}

const rangeOf = (base, firstParent) => [...LOG, ...(firstParent ? ['--first-parent'] : []), base ? `${base}..HEAD` : 'HEAD'];
const commitsOf = (text) => text.split(RS).filter(Boolean).map((chunk) => {
  const [sha, subject, body, rest = ''] = chunk.split(US);
  return { sha, subject, body: body.trim(), files: rest.split(NUL).map((name) => name.replace(/^\n/, '')).filter(Boolean) };
});

// HEAD's first-parent commits after `base` that another local or remote branch (less `branch`, its copies and a remote's HEAD) holds too.
async function sharedOf(git, base, branch) {
  const not = [...(base ? [`^${base}`] : []), '--'];
  const mine = branch ? [`--exclude=${branch}`, '--branches', `--exclude=*/${branch}`] : ['--branches'];
  const theirs = await git(['log', '--first-parent', '-z', `--format=%H${US}%S`, ...mine, '--exclude=*/HEAD', '--remotes', ...not]);
  const held = new Map(fieldsOf(theirs).map((row) => row.split(US)));
  const line = (await git(['rev-list', '--first-parent', 'HEAD', ...not])).split('\n');
  return line.filter((sha) => held.has(sha)).map((sha) => ({ sha, ref: held.get(sha) }));
}

// check-ignore -v -n -z: four fields a path (source, line, pattern, path); no pattern, or a `!` one, leaves the path to git's eyes.
const quads = (f) => Array.from({ length: Math.floor(f.length / 4) }, (_, i) => f.slice(i * 4, i * 4 + 4));
const looseOf = (text) => quads(text.split(NUL)).filter(([, , p]) => !p || p.startsWith('!')).map(([source, at, p, key]) => ({ key, by: p ? `${source}:${at} ${p}` : null }));

const gitFailed = (verb, res) => fail('git-failed', `${verb}: ${res.error || res.killedBy || res.code}`);

// createGit ({ proc, root, env }) rows: lsFiles { key, refused?, disk, mode, link }; statusZ { xy, key, refused?, disk, from? }; commits {
// sha, subject, body, files }; shared { sha, ref }; tracked the paths git lists; unignored { key, by }; head, branch, author one line or
// null.
function createGit({ proc, root, env = {} }) {
  const child = { env: { ...env, ...CLOSED_ENV }, cwd: root, capBytes: CAP_BYTES };
  let closed = null; // once per port: the config a run reads does not change under it
  const closing = () => (closed ||= proc.run({ cmd: 'git', args: LIST_CONFIG, ...child }).then((res) => {
    if (res.code !== 0 || res.killedBy) throw gitFailed(LIST_CONFIG[0], res);
    return closedArgs(res.stdout);
  }));
  async function git(args, quiet = false) {
    const res = await proc.run({ cmd: 'git', args: [...(await closing()), ...args], ...child });
    if (res.code === 0 && !res.killedBy) return res.stdout;
    if (quiet && res.code === 1) return null;
    throw gitFailed(args[0], res);
  }
  const line = async (args) => (await git(args, true))?.trim() ?? null;
  const head = () => line(['rev-parse', '--verify', '-q', 'HEAD']);
  const resolves = async (rev) => !String(rev).startsWith('-') && (await line(['rev-parse', '--verify', '-q', `${rev}^{commit}`])) !== null;
  const since = async (base, read) => ((await head()) === null ? [] : base && !(await resolves(base)) ? null : read());
  return {
    lsFiles: async () => lsFilesOf(await git(['ls-files', '-z', '--stage'])),
    // --ignore-submodules=dirty: status would start a git inside each submodule, under a config `closing` never saw.
    statusZ: async () => porcelainOf(await git(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--ignore-submodules=dirty'])),
    tracked: async (keys) => (keys.length ? fieldsOf(await git(['ls-files', '-z', '--', ...keys])) : []), // no pathspec would list every file
    // the keys git would show, each with the rule that brought it back or none; check-ignore refuses --literal-pathspecs and -z without
    // --stdin
    unignored: async (keys) => {
      const args = [...(await closing()).filter((arg) => arg !== '--literal-pathspecs'), 'check-ignore', '-v', '-n', '--no-index', '-z', '--stdin'];
      const res = await proc.run({ cmd: 'git', args, ...child, stdin: keys.map((key) => `${key}${NUL}`).join('') });
      if (res.killedBy || ![0, 1].includes(res.code)) throw gitFailed('check-ignore', res); // exit 1 only says none is ignored
      return looseOf(res.stdout);
    },
    head,
    resolves,
    branch: () => line(['symbolic-ref', '-q', '--short', 'HEAD']),
    author: async (key) => ((await head()) && (await line(['log', '-1', '--format=%an', '--', key]))) || null,
    commits: (base, { firstParent = false } = {}) => since(base, async () => commitsOf(await git(rangeOf(base, firstParent)))),
    shared: (base, branch) => since(base, () => sharedOf(git, base, branch)),
  };
}

module.exports = { createGit };
