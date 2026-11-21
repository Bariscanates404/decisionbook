// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The host's facts every hook reads, one owner; whether a hook's ask reaches a person is run/person's.
const { sha256 } = require('../base/hash.cjs');
const { isFail } = require('../base/errors.cjs');
const { OWN_STORE } = require('../base/paths.cjs');
const COMMANDS = require('./commands.json');
/** The write tools, each with the input field that names its file; the shell tools, each with the language of the `command` whose files
 * are read from its text (Windows' host has the second). */
const WRITE_TOOLS = Object.freeze({ Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' });
const SHELL_TOOLS = Object.freeze({ Bash: 'sh', PowerShell: 'powershell' });
/** The person's /resume-handoff, as the prompt hook receives it raw (the host's own /resume is not the product's). */
const RESUME_PROMPT = /^\s*\/resume-handoff\b/;
/** The files of the repository's commands folder (`listed`: a folder's file names, null with none); a folder that does not read holds
 * no command, so it never costs the person a message. */
function commandFiles(listed) {
  try {
    return listed(COMMANDS.folder) || [];
  } catch (err) {
    if (!isFail(err)) throw err;
    return [];
  }
}
/** The person's own words in a prompt as the prompt hook receives it raw. Of `/name words` the host takes the name as a command where
 * the repository's commands folder holds it: only the words after it are theirs. Any other prompt is theirs whole, a sentence that
 * opens with a path too. Named limit: a command that folder does not hold itself (one of a folder inside it, a skill of the
 * repository, the person's home folder's, a plugin's) is not seen, and its name stays among their words. */
function personWords(prompt, listed) {
  const typed = String(prompt ?? '');
  const opened = typed.trimStart();
  const [first] = opened.split(/\s/u, 1);
  const named = first.length > 1 && first.startsWith('/');
  return named && commandFiles(listed).some((file) => `/${file}` === `${first}${COMMANDS.ending}`) ? opened.slice(first.length).trimStart() : typed;
}
/** A server's tool as the host names it to a session: the one name a call, a permission rule and a text that asks for the call spell. */
const MCP = 'mcp__';
const mcpTool = (server, tool) => `${MCP}${server}__${tool}`;
/** An MCP tool's host name back to { server, tool } (the server is what stands before the first `__`), or null for any other tool. */
function mcpToolOf(name) {
  const rest = String(name ?? '').startsWith(MCP) ? String(name).slice(MCP.length) : '';
  const at = rest.indexOf('__');
  return at > 0 && at + 2 < rest.length ? { server: rest.slice(0, at), tool: rest.slice(at + 2) } : null;
}
/** The host's own call that loads deferred tools by name: a server's tools are names only until a session loads them. */
const toolSearch = (names) => `ToolSearch select:${names.join(',')}`;
/** THE drafts folder (ignored store): each session writes a verb's JSON in its own folder here; the verb reads it, then drops it. */
const DRAFTS = `${OWN_STORE}drafts/`;
/** A session's own drafts folder (a digest of its id), or the folder itself where no session acts (a person at their terminal). */
const draftsOf = (session) => (session ? `${DRAFTS}${sha256(String(session)).slice(0, 12)}/` : DRAFTS);
/** The one form a text hands a call whose JSON a session sends: the draft in its own folder, then the call (no brace or quote). */
const draftCall = (command, name, json, session) => `write this JSON with your Write tool to ${draftsOf(session)}${name}.json:\n${json}\n`
  + `then run: ${command} --file ${draftsOf(session)}${name}.json`;

module.exports = { WRITE_TOOLS, SHELL_TOOLS, RESUME_PROMPT, personWords, DRAFTS, draftsOf, mcpTool, mcpToolOf, toolSearch, draftCall };
