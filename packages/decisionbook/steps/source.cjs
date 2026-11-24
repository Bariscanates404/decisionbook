// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What the product itself reads at a record's `source`: the one thing that makes words a person did not type someone's (core/whose).
// Two places can be read: a committed line of this repository (`<file>:<line>`: that line, where a commit holds it as it is) and an
// issue or a comment at its address (the root's tracker port: its text). Any other source (a chat, a call, a document
// elsewhere) is read by no one here.
const { bound } = require('../contracts/shapes.cjs');

/** A line `<file>:<line>` of this repository -> { text: that line, as a commit holds it } | { unread } */
async function lineRead(io, source) {
  const at = source.lastIndexOf(':');
  const file = source.slice(0, at);
  const line = Number(source.slice(at + 1));
  const text = (io.fs.readText(file) ?? '').replace(/\n$/, '').split('\n')[line - 1];
  if (text === undefined) return { unread: 'unreadable' };
  const [held] = (await io.git.tracked([file])).includes(file) ? await io.git.blame(file, line) : [];
  return held?.sha ? { text } : { unread: 'not-committed' }; // a line the work tree changed is no commit's (blame names none)
}

/** -> { text } where the product read the source itself, else { unread: why } */
async function sourceRead(io, source) {
  if (!bound.problems('ref', source).length) return lineRead(io, source);
  return (await io.tracker.read(source)) ?? { unread: 'unreadable' };
}

module.exports = { sourceRead };
