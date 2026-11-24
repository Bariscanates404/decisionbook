// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// Replies people typed to the AI's questions, kept from the two corpora of the earlier readers: Turkish, English, mixed, emoji and
// typos. contract/said.test.cjs records each as the person's word for word, and refuses each with one word changed.
const REPLIES = ['Tamam, devam.', 'Önerilerini kabul ediyorum.', 'Evet, Jüpiter eklensin.', 'Evet, eski karar kalsın.', 'Tamam, vazgeç.',
  'Yes, go ahead.', 'Yes please.', 'Yep.', 'Sure, do it.', 'Yes 👍', '👍', 'yes!!', 'Yess.', 'Yes, but not Jupiter.', 'OK, Earth, Venus and Mars.',
  'Okay, scrap that.', 'OK, nvm.', 'Sure, not.', 'Tamam, hayır.', 'Tamam 👍 ama Jüpiter yok.', 'Evet, Jüpiter eklenmesin.', 'Olur, Eve\'e sor.',
  'Evet mi? Hayır.', 'Tamam tamam, sonra.', 'Evet, değiştir: Jüpiter olmasın.', 'Evet, kararı Eve değiştirsin.', 'Önerdiğin gibi.',
  'Go with your suggestions, but keep the old limit.', 'Q2 hariç hepsi tamam.', 'Önerilerini kabl ediyrum.'];

/** `said` with its first word changed (a letter added), or its first pictograph turned down where it holds no word. */
const oneWordChanged = (said) => (/\p{L}/u.test(said) ? said.replace(/\p{L}+/u, (word) => `${word}x`) : said.replace('👍', '👎'));

module.exports = { REPLIES, oneWordChanged };
