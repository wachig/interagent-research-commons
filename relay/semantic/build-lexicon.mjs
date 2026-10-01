import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "relay/semantic/esdb-70-words.txt");
const exportMetadata = JSON.parse(await readFile(join(ROOT, "relay/semantic/esdb-export-manifest.json"), "utf8"));
const selectedExport = exportMetadata.exports.find((entry) => entry.size === exportMetadata.policy.selected_size);
const SUBTLEX_SOURCE = join(ROOT, "relay/semantic/subtlex-us.tsv.gz");
const OUTPUT = join(ROOT, "relay/assets/semantic-lexicon");
const MAX_SHARD_BYTES = 64 * 1024;
const SUBTLEX_RAW_SHA256 = "c5f86f065fc5d057fbf366433b8c5ca550aa7c24e128362dea4394f2b29c86e4";
const WORD = /^[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*$/u;
const encoder = new TextEncoder();

const codepointCompare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const hash = (text) => createHash("sha256").update(text).digest("hex");

const sourceBytes = await readFile(SOURCE);
const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(sourceBytes);
const lines = sourceText.split(/\r?\n/u);
if (hash(sourceBytes) !== selectedExport.sha256) throw new Error("The expanded ESDB export failed its integrity check.");

const unique = new Map();
for (const line of lines) {
  const entry = line.trim();
  const normalized = entry.normalize("NFC");
  if (!WORD.test(normalized) || encoder.encode(normalized).byteLength > 320 || [...normalized].length > 80) continue;
  const key = normalized.toLocaleLowerCase("en-US");
  const existing = unique.get(key);
  if (!existing || normalized === key && existing !== key || (normalized === key) === (existing === key) && codepointCompare(normalized, existing) < 0) unique.set(key, normalized);
}

const words = [...unique.values()].sort(codepointCompare);
if (words.length < 30_000) throw new Error(`Only ${words.length} usable words were indexed; the plan requires at least 30,000.`);

const subtlexCompressed = await readFile(SUBTLEX_SOURCE);
const subtlexBytes = gunzipSync(subtlexCompressed);
if (hash(subtlexBytes) !== SUBTLEX_RAW_SHA256) throw new Error("The pinned SUBTLEX-US frequency source failed its SHA-256 check.");
const subtlexText = new TextDecoder("utf-8", { fatal: true }).decode(subtlexBytes);
const [frequencyHeader, ...frequencyRows] = subtlexText.trimEnd().split(/\r?\n/u);
const frequencyColumns = frequencyHeader.split("\t");
const column = (name) => frequencyColumns.indexOf(name);
const wordColumn = column("Word");
const frequencyColumn = column("FREQlow");
const diversityColumn = column("Cdlow");
if (wordColumn < 0 || frequencyColumn < 0 || diversityColumn < 0 || frequencyRows.length !== 74_286) throw new Error("The pinned SUBTLEX-US source has an unexpected schema or row count.");
const subtlexByWord = new Map();
for (const line of frequencyRows) {
  const fields = line.split("\t");
  const key = fields[wordColumn].normalize("NFC").toLocaleLowerCase("en-US");
  const item = { frequency: Number(fields[frequencyColumn]), diversity: Number(fields[diversityColumn]) };
  if (!key || !Number.isFinite(item.frequency) || !Number.isFinite(item.diversity) || item.frequency < 0 || item.diversity < 0) throw new Error("A SUBTLEX-US frequency row is invalid.");
  const previous = subtlexByWord.get(key);
  if (!previous || item.diversity > previous.diversity || item.diversity === previous.diversity && item.frequency > previous.frequency) subtlexByWord.set(key, item);
}

const chunkOrderGroups = new Map();
for (const word of words) {
  const lower = word.normalize("NFC").toLocaleLowerCase("en-US");
  const frequency = subtlexByWord.get(lower) || { frequency: 0, diversity: 0 };
  for (const length of [1, 2]) {
    const prefix = [...lower].slice(0, length).join("");
    if (!new RegExp(`^\\p{L}{${length}}$`, "u").test(prefix)) continue;
    if (!chunkOrderGroups.has(prefix)) chunkOrderGroups.set(prefix, []);
    chunkOrderGroups.get(prefix).push({ word, frequency });
  }
}
const wordCategory = (value) => /^[\p{Lu}\p{M}\p{N}]+$/u.test(value) ? 2 : /^[\p{Lu}]/u.test(value) ? 1 : 0;
for (const entries of chunkOrderGroups.values()) entries.sort((left, right) =>
  right.frequency.diversity - left.frequency.diversity ||
  right.frequency.frequency - left.frequency.frequency ||
  wordCategory(left.word) - wordCategory(right.word) ||
  left.word.localeCompare(right.word, "en-US"));

const shards = [];
const shardFiles = [];
const startPairCounts = new Map();
const shortCharacters = new Set();
const twoLetterWords = [];
for (const value of words) {
  const chars = [...value.toLocaleLowerCase("en-US")];
  if (chars.length === 1 && /^[\p{L}\p{N}]$/u.test(chars[0])) shortCharacters.add(value);
  if (chars.length === 2 && /^\p{L}{2}$/u.test(chars.join(""))) twoLetterWords.push(value);
  const pair = chars.slice(0, 2).join("");
  if (!/^\p{L}{2}$/u.test(pair)) continue;
  startPairCounts.set(pair, (startPairCounts.get(pair) || 0) + 1);
}

async function addShard(prefix, entries) {
  const content = JSON.stringify(entries);
  const size = encoder.encode(content).byteLength;
  if (size > MAX_SHARD_BYTES) throw new Error(`Lexicon shard ${JSON.stringify(prefix)} exceeds 64 KiB.`);
  const index = String(shardFiles.length).padStart(4, "0");
  const path = `shards/${index}.json`;
  const absolute = join(OUTPUT, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, `${content}\n`);
  const digest = hash(content);
  shards.push({ prefix, path, count: entries.length, bytes: size, sha256: digest });
  shardFiles.push(absolute);
}

async function partition(prefix, entries) {
  const encoded = JSON.stringify(entries);
  if (encoder.encode(encoded).byteLength <= MAX_SHARD_BYTES) {
    await addShard(prefix, entries);
    return;
  }
  const exact = entries.filter((word) => word === prefix);
  if (exact.length) await addShard(prefix, exact);
  const groups = new Map();
  for (const word of entries) {
    if (word === prefix) continue;
    const next = [...word.slice(prefix.length)][0];
    if (!next) continue;
    const child = `${prefix}${next}`;
    if (!groups.has(child)) groups.set(child, []);
    groups.get(child).push(word);
  }
  if (!groups.size) throw new Error(`Unable to partition lexicon at prefix ${JSON.stringify(prefix)}.`);
  for (const [child, values] of [...groups].sort(([a], [b]) => codepointCompare(a, b))) await partition(child, values);
}

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
const rootGroups = new Map();
for (const word of words) {
  const first = [...word][0];
  if (!rootGroups.has(first)) rootGroups.set(first, []);
  rootGroups.get(first).push(word);
}
for (const [prefix, entries] of [...rootGroups].sort(([a], [b]) => codepointCompare(a, b))) await partition(prefix, entries);

const manifest = {
  format: "iarc-semantic-lexicon-1",
  lexicon_version: "relay-esdb-1e5b7d3a-70-v1",
  source: {
    name: "English Speller Database / SCOWL, filtered full word forms with Relay additions",
    pinned_commit: exportMetadata.policy.pinned_commit,
    source_archive: "/lexicon-source/esdb-1e5b7d3a.tar.gz",
    source_archive_sha256: exportMetadata.policy.archive_sha256,
    extracted_dictionary_sha256: hash(sourceBytes),
    license: "ESDB combined MIT-like license; retain upstream Copyright notices",
    license_file: "/lexicon-source/ESDB-Copyright.txt",
    source_count: selectedExport.upstream_filtered_forms,
    scope: exportMetadata.policy.scope,
    size: selectedExport.size,
    policy_file: "/lexicon-source/relay-policy-1.json",
    additions_file: "/lexicon-source/relay-additions-1.json",
    export_manifest: "/lexicon-source/esdb-export-1.json",
    export_arguments: selectedExport.export_arguments,
    additions_sha256: exportMetadata.additions_sha256,
    generation: "python3 relay/semantic/export-esdb.py; node relay/semantic/build-lexicon.mjs; node relay/semantic/build-inside-pairs.mjs; node relay/semantic/build-end-pairs.mjs",
  },
  word_count: words.length,
  shard_limit_bytes: MAX_SHARD_BYTES,
  shards,
};
await writeFile(join(OUTPUT, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(join(OUTPUT, "start-pairs.json"), `${JSON.stringify({
  lexicon_version: manifest.lexicon_version,
  pairs: [...startPairCounts].sort(([left], [right]) => codepointCompare(left, right)).map(([value, count]) => ({ value, count })),
  short_characters: [...shortCharacters].sort(codepointCompare),
  two_letter_words: twoLetterWords,
})}\n`);
const chunkOrderDir = join(OUTPUT, "chunk-order");
await mkdir(chunkOrderDir, { recursive: true });
const chunkOrderFiles = [];
for (const [prefix, entries] of [...chunkOrderGroups].sort(([left], [right]) => codepointCompare(left, right))) {
  const content = JSON.stringify(entries.map(({ word }) => word));
  const size = encoder.encode(content).byteLength;
  if (size > 512 * 1024) throw new Error(`Chunk candidate order ${prefix} exceeds 512 KiB.`);
  const file = `${prefix}.json`;
  await writeFile(join(chunkOrderDir, file), `${content}\n`);
  chunkOrderFiles.push({ prefix, path: `chunk-order/${file}`, count: entries.length, bytes: size, sha256: hash(content) });
}
await writeFile(join(OUTPUT, "chunk-order-manifest.json"), `${JSON.stringify({
  format: "iarc-chunk-candidate-order-1",
  source: "SUBTLEX-US lowercase word frequency and contextual diversity",
  attribution: "Marc Brysbaert and Boris New, SUBTLEX-US; see relay/semantic/SUBTLEX_US_ATTRIBUTION.md",
  source_url: "https://www.ugent.be/pp/experimentele-psychologie/en/research/documents/subtlexus",
  source_sha256: SUBTLEX_RAW_SHA256,
  lexicon_version: "relay-esdb-1e5b7d3a-70-v1",
  lexicon_word_count: words.length,
  ranked_word_count: words.filter((word) => (subtlexByWord.get(word.normalize("NFC").toLocaleLowerCase("en-US"))?.diversity || 0) > 0).length,
  unranked_policy: "All selected ESDB word forms and Relay additions remain included; words without a lowercase SUBTLEX-US score follow ranked entries in capitalization-aware alphabetical order.",
  reuse_terms: "Credit SUBTLEX authors and make clear the dataset remains freely available; see relay/semantic/SUBTLEX_US_ATTRIBUTION.md.",
  ordering: "Cdlow descending, FREQlow descending, then lowercase/title-case/all-capital group and alphabetical order.",
  prefixes: chunkOrderFiles,
}, null, 2)}\n`);
await writeFile(join(OUTPUT, "README.txt"), `Relay English lexicon\nVersion: ${manifest.lexicon_version}\nUnique usable forms: ${words.length}\nScope: ${manifest.source.scope}\nSource: ESDB commit ${manifest.source.pinned_commit}\nArchive SHA-256: ${manifest.source.source_archive_sha256}\nExpanded export SHA-256: ${hash(sourceBytes)}\nCopyright: ${manifest.source.license_file}\nBuild: ${manifest.source.generation}\n\nFull inflected forms are exported before indexing. The lexicon is deterministic vocabulary, not a prediction model. SUBTLEX-US orders Chunk candidates by contextual diversity/frequency; unranked entries remain available. See relay/semantic/SUBTLEX_US_ATTRIBUTION.md. Source classification filters, explicit exclusions and maintained additions are recorded in relay/semantic/lexicon-policy.json and lexicon-additions.json. Exact character composition does not depend on membership.\n`);
for (const [source, target] of [["lexicon-policy.json", "relay-policy-1.json"], ["lexicon-additions.json", "relay-additions-1.json"], ["esdb-export-manifest.json", "esdb-export-1.json"]]) await copyFile(join(ROOT, "relay/semantic", source), join(ROOT, "relay/assets/lexicon-source", target));
console.log(`Built ${words.length} words in ${shards.length} shards (${shardFiles.map((path) => relative(OUTPUT, path)).join(", ")}).`);
