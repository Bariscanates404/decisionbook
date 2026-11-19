# @atlasbound/telemetry

The one package allowed on the network. It reads the product's own trace, folds each closed day into one report per module of counts,
ranges and closed words, and sends it only for a module a person turned on. Nothing a repository wrote (code, a path, a name, a value)
has a field to ride in. In this build the address is empty: nothing is dialled, whatever is chosen.

## Flows the tests prove

```
trace files (.atlasbound/trace/*.ndjson)              ~/.atlasbound/telemetry-consent.json, telemetry-period.json
        │  a torn line costs itself                          │ the choice per module, the random period id
        ▼                                                    ▼
   steps/collect (under send.lock) ── closed days only ── core/consent: who reports, by the one order
        │  core/registry: a handle { increment, observe } per registered namespace
        │  core/fold: steps, times, codes, failures, decisions, named metrics, hook calls never answered
        ▼
   core/redact (the wall) ── contracts/wire.cjs: the validator the server runs too
        │
        ▼
   .atlasbound/telemetry/reports/<day>-<ns>.json   (the bytes, written once; then prepared | attempted | received | rejected)
        │
        ├── telemetry next / history / debug telemetry: the exact bytes, nothing dialled
        └── steps/send: drops what may no longer leave; no address: no-endpoint; else one POST of the stored bytes joined,
            the choice read again first; 429 waits, 5xx backs off, another 4xx is never retried
```

The cli asks `due` after a verb's answer is written, never in a hook, never in a process its starter bounded, never under an
environment switch. A module registers by its own `contracts/telemetry.json`; telemetry has no hook handler and adds no writer.

## Expected behaviour

- `atlasbound telemetry status`: on or off per module and why, whether this build has an address, what waits here.
- `atlasbound telemetry on [module]` (a person, with the phrase) / `off [module]` (anyone): the choice; off deletes what waits.
- `atlasbound telemetry next`: closes finished days into reports here and prints the exact request the next attempt would post.
- `atlasbound telemetry history`: every report made here, its state and exact bytes.
- `atlasbound telemetry reset [--forget]`: a new random id; with `--forget`, off first, then the server is asked to delete what the
  old ids sent (pending while it cannot be reached, at most 14 tries).
- With an address set and nobody's choice, setup asks a person at a plain terminal once per module (Enter = yes); an AI session, a
  pipe, `--json` or an environment switch is asked nothing.

Works the same on any repository and language: it reads only the product's own trace files, never the repository's source.
