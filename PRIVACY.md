# Privacy: the open package `atlasbound`

This describes the package `atlasbound` (the shared base, the command line, DecisionBook, Handoff and the telemetry module).

## Where it runs

On your machine, inside your repository, when your AI session (Claude Code) calls its hooks or when you type an `atlasbound` command.
It has no server. Its code opens no network connection, with the one exception under Telemetry below.

## What it stores, and where

In the repository:

- What `setup` wires: the hooks and the commands it allows in `.claude/settings.local.json`, the four slash commands in
  `.claude/commands/`, and a block in `.gitignore` that keeps all of these out of git, and
  `.atlasbound/*` too.
- `.decisionbook/`: the plans, decisions, assumptions and checks your AI session recorded, and its config. A decision, a
  confirmation and a plan set aside each hold your answer in your own words, by design. It is yours to commit.
- `.atlasbound/trace/`: what each step of the product did: step names, codes, counts, times, digests, paths inside the repository and
  short error texts with secrets scrubbed. The hooks' day files are kept for the last 14 days that have one, unless your config says
  otherwise; the file of a typed command is kept until you remove it.
- `.atlasbound/cli/`: what setup wrote, so uninstall can take it back, the product's config, and per session digests of what the session
  was told, never the text.
- `.atlasbound/telemetry/`: the day telemetry last showed its one-line hint, and a copy of what was sent, if anything ever was.

In your home folder, under `~/.atlasbound/`, created for your user only (folders 0700, files 0600):

- `decisionbook-here/<key>/` and `handoff-here/<key>/`, one key per repository (a digest of its path). DecisionBook keeps there the
  statements of yours it took from your prompts, what each session read and was given, and which prompts of a session were yours, with
  their times. Handoff keeps there its notes per branch, the prompts it journals and the files each session edited. What you
  typed is kept here and not in the repository, with the one exception above: the answers a plan file records. The
  trace keeps a digest of what a step was given, never the text of your prompt, and telemetry holds counts only.
- `telemetry-consent.json`: whether you turned telemetry on.

`atlasbound uninstall`, typed by you at a plain terminal with the phrase it names, takes back what setup wrote and removes the product's
own folders in `.atlasbound/` (`cli`, `trace`, and `telemetry` when nothing was ever sent). `atlasbound uninstall --purge` also deletes
the rest of this repository's stores, `.decisionbook/` when git does not track it, and this repository's folders in `~/.atlasbound/`; it
keeps the team's files and says what is left in `~/.atlasbound/`, which `rm -rf ~/.atlasbound` removes.

## What it sends

Nothing, by default.

- Your code, your records, your prompts and your paths are never sent by this package.
- The texts the hooks add to your AI session become part of that session, which your own AI provider receives under your own account, as
  it receives the rest of the session.
- No command of this package starts a model or your `claude` command line.

## Telemetry

Off unless you turn it on yourself, typed at a plain terminal: `atlasbound telemetry on`, then the phrase it asks for (`turn on
telemetry`); no environment variable, no AI session and no program that types for you (tmux, screen and the like) can turn it on, and an
environment variable can only turn it off. When on, it counts the steps that ran: their codes, counts, times and the product
version, never their inputs, outputs or error texts. Run `atlasbound debug telemetry` to see what would leave. It is sent only when
`atlasbound telemetry send` runs, and in this build the destination address is empty: nothing is sent.

## Contact

Questions and reports go to the public repository's issue tracker: https://github.com/Bariscanates404/decisionbook/issues. Report a
security problem privately, through GitHub's "Report a vulnerability" on that repository.
