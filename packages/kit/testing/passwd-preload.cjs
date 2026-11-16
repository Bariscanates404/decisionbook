// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// The product reads a user's home from the password database, so nothing a test sets in env can move it. A test world's bin is started with
// this preload instead, or a test's verb could write into the real home. It answers os.userInfo with the world's home:
// PASSWD_HOME when it differs from HOME (a planted HOME), else HOME. Never in a tarball.
const os = require('node:os');

const real = os.userInfo;
os.userInfo = (...args) => ({ ...real(...args), homedir: process.env.PASSWD_HOME || process.env.HOME });
