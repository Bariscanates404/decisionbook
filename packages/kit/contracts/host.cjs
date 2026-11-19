// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The host's facts every hook reads, one owner; whether a hook's ask reaches a person is run/person's.
const { sha256 } = require('../base/hash.cjs');
/** The write tools, each with the input field that names its file; the shell tools, each with the language of the `command` whose files
 * are read from its text (Windows' host has the second). */
const WRITE_TOOLS = Object.freeze({ Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' });
const SHELL_TOOLS = Object.freeze({ Bash: 'sh', PowerShell: 'powershell' });
// the forms that set one for what runs: `NAME=…` before a command or after export/env/declare, `$env:NAME =`, export, unset, declare -x,
// env -u (`<N>`: the name); a quoted string is text, never one of them
const SETS = ['(?<![\\w$:./-])<N>=', '\\$env:<N>\\s*=', '\\b(?:export|unset|declare|typeset|readonly)\\b[^;&|\\n]*(?<![\\w$])<N>(?!\\w)',
  '\\benv\\b[^;&|\\n]*(?:-u\\s*|--unset=)<N>(?!\\w)', '\\bRemove-Item\\s+env:<N>(?!\\w)'];
/** Of `names` (the variables the host sets for what a session runs: which project, session and host process a verb acts for), those a
 * shell command sets, exports or unsets for what it runs; one it only names or reads passes. */
const setsHostEnv = (command, names) => names.filter((name) => SETS.some((form) => new RegExp(form.replaceAll('<N>', name), 'u')
  .test(String(command).replace(/'[^']*'|"(?:[^"\\]|\\.)*"/gu, "''"))));

/** The person's /resume-handoff, as the prompt hook receives it raw (the host's own /resume is not the product's). */
const RESUME_PROMPT = /^\s*\/resume-handoff\b/;
/** A server's tool as the host names it to a session: the one name a call, a permission rule and a text that asks for the call spell. */
const mcpTool = (server, tool) => `mcp__${server}__${tool}`;
/** The host's own call that loads deferred tools by name: a server's tools are names only until a session loads them. */
const toolSearch = (names) => `ToolSearch select:${names.join(',')}`;
/** THE drafts folder (ignored store): each session writes a verb's JSON in its own folder here; the verb reads it, then drops it. */
const DRAFTS = '.atlasbound/drafts/';
/** A session's own drafts folder (a digest of its id), or the folder itself where no session acts (a person at their terminal). */
const draftsOf = (session) => (session ? `${DRAFTS}${sha256(String(session)).slice(0, 12)}/` : DRAFTS);
/** The one form a text hands a call whose JSON a session sends: the draft in its own folder, then the call (no brace or quote). */
const draftCall = (command, name, json, session) => `write this JSON with your Write tool to ${draftsOf(session)}${name}.json:\n${json}\n`
  + `then run: ${command} --file ${draftsOf(session)}${name}.json`;

module.exports = { WRITE_TOOLS, SHELL_TOOLS, setsHostEnv, RESUME_PROMPT, DRAFTS, draftsOf, mcpTool, toolSearch, draftCall };
