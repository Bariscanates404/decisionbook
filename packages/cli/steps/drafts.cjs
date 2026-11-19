// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The JSON of a verb that takes it (its row names `stdin`) as a draft: `--file <path>` (relative: from the command's folder), a file an AI
// session wrote into its own drafts folder (kit's draftsOf, git-ignored), read only there and never through a link; it goes once its verb
// wrote it, and stays when refused, to fix and send again: the refusal says so, and with which tool (a shell patch asks the person).
const { errors: { fail, isFail }, paths: { resolveFrom }, host: { draftsOf }, text: { lines: { filled } } } = require('@atlasbound/kit');
const { WORDS: { drafts: W } } = require('../contracts/codes.cjs');

/** The draft `--file` names, from the acting session's own folder, as { key, text }; null where the flag is not given. */
function draftGiven(io, row, { flags, rest }, cwd) {
  if (flags.file === undefined) return null;
  if (row.stdin !== rest.length) throw fail('draft-refused', filled(W.both, { words: row.words.join(' ') }));
  const given = String(flags.file);
  const key = io.fs.keyAt(resolveFrom(cwd, given));
  const own = draftsOf(io.session); // another session's draft is never read
  if (key === null || !key.startsWith(own)) throw fail('draft-refused', filled(W.outside, { given, drafts: own, root: io.root }));
  const text = io.fs.readText(key, { noLink: true });
  if (text === null) throw fail('draft-refused', filled(W.none, { given }));
  return { key, text: text.trim() };
}

/** Remove the draft once its verb ran whole (exit 0); a refusal keeps it. */
function dropDraft(io, draft, out) {
  if (draft && !(out && out.exit)) io.fs.remove(draft.key);
}

/** A verb's refusal of the draft it read, with the way on as its last line; any other error as it is. */
const draftKept = (err, draft) => (draft && isFail(err)
  ? Object.assign(err, { routes: [...(err.routes || []), filled(W.kept, { key: draft.key })] }) : err);

module.exports = { draftGiven, dropDraft, draftKept };
