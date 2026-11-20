#!/usr/bin/env node

// Checks that Claude Code and Codex can follow tstack's skills. Exits 1 on any problem; `--fix` repairs (3).
// 1 and 2 come from cursor/plugins scripts/generate-pstack-harness-trees.mjs, which tstack does not need as a generator
// because its repository root is the installed plugin.
// 1. A SKILL.md that uses a Cursor name carries the adapter line under its H1, and the adapter has a row for that name.
// 2. Frontmatter `name` matches the folder name, because Claude Code and Codex list a skill by `name` and Cursor runs it by folder.
// 3. Codex has no `disable-model-invocation`, so each such skill carries agents/openai.yaml that turns off implicit use.

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKILLS = join(ROOT, "skills");
const ADAPTER = "docs/harness/claude-code.md";
const FIX = process.argv.includes("--fix");
const LINE =
  `In Claude Code or Codex, read [the adapter](../../${ADAPTER}) once per session before you follow this skill. ` +
  "It maps the Cursor names in tstack skills to Claude Code and Codex.";
const CODEX_POLICY = "policy:\n  allow_implicit_invocation: false\n";

const TERMS = [
  { key: "`Task`", re: /`Task`|\bTask (tool|subagent|call)/ },
  { key: "`AskQuestion`", re: /AskQuestion/ },
  { key: "todolist", re: /\btodo ?list\b/i },
  { key: "generalPurpose", re: /generalPurpose/ },
  { key: "t-agent", re: /\bt-agent\b/ },
  { key: "comment-sicko", re: /comment-sicko/ },
  { key: "`readonly: true`", re: /readonly: (true|false)|readonly\/Ask/ },
  { key: "`environment: \"cloud\"`", re: /environment: "(cloud|local)"/ },
  { key: "cloud_base_branch", re: /cloud_base_branch/ },
  { key: "`run_in_background: true`", re: /run_in_background/ },
  { key: "`resume`", re: /`resume`/ },
  { key: "`file_attachments`", re: /file_attachments/ },
  { key: "claude-", re: /\bclaude-[a-z]+-\d/ },
  { key: "inherit-parent", re: /inherit-parent/ },
  { key: "tstack-models.mdc", re: /tstack-models\.mdc/ },
  { key: ".cursor/skills/", re: /\.cursor\/skills/ },
  { key: "~/.cursor/plugins/", re: /\.cursor\/plugins|\.cursor-plugin/ },
  { key: ".cursor/rules/", re: /\.cursor\/rules|always-applied rule/ },
  { key: "agent-transcripts", re: /agent-transcripts|\.cursor\/projects/ },
  { key: "Cursor-only features", re: /Bugbot|Cursor [Aa]utomation|cursor\.(sh|com)\/automations|[Cc]loud [Aa]gent|built-in PR tool/ },
];
const ROUTE_KEY = "Run another tstack skill";

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (name === "node_modules") return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const skills = readdirSync(SKILLS).filter((name) => existsSync(join(SKILLS, name, "SKILL.md")));
const adapter = readFileSync(join(ROOT, ADAPTER), "utf8");
const problems = [];
const fixed = [];
const users = new Map();

for (const skill of skills) {
  const path = join(SKILLS, skill, "SKILL.md");
  const text = readFileSync(path, "utf8");
  const others = skills.filter((name) => name !== skill).join("|");
  const route = new RegExp(`the \\*\\*(?<bold>${others})\\*\\* skill|\`/(?<command>${others})\``, "g");
  const namesBareSkill = (line) =>
    [...line.matchAll(route)].some(({ groups }) => !line.includes(`(../${groups.bold ?? groups.command}/`));
  const used = new Set();
  for (const file of walk(join(SKILLS, skill)).filter((file) => file.endsWith(".md"))) {
    const body = readFileSync(file, "utf8").replace(LINE, "");
    for (const term of TERMS) if (term.re.test(body)) used.add(term.key);
    if (body.split("\n").some(namesBareSkill)) used.add(ROUTE_KEY);
  }
  for (const key of used) users.set(key, [...(users.get(key) ?? []), skill]);
  if (used.size > 0 && !text.includes(LINE)) problems.push(`skills/${skill}/SKILL.md uses Cursor names (${[...used].join(", ")}) but lacks the adapter line`);
  if (used.size === 0 && text.includes(LINE)) problems.push(`skills/${skill}/SKILL.md has the adapter line but uses no Cursor name`);

  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const name = frontmatter.match(/^name:(.*)$/m)?.[1].trim().replace(/^(["'])(.*)\1$/, "$2");
  if (name !== skill) problems.push(`skills/${skill}/SKILL.md has name ${JSON.stringify(name ?? "")}, not its folder name`);

  const policy = join(SKILLS, skill, "agents", "openai.yaml");
  const manualOnly = /^disable-model-invocation:\s*true\s*$/m.test(frontmatter);
  const current = existsSync(policy) ? readFileSync(policy, "utf8").replace(/\r\n/g, "\n") : undefined;
  if (manualOnly && current !== CODEX_POLICY) {
    if (FIX) {
      mkdirSync(dirname(policy), { recursive: true });
      writeFileSync(policy, CODEX_POLICY);
      fixed.push(`skills/${skill}/agents/openai.yaml`);
    } else problems.push(`skills/${skill} is manual-only but agents/openai.yaml does not turn off Codex implicit use`);
  } else if (!manualOnly && current !== undefined) {
    if (FIX) {
      rmSync(policy);
      if (readdirSync(dirname(policy)).length === 0) rmSync(dirname(policy), { recursive: true });
      fixed.push(`removed skills/${skill}/agents/openai.yaml`);
    } else problems.push(`skills/${skill} can be invoked by the model but has agents/openai.yaml`);
  }
}

for (const [key, using] of users) {
  if (!adapter.includes(key)) problems.push(`${ADAPTER} has no row for ${key}, used by ${using.join(", ")}`);
}

if (fixed.length) console.log(`fixed ${fixed.length} files`);
for (const problem of problems) console.log(`FAIL ${problem}`);
console.log(`${problems.length} problems`);
if (problems.length) process.exit(1);
