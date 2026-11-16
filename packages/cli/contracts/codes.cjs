// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The cli's verdict and reason strings, on top of kit's table: a kit primitive can fail inside any verb.
const { codes: { createCodes } } = require('@atlasbound/kit');

module.exports = createCodes([
  ['package-not-installed', 'the package is not installed'],
  ['package-broken', 'the package is present but does not load'],
  ['package-unread', 'a package could not answer a question about its stores; what it holds stays, and is named'],
  ['hint-unread', 'telemetry could not give its hint line, so none is said'],
  ['server-empty-fine', 'empty here, not a problem: the server stays wired and lists a tool once it holds a record'],
  ['notice-unread', 'DecisionBook could not say what is protected, so no line is said'],
  ['manifest-invalid', 'a package manifest has the wrong shape'],
  ['args-invalid', 'the arguments of this verb have the wrong shape'],
  ['verb-unknown', 'no such verb'],
  ['flag-needs-value', 'this flag takes a value and none was given'],
  ['flag-unknown', 'this verb does not take this flag; nothing was done'],
  ['not-a-repo', 'not inside a git repository; run git init here first, or name one with --target'],
  ['target-is-product', 'this is the product itself, not a repository to wire'],
  ['root-unsafe', 'a home or temp directory is not a project, even with a .git in it; nothing was written; run this in the repository, or name it ' +
    'with --target'],
  ['install-path-unsafe', 'the install path holds a character no quoted shell command can carry; reinstall elsewhere'],
  ['host-invalid', 'a host configuration file is not the expected JSON; fix it, nothing was overwritten'],
  ['file-foreign', 'a file of yours is at a path setup needs; it was not touched'],
  ['schema-major', 'a file from an unknown major version'],
  ['hook-input-invalid', 'the host sent something that is not a hook event'],
  ['hook-handler-threw', 'a hook handler failed with an uncoded error'],
  ['hook-timeout', 'a hook handler did not answer in time'],
  ['hook-deny', 'the merged verdict is deny'],
  ['hook-ask', 'the merged verdict is ask'],
  ['hook-allow', 'the merged verdict is allow'],
  ['hook-none', 'no handler formed a verdict'],
  ['hook-noted', 'a handler or the port\'s own step failed; the reply\'s note names which and its code'],
  ['hook-lost', 'a gate formed no verdict on this write, so it asks: allow it only if you meant it'],
  ['hook-host-call', 'a hook call that carries the person\'s words came from the AI host itself: the host holds the other end of its output'],
  ['hook-host-unjudged', 'a hook call that carries the person\'s words was heard on a platform where its caller cannot be told: a named limit'],
  ['hook-not-host', 'this hook call carries a person\'s words and did not come from the AI host itself (the host holds the other end of ' +
    'its hook\'s output), so no one heard it and nothing was recorded as the person\'s: theirs is only what they send in the session'],
  ['hook-only-host', 'the hook event that carries the person\'s words is called by the AI host alone: a shell command naming it does not run'],
  ['doctor-problem', 'a package check failed'],
  ['capability-missing', 'a verb, hook or MCP tool the product promises has no code that answers it'],
  ['run-interrupted', 'stopped by a signal; what was recorded stays and nothing runs on'],
  ['child-hard-stop', 'a background child past the bound its starter gave it ended itself; its verb ran no further'],
  ['setup-run-failed', 'a package\'s first run at setup failed; the wiring is done'],
  ['file-linked', 'a link in its path refused this one write, the rest is installed; to have this file too, make that folder a real one and run setup again'],
  ['settings-committed',
    'a settings file that came with this repository lets your AI host act without asking you; setup did not write these rows, so read them before ' +
      'you trust this folder'],
  ['mcp-tracked', '.mcp.json is tracked, and it now names this machine\'s node and install: do not commit that change; a teammate runs atlasbound ' +
    'setup for their own'],
  ['committed-unread', 'setup could not read what a commit brought in the host files; the wiring is done'],
  ['ignore-unasked', 'setup could not ask git which of its files git would show; the wiring is done'],
  ['ignore-defeated', 'git would show these files setup wrote and keeps out of git (the settings and .mcp.json name this machine\'s paths): commit none of them; the rule in brackets brings each back'],
  ['protect-refused', 'nothing was written; atlasbound protect lists what you could choose'],
  ['store-foreign', 'not a store this version writes: you or another tool put it here'],
  ['module-refused', 'nothing was written; atlasbound modules names every module and which are on here'],
  ['module-off', 'a hook row of a module that is off here: it does nothing; atlasbound modules on <name> turns the module back on'],
  ['verb-module-off', 'a verb of a module that is off here: it answers the module\'s one line and writes its own trace row, nothing else'],
  ['module-kept-data', 'your data stays: only the hook rows, commands, MCP servers and allow rules setup wrote went'],
  ['module-kept-home', 'what this repository left in your home (your words among them); atlasbound uninstall --purge removes it'],
  ['store-absent', 'the store of a product package that is not installed here'],
  ['phrase-not-typed', 'the phrase was not typed as shown, so nothing was done'],
  ['person-only', 'only a person may run this, at a plain terminal of their own: ask them to type the command above; nothing was done'],
  ['person-wrapped', 'a program that can type for a person stands above this terminal, and this act takes a protection away: run ' +
    'the command above in a plain terminal window; nothing was done'],
  ['person-only-shell', 'a verb only a person runs, so a shell command that names it, bare or through a wrapper, does not run: ask ' +
    'the person to type it with its words in a terminal of their own. A guard for an AI that works in the open, not a sandbox: ' +
    'atlasbound debug who shows each such act and who ran it'],
  ['actor-terminal', 'a person acts: a terminal with no AI session mark and no AI host above it'],
  ['actor-prompt', 'the AI acts in a session that holds a person\'s prompt; the row names its time'],
  ['actor-ai', 'the AI acts and nothing shows a person behind it; could not tell reads the same'],
  ['inject-handshake-unread', 'the package that declares the MCP server exports no handshake text to start it with, so debug inject cannot measure it; nothing was written'],
]);
