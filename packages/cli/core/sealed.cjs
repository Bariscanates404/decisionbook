// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// PURE: whether a write tool's input changes the product's own entries in a host file it shares with the person: the settings file's
// hooks and permissions and the word that switches every hook off, the .gitignore block. A text the edit cannot be placed in, a notebook
// edit, or a settings text that is no JSON object changes them (the host would read no row).
const validate = require('../contracts/validate.cjs');
const { ignoreParts } = require('./host.cjs');

/** The text a write tool leaves in `before`, or null where it cannot be told. */
function afterOf(before, tool, input) {
  if (tool === 'Write') return String(input.content ?? '');
  const edits = { Edit: [input], MultiEdit: input.edits }[tool];
  return Array.isArray(edits) ? edits.reduce((text, one) => (text !== null && text.includes(one.old_string) ? (one.replace_all
    ? text.split(one.old_string).join(one.new_string) : text.replace(one.old_string, () => one.new_string)) : null), before ?? '') : null;
}

const settingsOwn = (text) => {
  const value = text ? validate.jsonOrNull(text) : {};
  return value && typeof value === 'object' && !Array.isArray(value)
    ? JSON.stringify([value.hooks ?? null, value.permissions ?? null, value.disableAllHooks ?? null]) : null;
};

// what is the product's in a text, by the file's kind: the .gitignore block is the one setup reads (core/host)
const OWN = { settings: settingsOwn, ignore: (text, marks) => ignoreParts(text, marks).block?.join('\n') ?? null };

/** `kind`: settings or ignore (with its `marks`) -> whether the write changes what is the product's there. */
function changesOwn({ kind, marks }, before, tool, input) {
  const after = afterOf(before, tool, input);
  const [was, now] = [before, after].map((text) => OWN[kind](text, marks));
  return after === null || now !== was || (kind === 'settings' && now === null);
}

module.exports = { changesOwn };
