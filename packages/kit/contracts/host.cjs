// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The host's facts every hook reads, one owner; whether a hook's ask reaches a person is run/person's.
/** The write tools, each with the input field that names its file; a shell command's files are read from its text. */
const WRITE_TOOLS = Object.freeze({ Edit: 'file_path', Write: 'file_path', MultiEdit: 'file_path', NotebookEdit: 'notebook_path' });

/** The person's /resume-handoff, as the prompt hook receives it raw (the host's own /resume is not the product's). */
const RESUME_PROMPT = /^\s*\/resume-handoff\b/;
/** A server's tool as the host names it to a session: the one name a call, a permission rule and a text that asks for the call spell. */
const mcpTool = (server, tool) => `mcp__${server}__${tool}`;
/** The host's own call that loads deferred tools by name: a server's tools are names only until a session loads them. */
const toolSearch = (names) => `ToolSearch select:${names.join(',')}`;

module.exports = { WRITE_TOOLS, RESUME_PROMPT, mcpTool, toolSearch };
