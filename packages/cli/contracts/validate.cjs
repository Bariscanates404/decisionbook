// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// kit's one validator, bound to the cli's tables. Everything the outside hands the cli passes here.
const { createValidate } = require('@atlasbound/kit');
const { isCode } = require('./codes.cjs');
const { SHAPES, ENUMS, REFUSE } = require('./shapes.cjs');

module.exports = createValidate({ shapes: SHAPES, enums: ENUMS, refuse: REFUSE, isCode });
