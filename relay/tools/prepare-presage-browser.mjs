import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourcePath = process.argv[2];
if (!sourcePath) {
  throw new Error("Pass the upstream FluentTyper libpresage.js path as the first argument.");
}

let source = await readFile(sourcePath, "utf8");
const packageStarts = [];
let cursor = 0;
while ((cursor = source.indexOf("loadPackage({files:", cursor)) !== -1) {
  const wrapperStart = source.lastIndexOf("(()=>{", cursor);
  const wrapperEnd = source.indexOf("})();", cursor);
  if (wrapperStart < 0 || wrapperEnd < 0) throw new Error("Could not locate a generated data-package wrapper.");
  const end = wrapperEnd + 4;
  const wrapper = source.slice(wrapperStart, end);
  const packageName = wrapper.includes("/resources_js/en_US/")
    ? "en_US"
    : wrapper.includes("/resources_js/common/")
      ? "common"
      : null;
  packageStarts.push({ start: wrapperStart, end, packageName });
  cursor = end;
}

const retained = packageStarts.filter(({ packageName }) => packageName === "en_US" || packageName === "common");
if (packageStarts.length !== 12 || retained.length !== 2) {
  throw new Error(`Expected 12 language/shared packages and 2 retained packages; found ${packageStarts.length} and ${retained.length}. Inspect the upstream bundle before adapting it.`);
}
for (const { start, end, packageName } of packageStarts.toReversed()) {
  if (!packageName) source = source.slice(0, start) + source.slice(end);
}

source = source.replaceAll(
  'fetch(chrome.runtime.getURL("third_party/libpresage/"+packageName))',
  "fetch(packageName)",
);
if (source.includes("chrome.runtime.getURL")) throw new Error("An extension-only URL loader remains in the adapted module.");

const nodeDetection = 'globalThis.process?.versions?.node&&globalThis.process?.type!="renderer"';
if (!source.includes(`var ENVIRONMENT_IS_NODE=${nodeDetection};`) || !source.includes(`var isNode=globalThis.process&&globalThis.process.versions&&globalThis.process.versions.node&&globalThis.process.type!="renderer";`)) {
  throw new Error("Could not locate both generated Node-runtime checks; inspect the upstream bundle before adapting it.");
}
source = source
  .replace(`var ENVIRONMENT_IS_NODE=${nodeDetection};`, "var ENVIRONMENT_IS_NODE=false;")
  .replace('var isNode=globalThis.process&&globalThis.process.versions&&globalThis.process.versions.node&&globalThis.process.type!="renderer";', "var isNode=false;");
const packageLoader = "var fetched=Module[\"getPreloadedPackage\"]&&Module[\"getPreloadedPackage\"](REMOTE_PACKAGE_NAME,REMOTE_PACKAGE_SIZE);";
if (!source.includes(packageLoader)) throw new Error("Could not locate the generated preloaded-data callback; inspect upstream output before adapting it.");
source = source.replaceAll(packageLoader, "var fetched=Module[\"getPreloadedPackage\"]&&await Module[\"getPreloadedPackage\"](REMOTE_PACKAGE_NAME,REMOTE_PACKAGE_SIZE);");

const outputPath = path.join(repositoryRoot, "relay/assets/predictive-keyboard/vendor/libpresage.js");
await writeFile(outputPath, source);
await writeFile(path.join(repositoryRoot, "relay/assets/predictive-keyboard/vendor/source/prepare-presage-browser.mjs"), await readFile(fileURLToPath(import.meta.url)));
console.log(`Wrote English/shared browser module (${Buffer.byteLength(source)} bytes) to ${outputPath}`);
