// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Trees through the fs port, never a program (Windows has no rmdir to start: it is cmd.exe's own word): whether a key is there, each
// folder above a key, and a tree removed with the folders it leaves empty.
const ancestors = (key) => key.split('/').slice(0, -1).map((_, i, parts) => parts.slice(0, i + 1).join('/'));

async function pruneEmpty({ fs }, dirs) {
  for (const dir of [...new Set(dirs)].sort((a, b) => b.length - a.length)) if (fs.list(dir)?.length === 0) fs.removeEmpty(dir);
}

/** Every file under a key and every folder of it, itself included: an empty folder inside is part of the tree too. */
function treeOf(fs, key) {
  const names = fs.list(key);
  if (names === null) return { files: [key], dirs: [] };
  const below = names.map((name) => treeOf(fs, `${key}/${name}`));
  return { files: below.flatMap((tree) => tree.files), dirs: [key, ...below.flatMap((tree) => tree.dirs)] };
}
const isThere = ({ fs }, key) => fs.list(key) !== null || fs.readText(key) !== null;

async function removeTrees(hostIo, keys) {
  const there = keys.filter((key) => isThere(hostIo, key));
  for (const key of there) {
    const { files, dirs } = treeOf(hostIo.fs, key);
    files.forEach((file) => hostIo.fs.remove(file));
    await pruneEmpty(hostIo, [key, ...dirs, ...files.flatMap(ancestors)]);
  }
  return there;
}

module.exports = { ancestors, pruneEmpty, isThere, removeTrees };
