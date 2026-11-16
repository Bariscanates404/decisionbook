// SPDX-FileCopyrightText: 2026 AtlasBound
// SPDX-License-Identifier: AGPL-3.0-only
// See LICENSE and NOTICE in the package root.
'use strict';
// DATA: credential shapes by a key's form, additive (a new row needs a failing test first); every run is bounded, so a 512 KB line stays
// linear.
const { visible, clip } = require('./safe.cjs');

const KEYWORD = 'passw(?:or)?d|pwd|secret|token|api[_.-]?key|private[_.-]?key|passphrase|credential|(?:auth|access|signing|encryption|app)[_.-]?key'
  + '|sifre|şifre|parola|passwort|contrase[nñ]a|senha|wachtwoord|mot[_-]?de[_-]?passe';
const VALUE = (end) => `(?=[^\\s"'\`]{0,512}\\d)(?=[^\\s"'\`]{0,512}[A-Za-z])[^\\s"'\`]{12,512}${end}`;
const MIXED = (run) => `(?=${run}{0,64}\\d)(?=${run}{0,64}[A-Za-z])`;
// The rest of a name with no way back into it (one pass); the rows that hold it hold no other group.
const NAME_REST = (run, n) => `(?=(${run}{0,${n}}))\\1`;
const QUOTED_RUN = '[^\\s"\'`\\\\]';
const BARE_RUN = '[^\\s"\'`\\\\;&(),]';
const CODE_NAME = '[$<{%/]'; // what a bare value starts with when it is code, not a credential: a variable, a placeholder, a regex or a path
const MEMBER = '[A-Za-z_$][\\w$]{0,64}';
const CHAIN = `${MEMBER}(?:(?:\\.|::|->|\\?\\.)${MEMBER}){0,16}`;
const RIGHT_END = '[;,]?(?:\\s|$)';
// A right side WHOLLY in code's form (member, interpolation, `a::b`, call, subscript, duration `24.hours`) holds no literal. Named limits:
// `password = abc(def1)`, `token = 12.hours.abc` pass.
const CODE_FORM = `(?:process|os|env|self|this|config|settings|import)\\.|#\\{`
  + `|\\d{1,6}\\.(?:second|minute|hour|day|week|month|year)s?(?:\\.[a-z_]{2,24}){0,3}${RIGHT_END}|${MEMBER}(?:::${MEMBER}){1,16}${RIGHT_END}`
  + `|${CHAIN}[(\\[][^\\s"'\`]{0,256}[)\\]](?:(?:\\.|::|->|\\?\\.)${MEMBER}){0,8}${RIGHT_END}`;
// A quoted string WHOLLY a tag message, a route path, interpolations or a version holds no literal. Named limit: a value written exactly as
// a path or version passes.
const CLOSE = '\\\\?["\'`]';
const INTERPOLATION = '[$#]\\{[^}"\'`]{1,256}\\}';
const VERSION = '(?:[a-z]{2,16}:)?[\\^~]?\\d{1,6}(?:\\.\\d{1,6}){2,3}[\\w.+-]{0,32}';
const HOLDS_NO_LITERAL = `<\\w{1,16}>[^<"'\`]{0,256}<\\/\\w{1,16}>|(?:${INTERPOLATION})?\\/(?:[\\w.-]{1,64}\\/){1,16}[\\w.-]{1,64}${CLOSE}`
  + `|(?:${INTERPOLATION}[.:/_-]?){1,8}${CLOSE}|${VERSION}(?: \\|\\| ${VERSION}){0,8}${CLOSE}`;
const LITERAL = `[bBrRuUfF]{0,2}\\\\?["'\`](?!${HOLDS_NO_LITERAL})${MIXED(QUOTED_RUN)}${QUOTED_RUN}{8,2048}`;
const PLACEHOLDER_PASSWORD = '(?:password|passwd|pass|pwd|secret|changeme|example)@'; // an example URL's own word, not a value
const BARE = `(?!${CODE_NAME}|${CODE_FORM})${MIXED(BARE_RUN)}${BARE_RUN}{8,2048}`;
const BARE_END = '(?=["\'`;&\\s\\\\]|$)';
const KEY_END = '\\\\?["\'`]?\\]?'; // a key's own closing quote and bracket: `config["password"]`, `"password\":`
const OPERATOR = ':=|=>|=|:|\\|\\||\\?\\?|\\?:|\\bor\\b';
const TYPED = ':[ \\t]{0,8}[\\w<>\\[\\]&|.,?: ]{1,48}?[ \\t]{0,8}=';
const SPACE = '[ \\t]{0,16}';
const URL_START = ':\\/\\/'; // the scheme adds no meaning here, and a scan from `://` costs nothing on text that holds none

const SHAPES = [
  { label: 'atlasbound-key', re: /ab_live_[0-9a-z_]{6,}/gi },
  { label: 'atlasbound-device-secret', re: /ab_device_[0-9a-f]{6,}/gi },
  { label: 'sk-key', re: /sk-[A-Za-z0-9]{20,}/g },
  { label: 'sk-segmented-key', re: /\bsk-[A-Za-z0-9](?:[A-Za-z0-9]|[-_](?=[A-Za-z0-9])){23,}/g },
  { label: 'github-token', re: /gh[pousr]_[A-Za-z0-9]{20,}/g },
  { label: 'github-fine-grained-token', re: /github_pat_[A-Za-z0-9_]{20,}/g },
  { label: 'gitlab-token', re: /glpat-[A-Za-z0-9_-]{20,}/g },
  { label: 'slack-token', re: /xox[abeoprs]-[A-Za-z0-9-]{10,}/g },
  { label: 'slack-app-token', re: /\bxapp-\d-[A-Za-z0-9-]{10,}/g },
  { label: 'slack-webhook', re: /hooks\.slack\.com\/services\/[A-Za-z0-9/_-]{20,}/g },
  { label: 'stripe-key', re: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { label: 'stripe-webhook-secret', re: /\bwhsec_[A-Za-z0-9+/=]{16,}/g },
  { label: 'google-api-key', re: /AIza[0-9A-Za-z_-]{35}/g },
  { label: 'google-oauth-token', re: /\bya29\.[A-Za-z0-9_-]{20,}/g },
  { label: 'google-client-secret', re: /\bGOCSPX-[A-Za-z0-9_-]{20,}/g },
  { label: 'azure-storage-key', re: /\b(?:AccountKey|SharedAccessKey)=[A-Za-z0-9+/]{16,}/gi },
  { label: 'azure-sas-signature', re: /[?&]sig=[A-Za-z0-9%+/]{16,}/g },
  { label: 'azure-client-secret', re: /\b[A-Za-z0-9_~.-]{3}\dQ~[A-Za-z0-9_~.-]{30,}/g },
  { label: 'sendgrid-key', re: /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}/g },
  { label: 'huggingface-token', re: /\bhf_[A-Za-z0-9]{30,}/g },
  { label: 'digitalocean-token', re: /\bdop_v1_[a-f0-9]{40,}/g },
  { label: 'pypi-token', re: /\bpypi-AgE[A-Za-z0-9_-]{20,}/g },
  { label: 'npm-token', re: /npm_[A-Za-z0-9]{36}/g },
  { label: 'aws-access-key', re: /AKIA[0-9A-Z]{16}/g },
  { label: 'aws-temporary-key', re: /ASIA[0-9A-Z]{16}/g },
  { label: 'aws-key-base64', re: /\b(?:QUtJQ|QVNJQ)[A-Za-z0-9+/]{16,}/g },
  { label: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { label: 'bearer-token', re: /bearer\s+[A-Za-z0-9._-]{20,}/gi },
  { label: 'basic-auth', re: /authorization\W{1,8}basic\s+[A-Za-z0-9+/]{8,}/gi },
  { label: 'private-key-block', keyStart: true, re: /-----\s{0,8}BEGIN\s{1,8}[A-Z0-9 ]*PRIVATE\s{1,8}KEY[\s\S]*?(?:-----\s{0,8}END\s{1,8}[A-Z0-9 ]{0,64}PRIVATE\s{1,8}KEY(?: BLOCK)?\s{0,8}-----|$)/gi },
  { label: 'private-key-spelled', re: /-----\s{0,8}begin\s{1,8}[a-z0-9 ]{0,32}private\s{1,8}key/gi, keyStart: true },
  // base64 of the armour; a certificate and a public key are not secrets
  { label: 'private-key-base64', re: /\bLS0tLS1CRUdJTi(?!BDRVJU|BQVUJMSU)[A-Za-z0-9+/]{4,}/g, keyStart: true },
  { label: 'der-key-body', re: /\bMII[A-Za-z0-9+/]{100,}/g, keyStart: true },
  { label: 'putty-key', re: /PuTTY-User-Key-File-\d/g, keyStart: true },
  { label: 'url-password', re: new RegExp(`\\b[a-z][a-z0-9+.-]{0,32}:\\/\\/[^\\s:/@'"\`]{1,256}:(?![$<{%]|${PLACEHOLDER_PASSWORD})[^\\s:/@'"\`]{1,256}@[^\\s/'"\`]`, 'gi') },
  { label: 'url-password-no-user', re: new RegExp(`${URL_START}:(?![$<{%])[^\\s/@'"\`]{6,256}@`, 'g') },
  { label: 'url-password-odd-start', re: new RegExp(`${URL_START}[^\\s:/@'"\`]{1,64}:(?:%[0-9A-Fa-f]{2}`
    + `|\\$(?![{(])(?=[^\\s/@'"\`]{0,256}[a-z])(?=[^\\s/@'"\`]{0,256}\\d)|\\{(?![^\\s/@'"\`]{0,256}\\}))[^\\s/@'"\`]{6,256}@`, 'g') },
  { label: 'url-password-odd-middle', re: new RegExp(`${URL_START}[^\\s:/@'"\`$<{%]{1,64}:(?=[^\\s'"\`@/:]{0,64}[A-Za-z])[^\\s'"\`@/:]{1,64}[/:][^\\s'"\`/]{6,256}@[^\\s/'"\`]`, 'g') },
  { label: 'url-token-user', re: /\bhttps?:\/\/[A-Za-z0-9_-]{32,}@/g },
  { label: 'quoted-credential', re: new RegExp(`(?:${KEYWORD})[\\w-]{0,64}["']?\\s{0,8}(?:=>|=|:)\\s{0,8}["'\`](?!${HOLDS_NO_LITERAL})${VALUE('["\'`]')}`, 'gi') },
  { label: 'assigned-credential', re: new RegExp(`^[ \\t]{0,32}(?:export[ \\t]{1,8})?[\\w.-]{0,64}(?:${KEYWORD})[\\w.-]{0,64}`
    + `[ \\t]{0,8}[:=][ \\t]{0,8}(?!${CODE_FORM})${VALUE('[ \\t]*$')}`, 'gim') },
  // A bare value may sit indented under `name:` on the next line, never at the margin (`A_SECRET=` above `B_ID2=` would read a name as a
  // value).
  { label: 'code-credential', re: new RegExp(`(?:${KEYWORD})${NAME_REST('[\\w.-]', 64)}${KEY_END}${SPACE}(?:${OPERATOR}|${TYPED})${SPACE}${LITERAL}`, 'gi') },
  { label: 'pair-credential', re: new RegExp(`(?:${KEYWORD})${NAME_REST('[\\w.-]', 64)}\\\\?["'\`]${SPACE},${SPACE}${LITERAL}`, 'gi') },
  { label: 'spaced-credential', re: new RegExp(`^[ \\t]{0,128}(?:export[ \\t]{1,8})?[\\w.-]{0,64}(?:${KEYWORD})${NAME_REST('[\\w.-]', 64)}[ \\t]{0,64}`
    + `(?:[:=][ \\t]{0,64}|:[ \\t]{0,64}\\r?\\n[ \\t]{1,64})${BARE}[ \\t]{0,16}(?:#|//|$)`, 'gim') },
  { label: 'inline-credential', re: new RegExp(`(?:${KEYWORD})${NAME_REST('[\\w-]', 96)}=${BARE}${BARE_END}`, 'gim') },
  { label: 'setter-credential', re: new RegExp(`\\b(?:set|with)\\w{0,32}(?:${KEYWORD})\\w{0,32}\\(\\s{0,8}${LITERAL}`, 'gi') },
  { label: 'markup-credential', re: new RegExp(`<(?:${KEYWORD})[^<>\\s]{0,32}>${BARE}<\\/`
    + `|\\b(?:key|name)\\s{0,8}=\\s{0,8}\\\\?["'][^"']{0,64}(?:${KEYWORD})[^"']{0,64}\\\\?["']\\s{1,8}value\\s{0,8}=\\s{0,8}${LITERAL}`, 'gi') },
  { label: 'sql-credential', re: new RegExp(`\\b(?:identified\\s{1,8}by|with\\s{1,8}password)\\s{1,8}${LITERAL}`, 'gi') },
  // `pass` alone is a word inside bypass and compass, so this one row reads the letter case: a word of its own, or the tail of a camelCase
  // name.
  { label: 'pass-credential', re: new RegExp(`(?:(?<![A-Za-z])(?:pass|Pass|PASS)|(?<=[a-z])Pass)(?![A-Za-z0-9_-])${KEY_END}${SPACE}`
    + `(?:=>|:=|=|:)${SPACE}(?:${LITERAL}|${BARE}${BARE_END})`, 'gm') },
  // A literal default after an env read, whatever the key: no dot, colon or path (a version, url or directory is a default too).
  { label: 'env-default', re: new RegExp(`\\b(?:env|environ|getenv|get_env)\\b[^\\n]{0,40}?(?:\\|\\||\\?\\?|\\?:|,|\\bor\\b|unwrap_or\\()${SPACE}`
    + `[bBrRuUfF]{0,2}\\\\?["'\`]${MIXED('[A-Za-z0-9_+=-]')}[A-Za-z0-9_+=-]{16,2048}`, 'gi') },
  { label: 'placeholder-default', re: new RegExp(`\\$\\{[\\w.-]{0,64}(?:${KEYWORD})[\\w.-]{0,64}:-?${MIXED('[^\\s"\'`}]')}[^\\s"'\`}]{8,2048}`, 'gi') },
  { label: 'cli-credential', re: new RegExp(`\\b(?:curl\\b[^\\n]{0,64}?\\s(?:-u|--user)[ =]['"]?[^\\s:'"$]{1,64}:|sshpass\\s{1,8}-p\\s{0,8}['"]?`
    + `|mysql(?:dump|admin)?\\b[^\\n]{0,64}?\\s-p['"]?|docker\\s{1,8}login\\b[^\\n]{0,64}?\\s(?:-p|--password)[ =]['"]?`
    + `|aws\\s{1,8}configure\\s{1,8}set\\s{1,8}\\S{1,64}\\s{1,8}['"]?)${BARE}`, 'g') },
];
const fresh = ({ re }) => new RegExp(re.source, re.flags);
const TESTS = SHAPES.map(({ label, re }) => ({ label, re: new RegExp(re.source, re.flags.replace('g', '')) }));
/** `\u0041` and `\x41` read as the letters they spell: a model answer can write a key that way. */
const unescaped = (text) => text.replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})/g, (_, four, two) => String.fromCharCode(parseInt(four || two, 16)));

function find(text) {
  const seen = visible(text);
  const spelled = visible(unescaped(seen));
  const spellings = spelled === seen ? [seen] : [seen, spelled];
  return TESTS.filter(({ re }) => spellings.some((s) => re.test(s))).map(({ label }) => label);
}

// Scrub before any cut: a key cut short no longer matches its row.
const scrub = (text) => SHAPES.reduce((out, shape, i) => (TESTS[i].re.test(out) ? out.replace(fresh(shape), `[${shape.label}]`) : out), visible(text));
const clipped = (text, max) => clip(scrub(text), max);
// A mask keeps its line's indentation: a reader finding a block by indentation never takes it for the block's end.
const MASK = '█';
const maskOf = (line) => `${/^[ \t]*/.exec(line)[0]}█`;
const isMask = (line) => typeof line === 'string' && line.trim() === MASK;
function masked(text) {
  const shapes = find(text);
  if (!shapes.length) return text;
  if (SHAPES.some(({ label, keyStart }) => keyStart && shapes.includes(label))) return null;
  const shown = text.split('\n').map((line) => (find(line).length ? maskOf(line) : line)).join('\n');
  return find(shown).length ? null : shown;
}

const stringsIn = (value) => {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [...(Array.isArray(value) ? [] : [key]), ...stringsIn(item)]);
};
const holds = (value) => [JSON.stringify(value) ?? '', ...stringsIn(value)].some((text) => find(text).length > 0);

module.exports = { find, scrub, clipped, holds, masked, isMask };
