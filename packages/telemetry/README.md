# @atlasbound/telemetry

The one package allowed on the network. It reads the product's own trace files, folds them into counts and closed words, and sends them
only when a person opted in. Nothing a repository wrote (code, a path, a name, a value) has a field to ride in.
`contracts/rules.cjs` is the allowlist.

## Flows the tests prove

```
trace files (.atlasbound/trace/*.ndjson)        sent.ndjson (what left, offsets per file)
        │  kit validate.kept: a torn line           │  a torn line costs only its own send
        ▼  is refused by code, the rest counts      ▼
   steps/collect ── core/window: rows new by position, at most 2,000 per body
        │
        ▼
   core/fold ── one summary per declared run, one step_summary per step and day
        │       core/breakdown: codes, one decision per deciding row
        ▼
   steps/redact ── core/redact (the wall): counts and closed words only, bands for the repository
        │
        ├── preview / debug telemetry: the exact bytes, nothing dialled
        └── send: consent-status first ── closed? answers its code, no dial
                                       └─ open, news, an address? one post, then the mirror line
```

Consent: `telemetry on` (a person at a terminal only) writes `~/.atlasbound/telemetry-consent.json`; a hard-off env switch beats it; no
env var can open it or move the address. The address row ships empty, so an opted-in send answers `no-endpoint`.

## Expected behaviour

- `atlasbound telemetry status|on|off`: the stored choice and why; `on` says what leaves.
- `atlasbound debug telemetry`: the exact body that would leave, what stays local (local-only rows, waiting rows,
  steps with no rule, dropped fields, trace files with a torn line).
- `atlasbound telemetry send`: at most one post per call; a body that left is mirrored and never leaves again; a mirror that could not be
  written is said. A send is at least once: a torn mirror line lets that one send's rows leave again.
- A torn trace line costs only itself; its file is named in the debug view and the collect record counts `trace-line-refused`.
- A deciding row is one decision: its one code, or `other` when it said several or none.
- setup and doctor print one hint line, only to a person who never chose, at most once a day in each repository.

Works the same on any repository and language: it reads only the product's own trace files, never the repository's source.
