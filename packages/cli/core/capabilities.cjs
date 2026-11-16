// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: what the installed packages promise and whether code answers it: each verb a manifest routes to its package (its call and render),
// each answer a manifest provides (its entry path), each hook a manifest declares (its handler), each free MCP tool a manifest names (its
// tool table). A promise nothing answers is `capability-missing`, so a removed feature shows as missing, never as silence.
// `entryOf(name)` -> { entry } | { state } (not-installed, broken).
const { entryAt } = require('../contracts/verbs.cjs');

const verbPromises = (verbs) => verbs.flatMap((row) => [row.call, row.render].filter((call) => row.pkg && call)
  .map((call) => ({ what: `verb ${row.words.join(' ')}`, pkg: row.pkg, needs: call, test: (e) => typeof entryAt(e, call) === 'function' })));

const answerPromises = (provides) => Object.entries(provides).map(([what, { pkg, path }]) => ({ what: `answer ${what}`, pkg, needs: path,
  test: (e) => entryAt(e, path) !== undefined }));

const hookPromises = (manifests) => manifests.flatMap((m) => (m.hooks || []).map((h) => ({ what: `hook ${h.event} ${m.name}.${h.handler}`,
  pkg: m.name, needs: `handlers.${h.handler}`, test: (e) => typeof e.handlers?.[h.handler] === 'function' })));

const toolPromises = (manifests) => manifests.flatMap((m) => (m.mcp?.free || []).map((tool) => ({ what: `mcp tool ${tool}`, pkg: m.name,
  needs: `TOOLS ${tool}`, test: (e) => (e.TOOLS || []).some((t) => t.name === tool) })));

/** capabilitiesOf({ verbs, provides, manifests, entryOf }) -> [{ what, pkg, needs, state: answers | capability-missing | not-installed |
 * broken }] */
function capabilitiesOf({ verbs, provides = {}, manifests, entryOf }) {
  const promised = [...verbPromises(verbs), ...answerPromises(provides), ...hookPromises(manifests), ...toolPromises(manifests)];
  return promised.map(({ test, ...p }) => {
    const got = entryOf(p.pkg);
    if (!got.entry) return { ...p, state: got.state };
    return { ...p, state: test(got.entry) ? 'answers' : 'capability-missing' };
  });
}

module.exports = { capabilitiesOf };
