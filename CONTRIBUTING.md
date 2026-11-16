# Contributing

Thank you for wanting to help. Issues and bug reports are welcome from everyone.

The packages are in `packages/` (kit, cli, telemetry, handoff, decisionbook), each with its tests. With Node 22 or newer:

    npm install    # links the five packages to each other; there is no third-party dependency, so nothing is downloaded
    npm test       # every test of the open packages

`npm test` prints how long each test file took and judges none of those times: they depend on your machine.

Every test here runs with the open packages alone.

Bug reports and feature requests are welcome. External code, tests and documentation contributions require a contributor
licence agreement. The agreement is being finalised; until it is available, we will not merge pull requests or incorporate
submitted implementation material from issues or other channels. Reporting a bug or security vulnerability does not require
signing the agreement.

A change to a text the product sends to an AI (instructions, refusal lines, the plan skeleton) says so in its description;
those changes are reviewed with extra care.

Please do not include code, data or secrets you have no right to share.
