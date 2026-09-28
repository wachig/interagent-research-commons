import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const browserModule = path.join(root, "relay/assets/predictive-keyboard/vendor/libpresage.js");
const sourceData = path.join(root, "relay/assets/predictive-keyboard/vendor/third_party/libpresage/en_US.data");
const compactDataPath = path.join(root, "relay/assets/predictive-keyboard/vendor/third_party/libpresage/en_US-html.data");
const configPath = path.join(root, "relay/assets/predictive-keyboard/vendor/resources_js/en_US/presage_html.xml");
const outputModule = path.join(root, "relay/html_keyboard_presage.js");
const outputManifest = path.join(root, "relay/html_keyboard_model.json");
const publicSourceDir = path.join(root, "relay/assets/predictive-keyboard/vendor/source");

let source = await readFile(browserModule, "utf8");
const data = await readFile(sourceData);
const config = await readFile(configPath);
const selectedPaths = [
  "/resources_js/en_US/ngrams_db/ngrams.counts",
  "/resources_js/en_US/ngrams_db/ngrams.trie",
];
let manifest = null;
let compactChunks = null;
const packagePattern = /loadPackage\(\{files:\[(.*?)\],remote_package_size:(\d+)\}\)/gs;
source.replace(packagePattern, (_whole, fileList) => {
  if (manifest || !fileList.includes(selectedPaths[0])) return _whole;
  const rows = [...fileList.matchAll(/\{filename:"([^"]+)",start:(\d+),end:(\d+)\}/g)].map((match) => ({
    path: match[1], start: Number(match[2]), end: Number(match[3]),
  }));
  const selected = selectedPaths.map((filePath) => rows.find((row) => row.path === filePath));
  if (selected.some((row) => !row)) throw new Error("The generated Presage bundle does not include both n-gram files.");
  const files = [];
  const chunks = [];
  let offset = 0;
  for (const row of selected) {
    const bytes = data.subarray(row.start, row.end);
    chunks.push(bytes);
    files.push({ path: row.path, start: offset, end: offset + bytes.length });
    offset += bytes.length;
  }
  chunks.push(config);
  files.push({ path: "/resources_js/en_US/presage_html.xml", start: offset, end: offset + config.length });
  offset += config.length;
  manifest = { files, size: offset };
  compactChunks = chunks;
  return _whole;
});
if (!manifest) throw new Error("Could not extract the English n-gram resources from the generated module.");

const wrappers = [];
let cursor = 0;
while ((cursor = source.indexOf("loadPackage({files:", cursor)) !== -1) {
  const start = source.lastIndexOf("(()=>{", cursor);
  const endIndex = source.indexOf("})();", cursor);
  if (start < 0 || endIndex < 0) throw new Error("Could not find a generated Presage package wrapper.");
  wrappers.push({ start, end: endIndex + 5 });
  cursor = endIndex + 5;
}
for (const wrapper of wrappers.toReversed()) source = source.slice(0, wrapper.start) + source.slice(wrapper.end);

await writeFile(compactDataPath, Buffer.concat(compactChunks));
await writeFile(outputModule, source);
await writeFile(outputManifest, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(publicSourceDir, "prepare-presage-html-worker.mjs"), await readFile(fileURLToPath(import.meta.url)));
await writeFile(path.join(publicSourceDir, "libpresage-html-worker.js"), source);
console.log(`Wrote stripped Worker predictor module to ${outputModule} (${wrappers.length} data loaders removed).`);
console.log(`Compact model data: ${manifest.size} bytes.`);
