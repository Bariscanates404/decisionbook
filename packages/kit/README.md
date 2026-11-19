# @atlasbound/kit

The shared base of every AtlasBound package: file, git, process, env and clock ports; the one validator and JSON door; the one trace
writer and step wrapper; path keys, hashes, canonical JSON, signatures, globs, file roles, the credential scrub and the shell write reader. No domain words, no
store but the trace. It imports node built-ins only.

## Flows proven by tests

```
composition root ── createFs / createGit / createTrace / env / proc / clock ──> io (injected, once per process)
                                                                                 │
step fn(input, io, ctx) ──> traced(io, step, fn) ──> trace.record ──> scrub every string once ──> cut err.msg to 200
                                                                                 │
                                     shape check (TraceRecord) ──> the checked bytes, one NDJSON line per step (run file or hook day file)
```
- `contract/kit.test.cjs` `[I-5]`, `[I-6]`, `[I-41]`, `[I-49]`: a record names its package, refuses an unknown step or code, holds no
  credential, and a long message that the scrub lengthens, or whose cut end looks like a credential, still fits its own reader.

```
git port:  closed child (-c filters off, fsmonitor off, hooks off, --literal-pathspecs) ──> head()
           head() null ──> commits / shared = []        base unknown here ──> null        any other exit ──> git-failed
```
- `contract/kit.test.cjs` `[I-9]`: the one absent rule on a real repository, a bracket name read literally, a folder that is no repository.

```
fs port:   key ──> pathKey (NFC, contained) ──> refuse links on the way ──> atomic temp + rename | O_APPEND O_NOFOLLOW | rm (makes nothing) | rmdir of an empty folder (removeEmpty) | mkdir -p (makeDir)
           createFs(root, { hold }) ──> under `hold` every verb reads and writes this process's memory over the disk, so a verb that only reads
           leaves no file; its folders answer as the disk's (a removed file's folders stay)
```
- `contract/kit.test.cjs` `[I-1]`, `[I-2]`, `[I-23]`, `[I-30]`, `[I-43]`; `contract/hard.test.cjs` `[I-42]` (FIFO, device, huge file), `[I-51]` (the fake
  and the real fs answer one table, removing what is not there included).

```
text:      secrets.find / scrub / clipped (scrub, then cut) / masked (a line holding a shape -> its indentation + mask)
           shell.writtenBy(command, past, { lang: sh | powershell | cmd, scripts }) ──> shell-lex or shell-win tokens ──> rows of shell.json
           (`windows`: PowerShell's commands, cmd's; a package script read from `scripts`) ──> shell-code for inline code ──> { writes (each `by`), unplaced, unread,
           why: each cause once, a code and the word as written }; shell.readWords(command): the words it saw (cli's `debug shell`)
```
- `contract/secrets-false.test.cjs`, `[I-16]`; `contract/shell.test.cjs` `[I-57]`; `contract/shell-windows.test.cjs` `[I-57]` (PowerShell, cmd, package scripts, Git Bash paths); `contract/shell-shells.test.cjs` `[I-57]` (generated
  commands run in bash, zsh and dash: every file they create is named or unplaced).

```
lock:      withLock(io, key, fn) ──> createExclusive ──> fn(waits, mine) ──> remove      (stale, torn and dead locks reclaimed, one reclaimer)
child:     startOnce(io, { lock, waitMs }, plan) ──> withLock ──> plan() ──> start() ──> note(pid)   (a refusal or a failed start notes nothing)
```
- `child.startOnce` is the one way a package starts a background child of the product itself (`[I-67]`).
- `contract/lock-race.test.cjs` `[I-54]`, `[I-55]` with real processes; `contract/kit.test.cjs` `[I-25]` to `[I-28]`, `[I-46]` to `[I-48]`.

```
canonical: value ──> canonical(value) ──> the ONE text (RFC 8785)            text ──> strictRead ──> value        canonicalText = both
           refused with a code: not finite, half a surrogate pair, not JSON, a key twice, past 64 levels, past 1 MiB, not JSON text
address:   hash.address(value) = "sha256:" + hex( sha256( UTF-8 of canonical(value) ) )
sign:      keyPair() ──> { publicKey: raw 32 bytes in base64url, privateKey: PKCS#8 PEM }
           sign(type, value, privateKey) = Ed25519( "atlasbound-signed/1" 0x00 type 0x00 canonical(value) )
           verify(type, value, { signature, publicKey }) returns nothing or throws signature-invalid | key-invalid
```
- `contract/canonical.test.cjs` `[I-58]` (the RFC's sample, key order, number table and string rules; three properties over generated values),
  `[I-59]` (each refusal with its negative case), `[I-60]`, `[I-65]` (the strict reader, and the JSON.parse fault of node 24 pinned);
  `contract/sign.test.cjs` `[I-61]` (the RFC 8032 vectors against the built-in, the byte layout built by hand), `[I-62]`, `[I-63]`, `[I-64]`.

## Expected behaviour

- Absent is `null`, never `''`, `[]` or `0` pretending to be measured; a failure is a coded error (`errors.fail`), never swallowed.
- A write is atomic and never goes through a symbolic or hard link; a removal creates nothing. `createFs(root, { private: true })` (a person's home)
  makes folders 0700 and files 0600 and tightens each folder of the key and the file at every write (tested through the real bin, cli `[I-53]`).
- A child process gets only the env keys it is given, a PATH outside the repository, and dies with its whole process group.
- git reads are closed against the repository's own config; a path is always literal.
- The trace never holds a credential, and a step's record keeps its code whatever its message; a writer bound with `lost` notes a refused disk write
  and the caller's answer still comes.
- `host` holds the host's facts every hook reads: the write tools with their file field, `/resume-handoff`.
- `person` is the one answer to "who is acting", for every package: a person at a terminal with no AI session mark and no AI host among
  the process's ancestors (`terminal`), the AI with a person's prompt of its session behind it (`prompt`, with the row's time and words),
  or the AI alone (`ai`); "could not tell" (no listing of the processes, a session with no prompt row) is the AI, never a yes.
  `saidAfter(actor, at)` says whether a person stands behind an act on something made at `at`; `asksPerson(mode)` whether a hook's ask
  reaches a person. What marks an AI host is data
  (`contracts/person.json`). The composition root makes one actor per process (`io.actor`) and writes the trace row of each answer.
  A person types into a shell: a terminal where no process from this one up to the terminal's session leader is a shell a person
  types into (it was opened for the command alone, or for a command string or a script; `proc.ancestry` says who leads) is the AI,
  `no-typing-shell`. A person's answer also names the programs above their terminal and the one that can type for them there
  (`wrapped`, of the list `wrappers`: a terminal multiplexer, a tool that opens a pseudo-terminal, a script runner): the cli refuses
  an act that takes a protection away there. Named limit: nothing on a machine proves a person; the answer holds for an AI that works
  in the open, and a terminal window, or a typing shell on a pseudo-terminal, that another program opened and typed into reads as the
  person's.
- `text.shell.verbNamed(command, names, rows)` reads a shell command's TEXT for a product's verb, bare or through any wrapper (quotes and
  backslashes taken out, cut into words): the cli's shell gate of the verbs only a person runs. Named limit: a command whose text never
  holds the name or the verb (built or decoded when it runs).
- `fs.placeAt(hostPath, known)` is the one place of a file a gate judges: a second name (a hard link) of one of the known keys is that
  key, else the key the disk writes; DecisionBook's plan gate reads it.
- `core/` of every package stays pure because every effect here is a port the composition root injects.
- On a repository in any language kit behaves the same: file roles and credential shapes are tables, and a name it cannot classify
  stays `unclassified`, never guessed.
