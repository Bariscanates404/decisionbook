// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// doctor's release check: the installed files of the open package and of each add-on the finder found, against the MANIFEST.json the
// release build wrote in each (every file with its sha256, and no file it does not list), and the add-on built for this version. A
// checkout has no such file: not measured. The list is not signed: signing it is the publisher's step, and this check says so.
const { hash: { sha256 }, paths: { parentDir, nameOf } } = require('@atlasbound/kit');
const validate = require('../contracts/validate.cjs');

const MANIFEST = 'MANIFEST.json';
const SHOWN = 3;

/** Every file under `dir` but the manifest, relative and sorted: what the install holds now. */
function filesIn(fsAt, dir) {
  const out = [];
  const walk = (rel) => {
    const names = rel ? fsAt(dir).list(rel) : fsAt(parentDir(dir)).list(nameOf(dir));
    if (names === null) out.push(rel);
    else names.forEach((name) => walk(rel ? `${rel}/${name}` : name));
  };
  walk('');
  return out.filter((rel) => rel && rel !== MANIFEST).sort();
}

/** One release folder against its manifest -> { name, dir, version, commit, count, changed, missing, extra }, or null without one. */
function againstManifest(fsAt, { name, dir }) {
  const text = fsAt(dir).readText(MANIFEST);
  if (text === null) return null;
  const { version, commit, files } = validate.json(text, 'manifest-invalid');
  const here = filesIn(fsAt, dir);
  const differs = (rel) => sha256(fsAt(dir).readText(rel)) !== files[rel];
  const listed = Object.keys(files);
  return { name, dir, version, commit, count: listed.length, extra: here.filter((rel) => !Object.hasOwn(files, rel)),
    missing: listed.filter((rel) => !here.includes(rel)), changed: listed.filter((rel) => here.includes(rel) && differs(rel)) };
}

/** What is wrong with one release folder, in a line ('' when nothing is): the files by name, the first few of each list. */
function wrongWith(r, version) {
  const lists = [['changed', r.changed], ['missing', r.missing], ['not in the release', r.extra]].filter(([, list]) => list.length);
  const more = (list) => (list.length > SHOWN ? ` and ${list.length - SHOWN} more` : '');
  const said = lists.map(([what, list]) => `${what} ${list.slice(0, SHOWN).join(', ')}${more(list)}`);
  return [...said, ...(r.version === version ? [] : [`built for ${r.version}, this install is ${version}`])].join('; ');
}

/** The probe row: measured (every file of every release folder matches), failed (which file, in which folder), or not measured. */
function releaseProbe({ machine, version }) {
  const seen = machine.releases().map((at) => againstManifest(machine.fsAt, at)).filter(Boolean);
  if (!seen.length) return { state: 'not-measured', says: `no ${MANIFEST}: a checkout, not a release` };
  const judged = seen.map((r, i) => ({ r, problem: wrongWith(r, version), at: i === 0 ? '' : ` at ${r.dir}` }));
  const bad = judged.filter(({ problem }) => problem).map(({ r, problem }) => `${r.name} ${r.version}: ${problem}`);
  if (bad.length) return { state: 'failed', says: bad.join('; ') };
  const said = judged.map(({ r, at }) => `${r.name} ${r.version} (${String(r.commit).slice(0, 8)})${at}: ${r.count} files match`);
  return { state: 'measured', says: `${said.join('; ')}; the list is not signed` };
}

module.exports = { releaseProbe };
