// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// What a gate hands kit's one shell reader (text/shell writtenBy) of the repository, where a command's `cd`s leave it: the text of a
// script file a shell runs (`sh x.sh`) and the scripts of a package.json (`npm run x`). A gate that reads a command without them
// does not see what the script writes. A name the disk refuses to place (a coded fs error) is no text, never the reader's failure.
const { folderAfter, resolveFrom } = require('../base/paths.cjs');
const { jsonOrNull } = require('../contracts/validate.cjs');

const TEXT_BYTES = 1024 * 1024; // the longest script or package.json read for its text

/** -> { file(cd, name), scripts(cd) }: `writtenBy`'s two readers for a command run in `cwd`; `past`: the caller's time limit. A script
 * that is not read, and a package.json with no scripts, answer null: that run is unplaced. */
function scriptReaders(io, cwd, past) {
  const file = (cd, name) => {
    const dir = folderAfter(cd, cwd, past);
    try {
      const key = dir === null ? null : io.fs.keyAt(resolveFrom(dir, name));
      return key === null ? null : io.fs.readText(key, { maxBytes: TEXT_BYTES, wholeUtf8: true });
    } catch (err) {
      if (!err || !err.code) throw err;
      return null;
    }
  };
  const scripts = (cd) => {
    const { scripts: found } = Object(jsonOrNull(file(cd, 'package.json') ?? ''));
    return found && typeof found === 'object' ? found : null;
  };
  return { file, scripts };
}

module.exports = { scriptReaders };
