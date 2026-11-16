// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// THE package finder and loader. Which packages of the product are on disk and where: the open package's own sit beside the cli (node's
// own resolution from here), an add-on's where the add-on lays them. Each manifest is data (package.json `atlasbound`, read without
// loading code); an entry is loaded by its directory. The modules, the verb table, the answers between packages, the free verbs, the next
// steps and the plain names are made from the manifests found. Nothing here names a package; the composition root hands the one file
// reader (`fsAt`).
const { errors: { fail, isFail }, paths: { parentDir } } = require('@atlasbound/kit');
const validate = require('../contracts/validate.cjs');
const { CLI_VERBS, CLI_FREE, CLI_NEXT, MODULES, under, route, tableWords, valueFlags, entryAt } = require('../contracts/verbs.cjs');
const { isOn, onHere } = require('../core/modules.cjs');

const SCOPE = '@atlasbound';

/** A matcher that cannot compile would stop the whole port at its first event; it is refused where the manifest is read. */
function compiled(matcher) {
  try {
    return new RegExp(matcher || '');
  } catch (err) {
    throw fail('manifest-invalid', `matcher: ${err.name}`);
  }
}

/** The module rows the add-ons installed here bring (a manifest's `module`), each with the folder its packages lie in: looked for in
 * every package of the scope in this file's resolution folders (node's `module.paths`) and in the folder an add-on found there lays its
 * packages in (its manifest's `atlasbound.lib`, which the release build writes). Such a module is wired only when a person names it. A
 * row that does not read, or takes a name or a package the open data or an earlier row holds, is left out and named (`taken`). */
function addOnModules(fsAt) {
  const scopeAt = (at, from) => (fsAt(at).list(SCOPE) ?? []).map((name) => ({ dir: `${at}/${SCOPE}/${name}`, from }))
    .map((one) => ({ ...one, pkg: validate.jsonOrNull(fsAt(one.dir).readText('package.json')) ?? {} }));
  const beside = module.paths.flatMap((at) => scopeAt(at, null));
  const inside = beside.filter(({ pkg }) => pkg.atlasbound?.lib)
    .flatMap(({ dir, pkg }) => scopeAt(`${dir}/${pkg.atlasbound.lib}`, { name: pkg.name, dir }));
  const namesOf = (m) => [m.name, ...(m.alias ?? []), ...m.packages];
  const held = new Set([...MODULES.base, ...MODULES.modules.flatMap(namesOf)]);
  const places = [];
  const taken = [];
  const seen = new Set();
  for (const { dir, from, pkg } of [...beside, ...inside].filter((one) => one.pkg.atlasbound?.module)) {
    if (seen.has(pkg.name)) continue; // node's own rule: the first folder that holds a package answers for it
    seen.add(pkg.name);
    const row = pkg.atlasbound.module;
    if (validate.refusal('ModuleRow', row) || namesOf(row).some((name) => held.has(name))) taken.push(`${pkg.name}: module`);
    else {
      namesOf(row).forEach((name) => held.add(name));
      places.push({ row: { ...row, optIn: true }, lib: parentDir(dir), from });
    }
  }
  return { places, taken };
}

/** Where each package of the data is and its manifest, or the coded refusal its manifest met: one row per package. */
function foundRows(fsAt, { base, modules }, places) {
  const readable = (dir, key) => fsAt(dir).readText(key) !== null;
  // the first of this file's resolution folders (node's `module.paths`) holding `name` with `key`: the open package's own bundle, a
  // workspace link, or a package npm put beside the open one; else the folder the add-on that brings its module lays its packages in
  const resolved = (name, key) => module.paths.map((p) => `${p}/${name}`).find((dir) => readable(dir, key)) ?? null;
  function located(name) {
    const own = resolved(`${SCOPE}/${name}`, 'index.cjs');
    if (own) return { dir: own, from: null };
    const place = places.find(({ row }) => row.packages.includes(name));
    return place && readable(`${place.lib}/${name}`, 'index.cjs') ? { dir: `${place.lib}/${name}`, from: place.from } : null;
  }
  function manifestOf(dir) {
    const read = validate.json(fsAt(dir).readText('package.json'), 'manifest-invalid') || {};
    const manifest = validate.shape('Manifest', read.atlasbound || {});
    (manifest.hooks || []).forEach((h) => compiled(h.matcher));
    return manifest;
  }
  return [...base, ...modules.flatMap((m) => m.packages)].map((name) => {
    const at = located(name);
    if (!at) return { name, dir: null, from: null, manifest: null, problem: null };
    try {
      return { name, ...at, manifest: manifestOf(at.dir), problem: null };
    } catch (err) {
      if (!isFail(err)) throw err;
      return { name, ...at, manifest: null, problem: err };
    }
  });
}

/** The answers the manifests offer: name -> { pkg, path }; a name two packages offer is a conflict, the first one answers. */
function providesOf(read) {
  const provides = {};
  const conflicts = [];
  read.forEach(({ name, manifest }) => Object.entries(manifest.provides ?? {}).forEach(([what, path]) => {
    if (provides[what]) conflicts.push(`${what}: ${provides[what].pkg} and ${name}`);
    else provides[what] = { pkg: name, path };
  }));
  return { provides, conflicts };
}

/** A module with a package not here, whose verb words begin `words`: that module and the packages it lacks, for the line such a verb
 * answers; null for any other words. */
function missingOf(rows, modules) {
  const lacks = (m) => m.packages.filter((name) => !rows.find((r) => r.name === name).dir);
  const says = (m, words) => (m.words ?? []).some((said) => said.split(' ').every((w, i) => words[i] === w));
  return (words) => {
    const module = modules.find((m) => lacks(m).length && says(m, words));
    return module ? { ...module, lacks: lacks(module) } : null;
  };
}

/** The table and its reads, from what is on disk, before any repository is opened (argv routes with it); `modules`: the base and every
 * module here, the add-ons' rows first (their packages answer before the open ones). */
function catalogOf(rows, modules, taken) {
  const read = rows.filter((r) => r.manifest);
  const { provides, conflicts } = providesOf(read);
  const own = (key) => read.flatMap((r) => (r.manifest[key] ?? []).map((item) => ({ item, pkg: r.name })));
  const verbs = [...CLI_VERBS, ...own('verbs').map(({ item, pkg }) => ({ ...item, pkg }))];
  return Object.freeze({
    verbs, provides, modules, conflicts: [...conflicts, ...taken], valueFlags: valueFlags(verbs),
    route: (words) => route(verbs, words), under: (words) => under(verbs, words), tableWords: (words) => tableWords(verbs, words),
    free: [...CLI_FREE.map((words) => ({ words, pkg: null })), ...own('free').map(({ item, pkg }) => ({ words: item, pkg }))],
    next: [...CLI_NEXT.map((row) => ({ ...row, pkg: null })), ...own('next').map(({ item, pkg }) => ({ ...item, pkg }))]
      .sort((a, b) => a.step - b.step),
    tasks: verbs.flatMap((row) => row.tasks ?? []), hookConfig: [...new Set(own('hookConfig').map(({ item }) => item))],
    plain: (name) => rows.find((r) => r.name === name)?.manifest?.plain || name,
    missing: missingOf(rows, modules.modules),
  });
}

/** What is on disk and on here, no package code loaded: `has` (on disk), `wired` (on disk and its module on here: never set up, the
 * plain set), each wired manifest, and why an answer has no provider (`absent`: off | not-installed | null, by the answer's name). */
function packagesOf({ rows, fsAt }, { provides, modules }, { chosen, trace, run }) {
  const rowOf = (name) => rows.find((r) => r.name === name);
  const has = (name) => Boolean(rowOf(name)?.dir);
  const wired = (name, on = onHere(modules.modules, chosen())) => has(name) && isOn(modules, name, on);
  function declared(on = onHere(modules.modules, chosen())) {
    const listed = rows.filter((r) => wired(r.name, on));
    listed.filter((r) => r.problem).forEach((r) => trace.event(run, 'packages', { code: r.problem.code, msg: `${r.name}: ${r.problem.message}` }));
    return { manifests: listed.filter((r) => r.manifest).map((r) => ({ name: r.name, ...r.manifest })),
      problems: listed.filter((r) => r.problem).map((r) => `${r.name} (${r.problem.code})`) };
  }
  const absent = (what) => {
    const by = provides[what];
    if (by && wired(by.pkg)) return null;
    return by ? 'off' : 'not-installed';
  };
  const where = (name) => (has(name) ? { dir: rowOf(name).dir, from: rowOf(name).from } : null);
  // one data file `rel` of every package on disk, as text, read without loading its code: how a package reads what the others declare
  const dataOf = (rel) => rows.filter((r) => r.dir).map((r) => ({ name: r.name, text: fsAt(r.dir).readText(rel) }));
  return { names: rows.map((r) => r.name), has, wired, declared, absent, where, dataOf, manifestOf: (name) => rowOf(name)?.manifest ?? null,
    readFrom: (name, key) => fsAt(rowOf(name).dir).readText(key) };
}

/** Loading by directory: a package's entry, its io (the shared io, the answers its manifest `needs`, its own trace words), and one answer
 * by name for the cli itself. */
function loaderOf(found, { provides }, { shared, tracer }) {
  function load(name) {
    const at = found.where(name);
    if (!at) throw fail('package-not-installed', name);
    try {
      return require(`${at.dir}/index.cjs`); // the one entry every package has, the file the finder found
    } catch (err) {
      throw fail('package-broken', `${name}: ${String(err.message).split('\n')[0]}`);
    }
  }
  /** What `what` answers, or `none` while its provider is off or absent: a function of the provider's entry is called with its own io. */
  function answer(what, none, ...args) {
    const by = provides[what];
    if (!by || !found.wired(by.pkg)) return none;
    const value = entryAt(load(by.pkg), by.path);
    return typeof value === 'function' ? value(ioFor(by.pkg), ...args) : value;
  }
  function ioFor(name) {
    const { vocabulary } = load(name);
    const needs = found.manifestOf(name)?.needs ?? {};
    const answers = Object.fromEntries(Object.entries(needs).map(([what, none]) => [what, (...args) => answer(what, none, ...args)]));
    return Object.freeze({ ...shared, ...answers, trace: vocabulary ? tracer.forPackage(name, vocabulary) : tracer });
  }
  return { load, ioFor, answer: (what, ...args) => answer(what, null, ...args) };
}

/** One finder per process: the disk is read once, every compose of this process shares it. */
function createFinder(fsAt) {
  const { places, taken } = addOnModules(fsAt);
  const modules = Object.freeze({ base: MODULES.base, modules: [...places.map((place) => place.row), ...MODULES.modules] });
  const rows = foundRows(fsAt, modules, places);
  const catalog = catalogOf(rows, modules, taken);
  // each add-on a package was found in, once: the release folders beside the open package's own
  const addOns = () => [...new Map(rows.filter((r) => r.from).map((r) => [r.from.name, r.from])).values()];
  return {
    catalog,
    addOns,
    packages: (ctx) => packagesOf({ rows, fsAt }, catalog, ctx),
    loader: (found, ctx) => loaderOf(found, catalog, ctx),
  };
}

module.exports = { createFinder };
