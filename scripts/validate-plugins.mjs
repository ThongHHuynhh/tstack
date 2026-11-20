#!/usr/bin/env node

// Checks tstack's plugin manifests and marketplaces for every agent it ships to:
// the portable root plugin.json (Codex, Agent Plugins), .claude-plugin/ (Claude Code), .cursor-plugin/ (Cursor),
// and .agents/plugins/marketplace.json (Codex). Names and versions must agree. Exits 1 on any problem.
// Adapted from cursor/plugins scripts/validate-plugins.mjs.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFESTS = ["plugin.json", ".claude-plugin/plugin.json", ".cursor-plugin/plugin.json"];
const MARKETPLACES = [".claude-plugin/marketplace.json", ".agents/plugins/marketplace.json"];

const problems = [];
const fail = (message) => problems.push(message);
const load = (path) => {
  try {
    return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
  } catch (error) {
    fail(`${path}: ${error.code === "ENOENT" ? "missing" : `invalid JSON (${error.message})`}`);
    return undefined;
  }
};

const manifests = new Map(MANIFESTS.map((path) => [path, load(path)]));
const [name] = [...manifests.values()].filter(Boolean).map((manifest) => manifest.name);

for (const [path, manifest] of manifests) {
  if (!manifest) continue;
  if (manifest.name !== name) fail(`${path}: name ${JSON.stringify(manifest.name)} differs from ${JSON.stringify(name)}`);
  if (!manifest.version) fail(`${path}: no version`);
}
const versions = new Set([...manifests.values()].filter(Boolean).map((manifest) => manifest.version));
if (versions.size > 1) fail(`manifest versions differ: ${[...manifests].map(([p, m]) => `${p}=${m?.version}`).join(", ")}`);

// The Cursor manifest has a published schema; check it when ajv is installed (CI installs it).
const cursor = manifests.get(".cursor-plugin/plugin.json");
try {
  const { default: Ajv } = await import("ajv");
  const { default: addFormats } = await import("ajv-formats");
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  const validate = ajv.compile(JSON.parse(readFileSync(join(ROOT, "schemas/plugin.schema.json"), "utf8")));
  if (cursor && !validate(cursor)) {
    for (const error of validate.errors) {
      const extra = error.keyword === "additionalProperties" ? ` "${error.params.additionalProperty}"` : "";
      fail(`.cursor-plugin/plugin.json${error.instancePath || "/"}: ${error.message}${extra}`);
    }
  }
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
  console.log("note: ajv not installed, skipped the .cursor-plugin schema check (npm install --no-save ajv ajv-formats)");
}

for (const path of MARKETPLACES) {
  const marketplace = load(path);
  if (!marketplace) continue;
  const entry = (marketplace.plugins ?? []).find((plugin) => plugin.name === name);
  if (!entry) {
    fail(`${path}: no entry for plugin ${JSON.stringify(name)}`);
    continue;
  }
  const source = typeof entry.source === "string" ? entry.source : entry.source?.path;
  // Both Claude Code and Codex resolve a local source against the marketplace root, the folder that holds .claude-plugin/ or .agents/.
  if (!source?.startsWith("./")) fail(`${path}: source ${JSON.stringify(source)} must start with ./`);
  else if (!existsSync(join(resolve(ROOT, source), "plugin.json"))) fail(`${path}: source ${source} has no plugin.json`);
  if (path.startsWith(".agents/")) {
    for (const field of ["policy.installation", "policy.authentication", "category"]) {
      if (field.split(".").reduce((value, key) => value?.[key], entry) === undefined) fail(`${path}: entry has no ${field}`);
    }
  }
}

for (const problem of problems) console.log(`FAIL ${problem}`);
console.log(problems.length ? `${problems.length} problems` : `${name} ${[...versions][0]}: manifests and marketplaces agree`);
if (problems.length) process.exit(1);
