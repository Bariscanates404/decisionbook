# Changelog

What changed in each release of the npm package `atlasbound`, newest first.

## 0.25.3

### Teams and git

- A plan id ends in four hex characters of the moment it was started (`2026-11-19-remove-the-phase-angle-3f9a`), so two
  people who start the same task on the same day write two plan files and a normal pull merges clean. Ids already written stay
  as they are.
- One person's keep of a standing decision and another person's replacement of it, in two plans or under two keys, are a
  conflict: every reader names both lines, both plans are held, the gate denies `plan-conflict`, and the person's answer naming
  both ends it. In one copy, replacing a decision a person keeps names their keep too. A keep and a later replacement already in
  your plan files (written by 0.25.2 or earlier) now show this conflict until the person answers.
- The conflict text says the way out that is accepted: record the replace question first (a `question` whose `supersedes`
  names every line), ask the person, then record the answer they type after it; it names the keys the answer may be written
  under. In a session, any answer that ends a merged conflict (under any key, on the keeping side or the replacing side) must
  answer such a question, in words typed after it was on record. Words of theirs typed before that (the question asked in
  the chat only, or sent in the same call as the answer) are refused as `conflict-unasked`, naming the lines; that refusal said
  `said-not-theirs`, of a sentence the person had typed.
- `inbox` lists a conflict across plans as one row and counts it as one open question, whichever plans it runs through; it
  was listed once per plan. A plan you set aside whose decision lost a conflict is listed and counted as set aside, beside
  its open item.
- A write's reply no longer names one line of a conflict as the decision that stands on its files: a key in conflict is said
  as its conflict.
- Lines that disagree through a chain (one with a second, the second with a third) are one conflict naming all of them.
  Another plan's line of the same key on files that meet, whoever decided it, is said as "also decided in <ref>"; it was
  printed as "CONFLICT with <ref>", though it never held anything. In `--json`, a decision carries `conflict` (the lines, refs
  and plans of the one it is in) and `meets`, in place of `rivals` and `conflicts`.
- A teammate's plan stays theirs. Whose a line is, git says: the author of the commit that holds it against the author mail
  your clone commits as (`author.email`, else `user.email`), both read through `.mailmap` as `git blame` reads them; where
  git names no one, none of this applies; mails are compared in any letter case, as git compares them. A plan is a teammate's
  when another author committed its first line, until you take it up: a session of your clone made it, or your yes to it is
  kept on your machine (the yes the gate asks once). A record an AI session adds to it takes nothing up, and with no home
  folder git alone decides. An AI session never closes a teammate's plan (`plan-close-theirs`: you close it in your terminal), a `closed` record
  says who closed it (`by`: the person at their terminal, else the AI: an AI session, or a script with no terminal; an older
  record names no one), and `plan-open` no longer tells a session to close the open plan to get past it: it asks you. Beside a
  teammate's READY plan a `new` of the same files opens (it was refused `plan-open`), so your task has its own plan. An AI
  session may still add a question, a link or a decision of a new key to a teammate's plan; closing it, writing over a line of
  theirs and clearing its lost item are refused (`compared-theirs`: each person clears their own plan's item on their own
  answer, and the item of a teammate's plan says whose it is in place of the record to write).
- The answer that ends a conflict names every line of it: replaced (`supersedes`), or, for the one line whose decision you
  take as it is, kept (`keeps`), its value copied as the answer's value (a keep with another value is refused `keep-other-value`:
  two live lines of one key would disagree unseen). The plan whose line you took lost nothing; it was flagged "lost" whenever the answer said its
  value in other words. The conflict's text says so, and where your answer goes: a plan of the conflict in which no
  teammate's line stands, else a new plan of your own (after two answers to one question of one plan, the text led into
  `decision-teammates`).
- Readers name a teammate. A line another author committed reads "by <their git name>" in a conflict, in `show`, the session
  start and the plan pack, and in "replaced by … (<name>, …)", so your AI does not quote a teammate's words as yours; your own
  lines read "by the person" as before.
- A new plan whose decision names a decision of the branch's open plan (`supersedes` or `keeps`) opens beside that plan: your
  change of mind on record is no second plan of the same work, and `plan-open` says so. Other new plans of its files are
  refused as before, until you close it or set it aside.
- A plan judged above the level it proposed says why in every full reply (`new`, `ready`), and your way to lower it where only
  a soft signal raised it: the waiver record, in your own words. `ready` listed the missing rows of critical work without
  saying what made it critical. A danger zone or a schema path is never waived. A risk word in the plan's title, why or
  success (the AI's own text) still raises the level; one waiver of yours lowers it.
- Your decision is never written over a line a teammate wrote, by a session or in a terminal (`decision-teammates`): it goes
  in a plan of your own under the same key, naming theirs in `supersedes` or `keeps`. Written over it, `<plan>/<key>` named
  the new line in every record that named the old one, a keep of the old value read as a keep of the new one, and no merge
  showed that two people disagreed.
- "It stays" is recorded: a keep is a decision of yours with `keeps`, also when no code changes. Under the kept decision's own
  key in its own plan it is refused (`keep-own-key`: there it took the line's place and kept nothing); under a key of its own
  (`<key>.kept`) it stands beside the decision. Your READY plan's own value said again under its own key ("100 stays") was
  written as a new line of that key; a teammate's replacement of the key, made before they saw it, then replaced it too and no
  clone showed a conflict. It is refused the same way now, and the refusal names the keep to send. After a pull, a keep of a decision a teammate replaced meanwhile is told the
  line that holds now (`supersede-unknown` names it) and takes the old one back by naming both: the replacing line in
  `supersedes`, the old one in `keeps`.
- A keep said after your yes takes that yes back (`plan-yes-taken`) only where a question or a decision of the plan named the
  kept decision to replace. Before, any keep after the yes did: a keep of a decision the plan never touched held the READY
  plan, in every clone that pulled it, and denied the edits of its own files until a yes again.
- The order decides whether a keep takes your yes back, never the words. Before, a keep in the same words as the yes left the
  yes standing: "ok" to the replace, then "ok" in a later message to keep the old decision after all, and the plan went on
  editing to replace what you had just kept (0.25.2 too). A yes your AI records from the keep's own message still counts: it
  is written after the keep, also when one write sends it first.
- A value your message sets ("the fee is 100", "make it 200") is your decision at every level, a small fix too: the plan
  pack, `/decisionbook`, `/decide` and the session start say so, and a plan made READY with no decision of yours says so once
  (a note, never a refusal). A small fix recorded only your yes, so a later plan had nothing to compare with. The plan pack
  is 355 characters longer for that line and 63 for the line of how a decision is replaced; its budget rose from 5,000 to
  5,418, so the area's earlier decisions keep their room. `/decisionbook` and `/decide` also say that a value your AI
  proposed in chat and you settled with a word ("ok", "keep it") is recorded as your decision (an instruction to the AI:
  the product reads no meaning, so nothing refuses a session that leaves it out).
- Two refusals that shared the code `replace-unplaced` have codes of their own: `placed-twice` (a decision named in both
  `supersedes` and `keeps`) and `keep-theirs` (a keep that is not the person's answer).
- A plan file still holding git's conflict markers is refused as `plan-unmerged` with its marker lines: `show` and `ready` of
  the plan refuse; `show` of a node, `find`, `inbox` (which counts it), `doctor` and `debug decisionbook` name it; the session
  start says to resolve the merge first and asks for no new plan; and the gate denies every protected edit until the merge is
  resolved. GUIDE recommends `.decisionbook/*.jsonl merge=union` in `.gitattributes`.
- A plan that was READY and edited its files, whose own decision then stood in a conflict with another plan's and lost it (the
  person's answer took another value), is one open item. Every reader of the plan says the same line (the plan, the line that
  lost, the line that holds now, the files): `show`, `ready`, every write on it, `close`, `pr`, `why`, `find`, `related`, the
  plan pack, the session start and `debug decisionbook`; `inbox` counts it as a row of its own. Its "edits pass in silence"
  line gives way to it, and the gate denies `plan-lost` under it for the files that plan names, in its own person's clone: a
  teammate's lost plan holds back no edit of yours (its item is theirs to clear, and you read it as theirs). Nothing changes your code by itself; a new plan of those
  files restores or adapts it, and that plan opens beside it. Setting the plan aside, closing it or making another plan READY
  never clears the item: only a `{"t":"link","rel":"compared","to":"decision:<plan>/<key>@<time>","why":…,"said":…}` on that
  plan, naming the line that holds now exactly as the item prints it, clears it. Its `why` says in short what the AI saw in the
  code; its `said` is your answer to the item, in your own words from a message you typed in that session after the line it
  names was written (the check every answer of yours passes: their owner and time, not their meaning); without either the record is refused (`link-unsourced`,
  `said-not-theirs`) and nothing is written. At your own terminal your words stand as typed. A `compared` record written by a
  0.25.3 candidate without `said` clears nothing: record it again with your answer (no migration: 0.25.2 had no `compared`). The plan whose value
  the person took is not flagged, whichever plan the answer was written in, and one answer that replaces several plans'
  decisions where no conflict stood is no lost conflict. When the person writes the winning decision again, the item follows:
  it names the line that holds now, and a `compared` naming an earlier line clears nothing.
- A plan file that does not read (its first line broken, another schema's, a link), or one line of a plan that does not, is an
  open item too: "a record could not be read: <file> (<code>); what it holds is unknown, not absent". The session start and
  `resume` lead with "Repair it first" and ask for no new plan while it stands, `inbox` counts it, the gate's `plan-none`
  names the file, and `atlasbound status` and the bare `atlasbound decisionbook` name it too. Before, the start said "No plan
  on this branch" and `inbox` said nothing waits.
- A READY plan whose yes the person took back with a later keep is said as the gate treats it: the session start heads it
  "READY, held: their yes was taken back," and `inbox` lists it so (`heldBy` in `--json`); before, the start said its edits
  pass in silence while the gate denied them (`plan-yes-taken`).
- The plan list a handoff note carries lists no decision that another decision replaced.

### Handoff

- A note or a session record in your home that is there and does not read (cut short, edited by hand, another version's) is
  refused by name (`note-unreadable`, `session-unreadable`, with its file) and never written over: `handoff`, `handoff keep`,
  `handoff show`, `handoff drop` and the hooks of that branch or session say so until the file is repaired or moved away.
  Before, it was read as "no note": the next prompts wrote an empty note over it and over its one backup, and the kept
  lines were gone. Another session's unreadable record never stops this one, and is never the one removed after its days.
- A kept line holds your words alone. The `/handoff` fill-in and the refusal of a line that is not yours (`kept-not-quoted`)
  say that a line with the AI's words beside yours is refused, and that a one-word answer is kept as it is, with what it
  answered in `now`.
- What you type after a slash command of the repository (`/handoff Do not touch the retry. Next job: …`) is your message
  without the command's name, so its first sentence can be kept, and recorded as your decision; it was refused as a piece of a
  sentence (`kept-not-quoted`, `said-not-theirs`). A sentence that opens with a path (`/tmp is full.`) stays whole.

### Modules

- `atlasbound setup --with <module>` adds the named module to the modules on here; it no longer turns back on a module you
  switched off with `modules off`. Naming that module turns it on again, and only you do that: `modules on <module>`, and a
  setup that names a module off here (`--with`, `--only`), sent by an AI session or with no terminal are refused `person-only`
  and nothing changes, as `modules off` is; an AI's shell command that names `modules on` is denied at the hook. You type it at
  your own terminal, with no phrase (nothing is taken away). The line a switched-off module's verb or hook answers, and setup's
  line of an add-on left off, say so: "only the person turns it back on, in a terminal of their own"; so do `modules on --help`
  and `setup --help`. A plain `setup` and `update` are still anyone's and keep your choice.
  A module off here that you never switched off (an add-on a plain setup left out) is turned on the same way: by you.
- `atlasbound modules on <module>` (and `setup --with <module>`) is refused while the module's package is not installed
  (`module-refused`); before, it answered "on here" and wired nothing.
- With a module switched off, what it kept stays sealed: a shell command or a write tool of the AI that writes
  `.atlasbound/` here or in your home is refused (`STORE_SEALED`), and one that writes `.decisionbook/` asks you, whether
  DecisionBook is on or off. Before, the shell half of that seal was DecisionBook's own and left with it.
- An install record (`.atlasbound/cli/installed.json`) that does not read, or that chooses no module (`"modules": []`: the
  last module is never switched off, so no verb writes that), is treated as a config that does not read: the verbs refuse,
  and a hook asks you on every write, naming the file; before, the hooks let every write pass, with one note or with none.
- A write of a host file the product owns (`.gitignore`, `.claude/settings.json`) is asked (`own-file`) when a package
  script or a shell script runs it (`npm run x`, `sh x.sh`), not only when it is typed, and also with DecisionBook switched
  off.

### Setup

- `atlasbound setup` with a file of your own at one of its command paths refuses before it writes anything, naming the file
  (`file-foreign`), and leaves nothing in the repository, not a trace file; before, it wired everything else and exited 1.
  `--help` says so.
- A verb refused before it wrote anything, and one that only looks (`doctor`, `status`), leaves no trace file in a clone
  this machine never set up, also where git brought part of `.atlasbound/` (an install record committed by mistake, a team
  file): setup's own write makes the trace folder. Before, `doctor` and `status` each left a
  `.atlasbound/trace/cli-*.ndjson` there. In a repository this machine set up nothing changes: a refused verb still leaves
  its trace row.
- A command file of ours that you changed is still ours: `update` writes it again and keeps your text beside it as
  `<file>.<8 hex>.yours`, in a line it prints. `doctor` is clean after that one `update`.
- Setup, update, `modules on|off` and uninstall never take back a file git holds, whatever the install record lists. An install
  record (`.atlasbound/cli/installed.json`) that git tracks is another machine's: those verbs refuse (`state-tracked`), change
  nothing, and name the git command that takes it out.
- In a linked worktree the command files are ignored too: setup asks git where it keeps the checkout's own ignore file.
- Your home is the one in the password database, whatever `HOME` says (a container, a CI runner, `sudo -E`, a Windows `HOME`
  on another drive): the home stores are read and written there, and nothing under `HOME`. Only a development checkout of
  this repository (one that holds its test tools) refuses a `HOME` that names another folder (`config-invalid`), so a test
  run that forgot its preload fails instead of writing a developer's real home.

### The shell gate

- The deny of a command that sets, exports, unsets or clears the host's session variables (`shell-host-env`) is read by the same
  reader as a command's writes, so it holds through `sh -c`, `bash -c`, `eval`, `$(…)` and `env` (a `NAME=value` word, `-u`,
  `-i`, `-S`), for `NAME+=`, a quoted `NAME=value`, `read NAME`, `for NAME in`, `printf -v NAME`, `let`, cmd's `set NAME=`, and
  in PowerShell `$env:NAME =`, a write to `env:NAME` and
  `[Environment]::SetEnvironmentVariable`. A command that only prints or names one (`declare -p NAME`, `echo export NAME`)
  passes. `atlasbound debug shell '<command>'` says the same as the gate.

### Known limits

- A keep is not yet seen against a replacement when the keeping answer also replaces another decision; and the person cannot
  yet end such a conflict by keeping the old decision: their answer is recorded, but the old decision still reads replaced.
- Who wrote a line is read from git (the author mail your clone commits as against the author mail of the commit that holds
  it). With no mail set, with two people committing under one mail, or for a line changed in place by an earlier version, a
  decision changed inside another person's plan still shows no conflict (the change stands). One person who commits under two
  mails reads as two people until a `.mailmap` row joins them: until then their older plan is closed in their terminal, and
  its decision is changed from a plan of its own. A line a bot or a hosted merge committed under its own mail (a squash merge
  under a noreply address) is another author's line, read the same way: the product keeps no list of bot names, so nothing is
  guessed; a `.mailmap` row says it is you.
- After a pull, your edit while a teammate's READY plan is the branch's newest is asked once (`plan-not-here`), or denied as
  another task's plan. Your yes to that ask takes their plan up in your clone: it is your work there from then on, its lost item
  reads as yours, holds back your edits of its files, and your AI can clear it on your words. A plan of your own avoids that.
- A lost item holds back the files its plan names, in its own person's clone. The first edit is therefore asked, not denied:
  of your own plan's file in a clone that commits under another mail (`plan-not-here`), of a file renamed since and of a file
  the plan does not name (`plan-outside`; your yes adds the file to the lost plan, and the next edit of it is `plan-lost`).
- A keep's value is compared letter for letter: another spelling of the same value ("100 tl" for "100 TL") is refused
  `keep-other-value`, and the refusal prints the kept line's value whole, as the one string to copy (a hidden character in
  it as `\uXXXX`).
- A decision you replace knowingly after a pull (your decision names the teammate's line) is a replacement, not a conflict:
  the teammate reads who replaced it and in which words in `show` and the plan pack; `inbox` lists nothing for it.
- Whether your message set a value is your AI's reading; the product reads no meaning. A plan recorded with no decision of
  yours gets the note, and later plans still have nothing to compare with.
- The open item of a lost plan is made for a conflict between two plans. Two answers that met inside one plan file, and a
  plan whose keep (not its decision) lost, make none. Which records stood when the answer was written is read from their
  times, so two machines whose clocks disagree can hide an item or show one.
- A `compared` record checks two things only: that its `said` is words you typed (their owner) and that you typed them after the
  line it names (their time). It never reads what they mean: a sentence of yours about something else, typed after that line, is
  taken as the answer. When the holding line came from another person and was pulled before your session began, every message of
  the session is after it. The AI's `why` is its own reading of the code, not a comparison the product made. An explicit approval
  of this one item is planned for 0.25.4.
- A keep counts in a conflict from any stage of its plan, a replacement only once its plan is READY.
- Two of your lines for one key in one plan that quote the same sentence with two values read as a conflict until you answer
  once (only the same value is compatible). Plan files written before 0.25.2 can hold such a pair: no `revises` was stamped
  then, so a key written twice in one session reads like a merge. A new plan that leaves that key as it is says so in a
  non-goal (`covers`) and is not held by it.
- A merge of a plan file resolved by taking one side whole (`git checkout --ours`) drops the other side's records, and nothing
  names the loss: the product reads the plan files as they are, not their history. `.decisionbook/*.jsonl merge=union`
  (GUIDE) keeps both sides' lines and no conflict arises.
- Only a record sets a plan aside: an AI that says it set one aside and ran no command changed nothing, and no hook reads
  what it said.
- Linked worktrees share one ignore file in their main clone: uninstall in one checkout takes the lines out for all of them.
- The shell gate reads a command's text: a program that changes its own environment in another language (a Python or Node
  one-liner), and a variable whose name is only known when the command runs (`export $(cat .env)`, `export "$NAME"`), are not
  read as setting one.

## 0.25.2

0.25.1 was never published to npm. Everything listed under 0.25.1 below ships for the first time in 0.25.2, together with
what this section lists.

### Reading the plans

- `atlasbound decisionbook inbox [--json]` lists what waits for you: a draft's open questions with the answer proposed (one
  parked with a colleague is not listed), READY plans not closed, and plans set aside; this branch first, then the plans pulled
  from other branches with their git author.
- `atlasbound decisionbook why <file>[:<line>] [--json]` names the commit of a line, the closed plan that shipped it, its
  decisions in the person's own words and each decision that replaced one since. An unknown commit, an uncommitted line or an
  untracked file is said plainly, never guessed; after a squash or rebase merge no closed plan lists the commit.
- `atlasbound decisionbook pr [<id> | --branch]` prints a pull request description in Markdown from the plan records: why,
  success, the decisions in the person's words, what their questions proposed, the checks with their commands, the commits. It is
  printed only; nothing is sent.
- `atlasbound decisionbook show` says once under a person's decision whose value is not its question's proposal:
  `its question proposed: <proposal>`. Whether the person took it is their AI's reading; it is never called refused.
- The three new commands read and write nothing else; their trace rows stay on your machine.

### What a session is handed

- Each earlier plan and decision handed to a session says where it came from (the plan, who decided), its day, who kept it since, and why it was picked (its file, folder, key area or words).
- "No record here", "a record could not be read" (the file named) and "not researched" (the work's files no plan touched) are said apart; none of them reads as "nothing".
- Each item names the one command that shows it whole: `atlasbound decisionbook show <id> decisions`, or `atlasbound decisionbook why <file>` for a file no plan touched.
- The texts say plainly that an earlier decision is no proof the code still does it today: check the code.

### Plans and the gate

- A READY plan covers the edits of a session that works on it: the session that made it or wrote to it, one where you resumed
  your handoff, or one that began with no new task (after `/clear`). A session that began with another task is denied inside
  that plan and plans its own; where you asked it to go on with the plan, it records that on the plan first.
- A plan made on a detached HEAD says "a detached HEAD", never `null`. `close` prints a commit command that works whether or
  not the plan file was committed before (`git add`, then `git commit`).
- Recall finds a plan by a form of a word (`düğmesinin` finds `düğmesi`), and `related <file>` lists the branch's READY plan of
  that file. A file whose plan holds a line that does not read is named with that line.
- A quoted answer after a colon (`its answer: "…"`) is a sentence of its own: quoted whole, it is your words.
- Each of your decisions of a key now carries `revises`, written by the product: the times of the lines of that key it replaced.
  Two lines of which neither replaced the other are a conflict after a merge, whatever their order in the file (a side that
  changed its answer twice included); one person changing a key twice is not. A line with no `revises` replaces none.
- A conflict across plans (two plans' decisions of one key after a merge) is shown and held like one inside a plan. The person's
  answer must name every line of a conflict, and a decision of a key the plan already holds another of yours for must name it
  (`decision-unnamed` lists the refs): writing never makes a conflict, only a merge does.
- Setup and doctor tell a repository set up by an earlier version how to add the team notice (`atlasbound setup --team-notice`).
- A READY plan whose decision holds a conflict after a merge covers no edit (`plan-conflict`): `ready`, `debug decisionbook`
  and the session start say it is held, and `inbox` says "READY, held by a conflict"; your answer frees it with no new yes.
- In a session, an answer that ends a conflict must answer a question whose `supersedes` names every line of it, in words you
  typed after that question (`conflict-unasked`): you see the conflict before your answer counts.
- A keep of an old decision and a replace of it, merged from two copies, are a conflict; a keep in other words after your yes
  holds the READY plan (`plan-yes-taken`) until your yes again. A yes your AI records from the same message as the keep counts.
- Two plans that replace one old decision under two key names are a conflict too: what was replaced decides, not the key name.
- Only the same value, byte for byte, makes two merged answers compatible; the same words with another value never do.
- An answer relayed through a question parked with someone else never decides a key you decided in the plan.
- A shell command that sets, exports or unsets the host's session variables (`CLAUDE_CODE_SESSION_ID`, `CLAUDE_PROJECT_DIR`,
  `CLAUDE_PID`) in a plain form (an assignment, `export`, `unset`, `declare`, `env -u`, `$env:NAME =`) is denied
  (`shell-host-env`). This release matched those forms in the command's text only, not inside `sh -c`, `eval` or after
  `env -i`; 0.25.3 reads them there too.
- Setup and update leave a committed `.gitignore` as git brought it: this machine's command files and a server-wired `.mcp.json`
  are ignored in the clone's own `.git/info/exclude`. Uninstall gives the team's settings file back byte for byte where the
  team row was all it took out. `protect` writes no time into `.decisionbook/config.json`.
- The team notice stops a message only in a run a person types in (the terminal, the VS Code extension); `claude -p`, the SDK,
  a GitHub action, a remote run and CI are never stopped.
- Your AI cannot decide over a key you decided: its own decision of that key in the same plan is refused (`decision-theirs`)
  and it is told to ask you; it may keep its view as a proposal. An AI line a merge put after yours never takes your decision's place.
- Two answers to one question after a merge: when a merge keeps two people's decisions of one key in one plan, neither
  replaces the other, and their values differ, `show`, `pr`, the plan pack, `related`, `inbox` and `ready` name
  a conflict in place of the decision: each line with its number, who and their words, the `git blame` that names its commit,
  and that none holds until the person says which; the plan is not READY until their answer is recorded. The same value is no
  conflict. A decision of the same plan now changes by its key written again naming its own
  `<plan id>/<key>` in `supersedes` (this was refused as `supersede-self`); the key written again in other words with no
  `supersedes` reads like a merge and is shown the same way.

### Command line

- `atlasbound upgrade` and `atlasbound install` answer with the command they mean (`update`, `setup`).

### Telemetry

- In a build with an address, setup's telemetry question asks once more when the answer is neither y nor n, then says that
  no choice was recorded. This build has no address, so setup does not ask, and telemetry stays off unless you turn it on.
- Telemetry rebuilt, still sending nothing: this build has no address. Per module and day it makes a report of step counts, ranges and
  outcome codes with the version, Node major, OS family and a random 30-day id; `atlasbound telemetry next` and `history` show every
  byte; `off`, `on [module]`, `reset --forget`. No hook sends or starts anything.

## 0.25.1 (not published: included in 0.25.2)

The first Windows test of 0.25.0 found most of the gaps below; this release closes them.

### Your answers

- Your AI records what you answered: the value is its reading of your answer, your own words beside it. Every way of
  answering works the first time, in any language: one by one, "go with your suggestions", "yes, but keep the old limit".
- The product checks one thing: a decision, a confirm, a waiver or an aside recorded as yours quotes whole sentences or
  clauses of a message you typed in that session (a confirm's and a waiver's after the plan was written). Anything else is
  refused and nothing is written; the AI sees in the same turn each decision recorded as yours, with your words.
- Gone: the product's own reading of your replies (yes, take, keep, open, relay readers and their word lists), the
  "asked again" message (`answer-unread`), `atlasbound debug said`, and the "taken whole" mark.
- The product no longer checks the value against your meaning: `atlasbound decisionbook show <id> decisions` prints your
  words beside it.
- Replacing and keeping: when the AI asks whether to replace a decision, it records which you chose, `supersedes` or
  `keeps`; a keep replaces nothing and is no yes, so the plan waits for your yes in words. The AI's own decision never
  replaces a person's. A plan is not READY while a decision of yours stands beside another person's of the same key and
  names it nowhere. A teammate on an older version sees a kept answer as a second decision of the key until they upgrade.

### Documents

- GUIDE.md, a sixth root document: getting started, teams and git, privacy, settings, troubleshooting, FAQ, why, and the
  plan file's record format. The README's first screen says what the tools do and do not do, and what they need.

### Upgrading from 0.25.0

After upgrading, run `atlasbound update` in each repository you set up. The hook entries this version writes differ from
0.25.0's, so until then `atlasbound doctor` shows them as not wired, and its last lines name `atlasbound update`.

### Plans and the gate

- A plan is not READY while a person's standing decision of another plan holds on a file it edits and the plan places it
  nowhere: your answer replaces or keeps it, or the plan says in a `non-goal` item why its change leaves it. A file the plan
  only reads places nothing.
- Each AI session writes its drafts into its own folder under `.atlasbound/drafts/`, and a command never reads another
  session's draft: two sessions started together each keep their own plan.
- A protected file outside a READY plan is no longer added to it in silence: the edit is asked, and the person's yes adds the
  file. If the plan grows past the level it was confirmed at, it covers no edit until it holds that level's rows.
- A draft plan holds back only the files it names; a READY plan that does not cover a file says to open a new plan for it.
- "Go with your suggestions" counts for the questions the AI showed, also when it put them in its own words; "your
  proposals, except Q3" leaves Q3 open. A relayed answer ("I asked Ayşe: …") is the person's, with who they asked.
- Only a yes to the proposals takes them ("go with your suggestions", "yes, all of them", "as you propose"). A refusal, a
  question, "let me think about your suggestions" or "your proposals are terrible" decides nothing: no decision is
  recorded as yours and the plan stays a draft. Before, any reply that named the suggestions counted as a yes to all.
- You replace a decision a teammate recorded in one answer: the AI asks you in a question that names that decision, and
  your yes to it replaces it; the old one then shows as superseded, with who replaced it and their sentence.
- On a shared branch a teammate's open draft no longer stops your work: a new session names it in one line and asks you
  nothing about it; only work on that draft's files goes on in it. Before, every new session of everyone on the branch
  first asked whether to finish it or set it aside.
- Your own draft that an earlier session left, its questions still open, no longer stops an unrelated task either: a new session
  names it in one line, the task is planned beside it, and the draft comes whole only when your message is on its files or title.
- Two plans that decide the same short key (`layout`) about different files no longer show a CONFLICT or a link between
  them; plans that share a file, and a key that names its area (`auth.session-ttl`), still do.
- `atlasbound decisionbook show decision:<key>` and `show <id> decisions` say a decision's state (`superseded by …`) before
  the person's own sentence, so a long sentence no longer hides that the decision was replaced.
- A yes that goes on to say yes to that change is still a yes ("Yes, Jupiter too, I am changing the old decision.", "Evet,
  Jüpiter eklensin." (Turkish: "Yes, add Jupiter.")); "yes, but don't", "Yes, the earlier decision.", "Evet, kararı Elif değiştirsin." ("Yes, let Elif change the decision.") and a negation after
  "replace it:" are asked again. An answer that only agrees with the proposal shown ("Yes.", "5. As you suggest.") is recorded as yours with that proposal as its
  value: a bare "Yes." is never the whole decision.
- Your yes that opens an answer to a question replacing your decision ("1. Evet, eski kararı değiştiriyorum: …", "1. Yes, I am changing the old decision: …") records the
  proposal the AI showed as your decision, your sentence beside it; "Aynen kalsın." ("Keep it as it is.") to a proposal that also changes something
  stays your own words.
- "Yes, keep the old one." ("Evet, eski karar kalsın.") to a question that asks to replace your decision replaces nothing: your
  decision stays, and the AI asks you again. Before, it counted as your yes and showed your decision as replaced.
- When your words in a plan change a decision you made earlier ("eski kararı değiştiriyorum", "I am changing the old decision"; "no longer show it") and the AI
  did not ask about that decision, the plan is not READY and its files stay closed until you answer a question that names it:
  your yes replaces it, your no keeps it. Before, your answer could be recorded beside the old decision, which stayed in force.
- "Öneriler olduğu gibi." ("the proposals as they are") and "Üçüne de evet." ("yes to all three") take every proposal the AI
  showed, like "as you propose", and "Olduğu gibi kalsın." ("Leave it as it is.") takes the one it showed. Before, the AI asked you again.
- Your "yes" to the AI's question whether a plan is set aside now sets it aside when the AI wrote the question in bold with a
  sentence after it. Before, the question went unseen and every yes was refused, as was the record the product itself showed.
- A question the product hands back to ask again names each decision it would replace once; before, one already named came twice.
- Your yes to a proposal records the proposal the AI showed you, even when the AI writes the question again with other words
  for it afterwards; a proposal that is itself only a yes ("Evet, karar yukarıdaki haliyle güncellensin.", "Yes, update the decision as written above.") never becomes the
  decision that replaces yours: your own sentence does. Before, such AI text was recorded as your decision.
- When the AI shows several proposals and tells you one "yes" takes them all, your "evet" / "yes" takes every one of them;
  "Evet, ikisi de." ("Yes, both.") takes both, and "öneri uygun" ("the proposal is fine") counts like "Önerin olsun." ("Let it be as you
  propose."). Before, the yes took the first question only, as
  the bare word "evet", and the AI asked the others again.
- While a plan is still a draft, `show decision:<key>` shows its decision that replaces yours on your yes as
  `replaces … (pending until READY)`, no longer as a CONFLICT with yours.
- "Drop it." or "Forget it." to a question that asks to replace a teammate's decision replaces nothing; only an answer that
  opens with a yes does. Before, those words counted as a yes and showed the teammate's decision as replaced.
- A word of one language that is a plain word of another no longer counts: "Use the git defaults." takes none of the AI's
  proposals (Turkish "git" was read as "go with"), and Turkish "ne" ("Ne olursa olsun …") is no French negation.
- The reading of a person's answers was rewritten as one owner in DecisionBook, its words kept by language; the replies it
  reads are pinned by tests. A reply to the proposals it cannot read as your answer ("Use the git
  defaults.", one unrelated word) records nothing, and the AI asks you again in your words; a count takes the proposals when it
  is as many as were shown ("Dördüne de evet.", "Yes to all four."); "Docker said: no" names no one you asked; `atlasbound debug said "<words>"` shows
  how a reply is read.
- "OK, forget it.", "Fine, leave it.", "Tamam, vazgeç." or "Tamam, kalsın." (the same two in Turkish) to a question that asks to replace a teammate's
  decision replaces nothing: a later part that keeps or drops takes the opening "OK" back, unless your answer also says to change
  it. The decision stays and the AI asks you again. Before, these counted as your yes and showed the decision as replaced.
- "Yes to all but Q3." and "Take all but the third." take every proposal the AI showed except the one you name, which waits for
  your own answer; "Go with your suggestions, but make Q2 every occurrence." leaves Q2 to your own words. Before, only the
  proposal you left out was recorded as yours.
- A quoted "OK" in the AI's message, a button's label or a test's output, no longer makes your bare "Yes." a yes to every
  proposal: only a sentence that asks you to write that reply for the proposals ('write "yes"', '"evet" demen yeterli') does; 'Write "ok" to
  stdout' does not. Before, every
  proposal was recorded as yours and the plan became READY.
- Your reply is read with the answer words of its own language only: Spanish "todo" (all) in "OK, todo." takes no proposal. Where
  two languages hold as many of its words and read it differently, nothing is recorded and the AI asks you again.
- An answer binds only what it says clearly; anything unclear is asked again: each part of your reply must name the questions it
  leaves out ("Yes to all but Q3.") or be a plain yes, a "go on" ("Hepsi olur, devam et.", "Yes to all, start.") or a no to
  something no question is about ("All recommendations OK, no checkpoints"), else nothing of it is recorded ("As suggested,
  but also for env.", "OK, I changed my mind." to a replacing question). Before, such replies were recorded as your yes.
- Your whole reply is never recorded as the answer to a question it leaves out, takes as a group or does not answer: "Yes to all
  but Q3." sent as Q3's answer, "I reject your suggestions." as Q1's, or "Yes to all." cut from "Yes to all. Wait, no." The
  product no longer tells the AI to record your sentence instead of asking you. `atlasbound debug said "<words>" "<question>"`
  shows how a reply to a question that replaces a decision is read.
- `related` and `show` no longer list a link an earlier version stored between two plans that only share a short key
  (`layout ← layout`) about different files.
- `atlasbound protect` takes several paths at once, read from the folder you are in; a quoted glob stays one glob.
- The AI hands a plan, a record or a handoff note as a file it writes into `.atlasbound/drafts/` and runs the command with
  `--file`: no JSON on the command line, so Claude Code's default permission mode asks nothing for the product's own steps.
  Setup allows that folder and `/handoff`'s two commands; `atlasbound handoff drop` still asks.
- AtlasBound's own files are sealed for the AI: a write to `.atlasbound/` (but its drafts folder) or `~/.atlasbound/` is
  refused, and an edit of its hook and permission entries, its `.gitignore` block or `.decisionbook/` records asks you.
- The AI can no longer switch the gate off through Claude Code's settings: a write to `.claude/settings.json`, to your own
  `~/.claude/settings.json` or `~/.claude/settings.local.json` (one line there, `disableAllHooks`, turns every hook off), or to
  a slash command file setup placed in `.claude/commands/` asks you, by the Write, Edit and MultiEdit tools and by a Bash or
  PowerShell command alike; adding that line to `.claude/settings.local.json` asks too. The file name counts in any
  letter case (`Settings.json`), and a command that copies or moves a folder over these files asks too. Still not seen:
  an archive unpacked over them (`tar -x` asks only where files are protected) and what a program run through an
  interpreter (`node x.js`) writes.
- Several `atlasbound decisionbook new` at the same moment each keep their own plan file: a plan is no longer lost when two
  sessions start one with the same title (the later one takes the next id, `-2`, `-3`).
- Where files are protected, `git merge`, `rebase`, `pull`, `cherry-pick`, `revert` and `am` ask; a script run by `sh` or
  `bash` is read first when it is in the repository, and one it cannot read asks. A hook call with no tool or no file asks.
- Hooks keep working after a Node switch: when the Node that ran setup is gone, they use the Node on PATH (never one inside
  the repository).
- `atlasbound decisionbook close <id>` links only the plan's own files and prints the one `git commit` command for its
  record: the product never commits for you. A line of a plan file that does not read is named by `show` and `doctor`.
- Plan ids are written in ASCII (`Çarpım` becomes `carpim`), and `find` matches a word with or without its marks.

### Command line

- A command typed wrong (an unknown word or flag, a word too many, `decisionbook related` with no path) exits 2 with its
  usage line; with `--json` every refusal is a JSON object on standard output.
- The help has a USAGE line per command and no line past 100 columns; a JSON word that does not read says where it broke.
- In your own terminal, `show` prints in full even when the environment carries an AI session's id.

### Windows

- The gate now also watches Claude Code's PowerShell tool, not only its edit tools and its shell tool.
- The gate reads the common PowerShell and cmd ways of writing a file (`Set-Content`, `Out-File`, `Add-Content`,
  `New-Item -Value`, `Copy-Item`, `Move-Item`, `>`, `cmd /c copy`, `cmd /c move`, `cmd /c echo … >`) and the command inside
  `powershell -Command "…"` and `pwsh -c "…"`. A PowerShell or cmd command it cannot read, whose target may be a protected
  file, asks you; it no longer passes in silence. A program run by an interpreter (`node x.js`, `python x.py`) is still not
  read before it runs: a protected file it changes is named when the session stops.
- Paths written with backslashes (`C:\…`) or in Git Bash's form (`/c/…`) in what Claude Code hands the hooks are read as the
  same files.
- A person typing at plain PowerShell or cmd.exe is recognised as a person, so the commands only a person may run
  (`uninstall`, `protect --none`) work there; before, they were refused as if the AI had typed them.
- A program the product starts by name (such as `git`) is looked up on PATH only, never in the repository's own folder.
- `setup` in a sub-folder or in a package of a monorepo finds the repository's top on Windows too.
- The hooks no longer print "gates off" while the gates are on.
- The product reads its `.gitignore` block when the file has Windows line ends (Git for Windows sets
  `core.autocrlf=true` by default).
- `atlasbound doctor` no longer raises false alarms on Windows (paths, the gate's answer, `atlasbound` on PATH, release files,
  folder permissions, the home folder).
- Handoff's context notice reads the session's transcript on Windows too.
- The README says what Windows needs (Claude Code running its hooks through Git Bash) and what to know there: line
  ends, a slash command typed from Git Bash, links and junctions.

### Command line

- The gate also reads package scripts (`npm run`, `npm test`, yarn, pnpm) from `package.json` before they run; a script it
  cannot place asks you.
- `atlasbound --version` and `atlasbound version` say the installed version; a mistyped command suggests the closest one.
- `atlasbound --help` and each command's `--help` say what the command does, when to use it, one example, and whether only a
  person may run it.
- `setup` ends by naming the next step, `atlasbound doctor`.
- `setup` no longer adds `.mcp.json` to `.gitignore`, so a repository can keep its own MCP settings in git.
- `atlasbound update` leaves a `.gitignore` block as it is when the block lacks no line: a block your team committed with
  an earlier version stays byte for byte (its `.mcp.json` line goes only where the repository has its own `.mcp.json`), so
  the update leaves git no change that would refuse a branch switch. When it does change `.gitignore`, it says to commit it.
- `atlasbound leftovers` no longer says nothing is left above a process or a folder it then names: it says nothing is left
  to take out and that what it names is left alone.
- The automatic suggestion of what to protect (`atlasbound protect --source`) also counts folders of HTML pages and a single
  entry file such as `index.html`.
- `atlasbound doctor` names what an earlier product version left wired in your home folder, `atlasbound leftovers` lists it,
  and `atlasbound leftovers remove`, typed by you at your own terminal, removes it after a copy of each file (see below).
  Both also name, with its process id, each MCP server of the earlier version that is still running, and the earlier
  version's folder `~/.mcp-observatory/`; while such a server runs, or when the system's process list does not answer,
  `leftovers remove` takes nothing and says what to close first. It never ends a process itself.
- When the product holds a session from finishing, Claude Code shows a line saying it is a deliberate check, not a crash.

### Handoff and DecisionBook

- A handoff note shows its reader that session's own messages first, and leaves out the messages of a session running beside
  it. A message that is only a path or a bare slash command is not kept.
- `/decide` stores the person's decision with their own sentence; the AI no longer writes the person's name for them.

### Documents

- README: what an AI session may do with the protect question (add protection after your answer; only taking it away is
  yours), a Windows section, and "Free, and the Team version".
- This changelog, shipped in the package.
- The package lists keywords for npm search.

### Versions before 0.25: telemetry, and what they left behind

Versions before 0.25 (the last was 0.24.2) were an earlier, closed product published under the same package name. That
product sent usage telemetry to an endpoint of its own, and it did so by default unless you turned it off: counts and other
fields its own allowlist let through, never your source code. An opt-in debug level, off by default, could also send scrubbed
development traces. It also had a sign-in to its own service.

0.25 and later are a different, open product. They send nothing (see PRIVACY.md). Installing 0.25 over the earlier product
replaced its files, but **a Claude Code session that was open before the upgrade keeps the earlier product's MCP server
running in memory**, with the old code: that server goes on sending its telemetry, and writes its files back after you delete
them, for as long as the session stays open (days, if you leave it open). **After upgrading, close every Claude Code session
that was open before the upgrade, in every window, and start them again.** `atlasbound leftovers` names each such process
that is still running, with its process id.

npm also does not remove what that product wrote outside its own package. If you used it, you may still have:

- In `~/.claude/settings.json`: hook entries whose command runs a file under `atlasbound/engine/hooks/`
  (`atlasbound\engine\hooks\` on Windows). That folder no longer exists, so each of these fails in every Claude Code session.
- In `~/.claude.json`: an MCP server named `atlasbound` (`mcpServers.atlasbound`) that runs `atlasbound mcp serve`, which 0.25
  does not have.
- In `~/.atlasbound/`: `credentials` (the key of that sign-in) and files named `egress-*` (its own log of what it sent).
- `~/.mcp-observatory/`: its local event store, a folder per repository and one named `atlasbound`. `atlasbound leftovers`
  names it and nothing removes it for you: delete the folder yourself once no earlier server runs.

To remove them: first close those sessions (above), then make a copy of `~/.claude/settings.json` and `~/.claude.json`, then delete those hook entries and the
`atlasbound` MCP server entry from them, and delete `~/.atlasbound/credentials` and `~/.atlasbound/egress-*`. Keep the rest of
`~/.atlasbound/`: `decisionbook-here/`, `handoff-here/` and `telemetry-consent.json` belong to 0.25. On Windows, `~` is your
user folder (`%USERPROFILE%`). `atlasbound doctor` names any of these it still finds, and `atlasbound leftovers remove`,
typed by you, does the same removal after a copy of each file into `~/.atlasbound/leftovers-backup/`; it stops, with the
process ids, while a server of the earlier version still runs.

## 0.25.0

The first release of the open product: DecisionBook and Handoff for Claude Code, under AGPL-3.0-only, with no third-party
dependencies, sending nothing. It replaces the earlier closed product that was published under the same name up to 0.24.2.
