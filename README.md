# DecisionBook + Handoff

**Your code has history. Your decisions should too.**

A local work-memory layer for Claude Code. Ground the task before the first edit, then keep the research, open questions, human answers and checks with the work.

[Website](https://atlasbound.dev/en/decisionbook/) · [Quick start](#quick-start) · [Example record](#what-a-plan-looks-like) · [Privacy](PRIVACY.md) · [Security](SECURITY.md)

![An illustrative work record: repository research reveals an open question, the person answers, and the record becomes context for later work.](.github/assets/work-memory.svg)

*Illustration of the README example below, not a live product screen.*

Your agent can read the implementation. It cannot recover every product choice or exception from the code alone. DecisionBook gives the session a research-first process and keeps the answers it receives. Handoff brings the ongoing work into the next session.

- **Before the change:** research the task and the affected code; bring the person the questions that evidence cannot settle.
- **With the change:** keep the purpose, findings, questions, human answers and acceptance checks in an append-only work record.
- **After a cleared context:** resume with the handoff note and relevant recorded decisions.
- **When someone returns to the code:** find the earlier work by file, with its wording, sources and links.

**Built on Node.js. No third-party runtime packages. No bundled third-party libraries. No install scripts.** The local CLI uses your existing Claude Code session; it does not start a separate recording model or require an AtlasBound account.

The npm package and command are named **`atlasbound`**. This repository contains the open-source **DecisionBook + Handoff** product; Bound is a separate add-on.

## Quick start

**Requires:** Node.js 22 or newer, a Git repository, and Claude Code. This published release is tested on macOS and Linux; see [Limits](#limits) for platform coverage.

Install:

```sh
npm install -g atlasbound
```

Inside the repository you want to work on:

```sh
atlasbound setup
```

Setup shows the files it suggests protecting. Review that choice, then choose those source files or name your own paths:

```sh
atlasbound protect --source
atlasbound doctor
```

Commit the `.gitignore` change. Start a new Claude Code session so the local hooks and commands load, then give it a task touching a protected file.

| Step | What happens |
|---|---|
| **Research and ask** | The agent investigates the code, prepares a plan and brings its open questions with proposed answers before editing protected files. |
| **Answer in your own words** | Your answers are recorded separately from the agent's proposals. Inspect what was recorded before proceeding. |
| **Build with the context** | A READY plan covers the protected edits. Research, decisions and acceptance checks stay in the plan file. |
| **Continue in a fresh session** | Use `/handoff`, then `/clear`, then `/resume-handoff`. The new session receives the handoff note and settled decisions. |

Setup adds this product's hooks and commands to the repository's local Claude Code settings. It preserves your other settings. To remove that setup, run `atlasbound uninstall` yourself and follow its terminal prompt. [Privacy](PRIVACY.md) explains which records remain and what `--purge` removes.

## Local by design

| Surface | What to know |
|---|---|
| **Work records** | Plain JSON lines in `.decisionbook/`, reviewable and yours to commit with the code. |
| **Handoff** | A per-branch note and locally kept message excerpts in your home folder, outside the repository. |
| **Model use** | Your existing Claude Code session does the AI work. Context given to that session goes to its configured model provider under your account. |
| **Package** | Node.js built-ins, no third-party runtime libraries and no install scripts. Dependency-free does not mean risk-free; source, release and update integrity still matter. |

This is a workflow guard and a work record. It does not guarantee that the agent finds every open question, interprets every answer correctly or makes the right change. See [Limits](#limits) and [Security](SECURITY.md).

## Find your way

| I want to… | Start here |
|---|---|
| See the data the product keeps | [An example record](#what-a-plan-looks-like) |
| Understand the two modules | [DecisionBook](#what-decisionbook-does) · [Handoff](#what-handoff-does) |
| Understand what becomes useful later | [What to expect](#what-to-expect) |
| Read the measured results and their caveats | [The long-task experiment](#one-long-task-experiment) |
| Report a reproducible bug | [Open a bug report](https://github.com/Bariscanates404/decisionbook/issues/new/choose) |
| Report a security problem privately | [Private vulnerability report](https://github.com/Bariscanates404/decisionbook/security/advisories/new) |
| Contribute or ask about licensing | [Contributing](CONTRIBUTING.md) · [Licence](#licence) |


## What a plan looks like

One plan is one file in `.decisionbook/`. The tool appends one JSON record per line rather than rewriting earlier records.
Here is an abbreviated example for undo and redo in a small state library, laid out for reading:

> **Plan:** Add undo and redo. *Why:* users want to step back through state changes. *Level:* normal.
>
> **Research** (read `src/store.js:12`): `setState` replaces the state object; no earlier state is kept.
>
> **Question Q1:** How many past states should the store keep? *Proposed:* keep the last 50.
>
> **Decision, by the person:** "Keep 100, and make it an option." *(answers Q1)*
>
> **Check AC-1:** undo after two changes restores the first. *Command:* `npm test -- store`
>
> **Ready:** frozen; planned file `src/store.js`.

Later sessions can retrieve the recorded decisions for `src/store.js`, with their wording and who made them.

## What DecisionBook does

- Before an AI session edits a protected file, it needs a READY plan: why, which files, how the work will be checked, and
  your confirmation. Rule-based checks set the level (small fix, normal, critical) from the task and its files; the agent
  does not choose it.
- When a new plan starts in an area with earlier work, the agent receives a bounded context pack: selected decisions,
  assumptions no person confirmed, checks, and a plan template.
- Plans, research, questions, decisions and links to files, tests and commits are plain JSON lines in `.decisionbook/`.
  Later sessions and teammates can inspect earlier work with `atlasbound decisionbook related <path>` and
  `atlasbound decisionbook show file:<path>`.
- Records matching the built-in secret patterns are refused before they are written. This is pattern screening, not a
  guarantee that every secret is detected.

## What Handoff does

- Handoff does not gate file edits and does not ask questions by itself. Using Claude Code's reported token usage, it gives
  at most one notice per session when the context passes 55 %.
- `/handoff` refreshes the note from facts such as the branch, HEAD, changed files and plan state, and gives the agent the
  locally kept excerpts of your messages to work from, so the lines it keeps are quoted from you rather than recalled.
- Notes are stored per branch in your home folder, outside the repository; message excerpts are stored per session. They
  are given to your own Claude Code session; the product makes no model calls of its own.
- `atlasbound handoff drop <n>`, typed by you, removes a kept line from the handoff note.

## What to expect

The first recorded task already leaves something you can use: its purpose, what the agent found in the code, the questions
it asked, your answers, and its checks. You can continue from that record after `/clear`.

As more work is recorded, later sessions and teammates can retrieve relevant earlier plans before they change the same
area. A bug fix can consult why the behaviour was chosen; a new feature can reuse earlier research and find the exceptions
you already named. The history covers work recorded through DecisionBook; older, unrecorded work still has to be
researched.

## One long-task experiment

A long task on **Mastodon** (Ruby on Rails): one large feature, Opus 5.5, 22 decisions the task text leaves open, 94 hidden
tests, and the context cleared several times in each run. We compared Claude alone, Claude with one paragraph in
`CLAUDE.md` that tells it to ask before coding, and Claude with DecisionBook and Handoff. A script supplied the developer's
answers from a prepared list. These are two runs of the same sealed task, not a general benchmark; session costs are
estimates at list prices, not subscription charges.

| Run | | Hidden tests passed (of 94) | Decisions asked (of 22) | Asked again after answered | Kept across a cleared context | Contradicted later | Session cost |
|---|---|---|---|---|---|---|---|
| 1 | Claude alone | 64 | 0 | – | – | – | 13.04 USD |
| 1 | Claude + one paragraph | 84 | 13 | 8 decisions, 15 times | 12 of 13 | 1 | 24.04 USD |
| 1 | with DecisionBook + Handoff | 83 | 10 | 0 | 10 of 10 | 0 | 26.18 USD |
| 2 | Claude alone | 70 | 0 | – | – | – | 13.27 USD |
| 2 | Claude + one paragraph | 82 | 11 | 8 decisions, 15 times | 10 of 11 | 1 | 22.92 USD |
| 2 | with DecisionBook + Handoff | 84 | 14 | 0 | 12 of 14 | 2 | 17.79 USD |

In these runs both asking arms passed more hidden tests than Claude alone. Their scores were close; two runs are not
enough to show a quality difference or an equivalence. In each run the paragraph arm asked eight answered decisions again,
15 times; DecisionBook asked none again. Separately, in each product run one answer had to be sent a second time because
the guard did not accept its first wording. "Kept" and "Contradicted" are labels derived from the hidden behaviour tests,
not direct measurements of the model's memory.

What the product adds is the record: research, questions, answers and checks are stored together, and relevant earlier
work is brought into a later session. A separate comparison on nine short tasks was less favourable to the product,
including a higher session cost (18.06 USD against 12.40 USD for the paragraph arm); we show the long task because long,
interrupted work is what the product is built for. The tasks, runs and scripts are available on request: open an issue.

## Limits

- **A workflow guard, not a sandbox.** It checks the agent's write tools and the shell forms it can read; some indirect
  writes are only noticed afterwards. It is not designed to stop a deliberate bypass.
- **Claude Code only.** Tested on macOS and Linux. Windows has not been tested yet; if you try it there, please tell us in
  an issue.
- **A plan covers files, not intentions.** The agent can still offer to accept all its proposals at once, and an existing
  READY plan can cover later work on the same files. Check that a new piece of work has its own plan. Accepted AI
  proposals are marked apart from your answers in your own words.

## Privacy

Plans and decisions are in your repository: the plan file under `.decisionbook/` holds your answers in your own words, by
design, and it is yours to commit. The heads of your messages and the handoff note are only in your home folder. The
trace keeps a digest of what a step was given, never the text of your prompt, and telemetry holds counts only. The
product sends nothing anywhere; what it gives your Claude Code session goes where that session already goes. Telemetry is off unless you turn it on yourself at a terminal (`atlasbound telemetry on`), and this build has no address to send to.
Details: PRIVACY.md.

## Bound

Bound is a separate paid add-on in a closed beta for enterprise customers. It is not part of this package, and nothing
here needs it.

## Licence

AGPL-3.0-only. Copyright (C) 2026 AtlasBound; see NOTICE and LICENSE.

The source of the published release is pinned at [tag `v0.25.0`](https://github.com/Bariscanates404/decisionbook/tree/v0.25.0).
That tag contains the five package folders and release documents used to build the npm package. Packing adds `kit.cjs`,
the npm `package.json`, and `MANIFEST.json`, which lists the other shipped files' SHA-256 digests.

The README and GitHub presentation on the default branch may be updated independently of that release. Use the release
tag when comparing published package contents; documentation changes here do not publish a new npm version.

For alternative licensing terms, open a commercial-licensing enquiry in the public repository. Any alternative licence will
be provided under a separate written agreement.

Contributions: see CONTRIBUTING.md in the public repository. The names AtlasBound and DecisionBook: see NOTICE.

