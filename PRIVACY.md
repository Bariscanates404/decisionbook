# Privacy: the open package `atlasbound`

This describes the package `atlasbound` (the shared base, the command line, DecisionBook, Handoff and the telemetry module).

## Where it runs

On your machine, inside your repository, when your AI session (Claude Code) calls its hooks or when you type an `atlasbound` command.
It has no server. Its code opens one kind of network connection, described under Telemetry; in this build it opens none.

## What it stores, and where

In the repository:

- What `setup` wires: the hooks and the commands it allows in `.claude/settings.local.json`, the four slash commands in
  `.claude/commands/`, and a block in `.gitignore` that keeps all of these out of git, and
  `.atlasbound/*` too. In a clone nobody set up yet, also one team notice row in `.claude/settings.json`, a file a team
  commits: it holds no path of this machine and no text of yours, and it tells a teammate's session once that the repository
  uses DecisionBook.
- `.decisionbook/`: the plans, decisions, assumptions and checks your AI session recorded, and its config. A decision, a
  confirmation and a plan set aside each hold your answer in your own words, by design. It is yours to commit.
- `.atlasbound/trace/`: what each step of the product did: step names, codes, counts, times, digests, paths inside the repository and
  short error texts with secrets scrubbed. The hooks' day files are kept for the last 14 days that have one, unless your config says
  otherwise; the file of a typed command is kept until you remove it.
- `.atlasbound/cli/`: what setup wrote, so uninstall can take it back, the product's config, and per session digests of what the session
  was told, never the text.
- `.atlasbound/telemetry/`: every daily report made here (waiting, received or refused, 14 days) and when the next attempt is due.
- `.atlasbound/drafts/`: a record your AI session wrote for a command to read, in that session's own folder; removed once the command
  took it, kept when the command refused it, so a refused one may hold your answer in your own words.

In your home folder, under `~/.atlasbound/`, created for your user only on macOS and Linux (folders 0700, files 0600); Windows has no
such modes, so there it has the permissions it inherits from your user profile:

- `decisionbook-here/<key>/` and `handoff-here/<key>/`, one key per repository (a digest of its path). DecisionBook keeps there the
  statements of yours it took from your prompts, what each session read and was given, and which prompts of a session were yours, with
  their times. Handoff keeps there its notes per branch, the prompts it journals and the files each session edited. What you
  typed is kept here and not in the repository, with the one exception above: the answers a plan file records. The
  trace keeps a digest of what a step was given, never the text of your prompt; telemetry holds step counts, ranges and outcome codes.
- `telemetry-consent.json`: your choice per module. `telemetry-period.json`: a random id that changes every 30 days and the token that
  can delete what it sent.

`atlasbound uninstall`, typed by you at a plain terminal with the phrase it names, takes back what setup wrote and removes the product's
own folders in `.atlasbound/` (`cli`, `trace` and `telemetry`). `atlasbound uninstall --purge` also deletes
the rest of this repository's stores, `.decisionbook/` when git does not track it, and this repository's folders in `~/.atlasbound/`; it
keeps the team's files and says what is left in `~/.atlasbound/`, which `rm -rf ~/.atlasbound` removes.

## What it sends

Nothing in this build: telemetry has no address.

- Your code, your records, your prompts and your paths are never sent by this package.
- The texts the hooks add to your AI session become part of that session, which your own AI provider receives under your own account, as
  it receives the rest of the session.
- No command of this package starts a model or your `claude` command line.

## Telemetry

In this build the address is empty: nothing is sent and setup does not ask. You can turn it on to read the reports it would send
(`atlasbound telemetry on`, then `atlasbound telemetry next` and `history`).

What a later release with an address does: once a day, from a command you or your AI session runs (never from a hook), it sends one
report per module and finished day to AtlasBound, through a Cloudflare Worker at telemetry.atlasbound.dev, to find the product's faults
and slow steps. Setup tells you first, at a plain terminal, and asks (Enter = yes); `atlasbound telemetry on [module]`, typed by you
with the phrase it names, turns it on; no environment variable, AI session or program that types for you can. Every field of a report:

| field | what it holds |
|---|---|
| id | a random id of this report, so the server stores it once |
| period | a random id that changes every 30 days and on `atlasbound telemetry reset` |
| verifier | the SHA-256 of that period's deletion token, so the server can check a deletion |
| module, schema, policy, module_policy | which module, which version of its metrics, which collection your choice covered |
| release | the official version (x.y.z), or absent |
| node, os | Node's major version and the OS family (macos, linux, windows, other) |
| day | the UTC day, never a time of day |
| consent | whether you chose, or the beta's default applied |
| clock_suspect | present when that day's clock went backwards |
| metrics | counts and ranges, each a closed word of the table below |

| module | metric | what it counts |
|---|---|---|
| every module | step, step_ms, code, failure, decision | how often each of its steps ran and how it ended, how long it took (in ranges; never for a step that asks you), the outcome codes it said, a failure's code (never its text), a gate's verdict and reason code |
| cli | hook_incomplete, health, doctor_problems | host calls that came in and never went out, telemetry's own losses and refusals, doctor's problems (a range) |
| db | ready_unmet, phase_seconds, phase_turns, create_records, answers_bound, stop_unrecorded | open points at READY, time and turns until a plan is READY (your and the AI's pace), decisions per plan, answers recorded as yours, answers not recorded at stop (ranges, or counts) |
| handoff | note_kept, note_messages | lines and messages of a handoff note (ranges) |

Each count carries only these words with it: the step (a name of the product's own steps), the outcome (ok or failed), the outcome or
failure code, a gate's verdict (allow, ask, deny), the range, telemetry's own health kind, and on the command line's hook steps the host
event it answered (SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, PreCompact). A word outside these lists leaves as other.

The command line's own counts include how often and how long it ran each module's hook handlers, also of a module whose telemetry you
turned off: not which module, not what the handler did.

`DO_NOT_TRACK`, `ATLASBOUND_TELEMETRY=0` and `CI` stop the process they are set in from making or sending a report. What that process did
is still in the local trace; if a later process runs without the switch while telemetry is on, that day's report counts it. Set the
switch for your whole session, or use `atlasbound telemetry off`, to keep a day out.

A request carries the content type and the fixed headers of Node's fetch (user-agent `node`, accept, accept-language, sec-fetch-mode,
accept-encoding), nothing of your machine or of you. When the service opens: Cloudflare will process your IP address to deliver the request; our store will keep no IP address and request
logging will be off, checked with a real request before it opens. Reports are kept 30 days per id, then only monthly totals for 13
months, with small groups left out.

See: `atlasbound telemetry next` (the exact request, before it leaves) and `history`. Stop: `atlasbound telemetry off [module]`. Delete:
`atlasbound telemetry reset --forget`. `atlasbound uninstall` removes the reports kept here; to have the server's copy deleted, run
`atlasbound telemetry reset --forget` first (otherwise it expires in 30 days).

## Contact

Questions and reports go to the public repository's issue tracker: https://github.com/Bariscanates404/decisionbook/issues. Report a
security problem privately, through GitHub's "Report a vulnerability" on that repository.
