// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The row as a future release fills it, before the entry loads. The address has no env var, flag or argument on purpose, so this is the only way a
// suite reaches the sender; requiring this file first keeps every dial test proving that filling the row is all it takes.
// contract/no-endpoint.test.cjs reads the row as shipped.
const path = require('node:path');

require(path.join(path.dirname(require.resolve('@atlasbound/telemetry')), 'contracts', 'shapes.cjs')).INGEST_URL = 'https://ingest.example/ab-event';
