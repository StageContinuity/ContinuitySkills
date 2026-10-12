#!/usr/bin/env node

// Generates the shared skills in this repository from a pinned commit of the
// public SpureeSkills repository, applying the Continuity rename on the way.
//
//   node scripts/materialize-spuree-skills.mjs [--source ../SpureeSkills]
//   node scripts/materialize-spuree-skills.mjs --check [--source ../SpureeSkills]
//   node scripts/materialize-spuree-skills.mjs --pin <40-character-sha> --source ../SpureeSkills
//
// Without --source the pinned repository is cloned into a temporary directory.
// The lock (distribution/spuree-skills.lock.json) names the commit, the skills
// and the shared non-skill files; the rename map
// (distribution/rename-map.json) is an ordered list of literal replacements
// plus the tokens that must not survive the rename. The script refuses to
// write a file in which any of those tokens remains, so a new spelling
// upstream fails here instead of shipping under the wrong brand.

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

export const LOCK_RELATIVE_PATH = "distribution/spuree-skills.lock.json";
export const RENAME_MAP_RELATIVE_PATH = "distribution/rename-map.json";
export const SOURCE_REPOSITORY = "https://github.com/CheehooLabs/SpureeSkills.git";
export const README_RELATIVE_PATH = "README.md";

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateRelativePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new Error(`${label} must be a nonempty repository-relative path`);
  }
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value)) {
    throw new Error(`${label} must be repository-relative`);
  }
  const components = value.split(/[\\/]/);
  if (components.some((component) => component === "" || component === "." || component === "..")) {
    throw new Error(`${label} must not contain empty, '.' or '..' path components`);
  }
  return components;
}

export function resolveRepositoryPath(repositoryRoot, relativePath, label) {
  const components = validateRelativePath(relativePath, label);
  const candidate = path.resolve(repositoryRoot, ...components);
  const relative = path.relative(repositoryRoot, candidate);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} resolves outside the repository root`);
  }
  return candidate;
}

export function validateLock(lock) {
  if (!isPlainObject(lock) || lock.schemaVersion !== 1) {
    throw new Error("Unsupported lock schema");
  }
  if (lock.repository !== SOURCE_REPOSITORY) {
    throw new Error(`Lock repository must be ${SOURCE_REPOSITORY}`);
  }
  if (!SHA_PATTERN.test(lock.commit ?? "")) {
    throw new Error("Lock commit must be a full lowercase 40-character SHA");
  }
  if (!Array.isArray(lock.skills) || lock.skills.length === 0) {
    throw new Error("Lock must list at least one skill");
  }
  if (new Set(lock.skills).size !== lock.skills.length) {
    throw new Error("Lock contains duplicate skills");
  }
  for (const skill of lock.skills) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(skill)) {
      throw new Error(`Lock skill ${JSON.stringify(skill)} must use lowercase kebab-case`);
    }
  }
  if (!Array.isArray(lock.files)) throw new Error("Lock files must be an array");
  const destinations = new Set();
  for (const [index, entry] of lock.files.entries()) {
    if (!isPlainObject(entry)) throw new Error(`Lock file ${index} must be an object`);
    validateRelativePath(entry.from, `Lock file ${index} from`);
    validateRelativePath(entry.to, `Lock file ${index} to`);
    if (destinations.has(entry.to)) throw new Error(`Lock file ${index} duplicates destination ${entry.to}`);
    destinations.add(entry.to);
    const [top] = entry.to.split(/[\\/]/);
    if (lock.skills.includes(top)) {
      throw new Error(`Lock file ${index} writes into skill directory ${top}; list skills under "skills"`);
    }
  }
}

export function validateRenameMap(renameMap) {
  if (!isPlainObject(renameMap) || renameMap.schemaVersion !== 1) {
    throw new Error("Unsupported rename map schema");
  }
  for (const key of ["preserve", "residue"]) {
    if (!Array.isArray(renameMap[key])) throw new Error(`Rename map ${key} must be an array`);
    for (const token of renameMap[key]) {
      if (typeof token !== "string" || token.length === 0) {
        throw new Error(`Rename map ${key} entries must be nonempty strings`);
      }
    }
  }
  if (!Array.isArray(renameMap.replacements) || renameMap.replacements.length === 0) {
    throw new Error("Rename map must list at least one replacement");
  }
  for (const [index, replacement] of renameMap.replacements.entries()) {
    if (!isPlainObject(replacement)) throw new Error(`Replacement ${index} must be an object`);
    for (const field of ["from", "to", "reason"]) {
      if (typeof replacement[field] !== "string" || replacement[field].length === 0) {
        throw new Error(`Replacement ${index} ${field} must be a nonempty string`);
      }
    }
    if (replacement.from === replacement.to) {
      throw new Error(`Replacement ${index} replaces ${JSON.stringify(replacement.from)} with itself`);
    }
  }
}

/**
 * Applies the ordered literal replacements to `text`. Tokens listed under
 * `preserve` are shielded first and restored afterwards, so a machine marker
 * that happens to contain the old brand (Studio's `<!-- spuree-agent` block)
 * keeps the spelling its reader expects.
 */
export function applyRenameMap(text, renameMap) {
  let working = text;
  const placeholders = [];
  for (const [index, token] of renameMap.preserve.entries()) {
    const placeholder = `\u0000PRESERVE${index}\u0000`;
    if (!working.includes(token)) continue;
    placeholders.push({ placeholder, token });
    working = working.replaceAll(token, placeholder);
  }
  for (const { from, to } of renameMap.replacements) {
    working = working.replaceAll(from, to);
  }
  for (const { placeholder, token } of placeholders) {
    working = working.replaceAll(placeholder, token);
  }
  return working;
}

/** Lines of `text` in which a residue token survives, as `line:text` strings. */
export function findResidue(text, renameMap) {
  const hits = [];
  const preserved = renameMap.preserve;
  text.split("\n").forEach((line, index) => {
    let stripped = line;
    for (const token of preserved) stripped = stripped.replaceAll(token, "");
    if (renameMap.residue.some((token) => stripped.includes(token))) {
      hits.push(`${index + 1}: ${line.trim()}`);
    }
  });
  return hits;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function git(sourceRoot, args) {
  const { stdout } = await execFileAsync("git", ["-C", sourceRoot, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return stdout;
}

async function resolveSource(lock, suppliedSource) {
  if (suppliedSource) {
    return { sourceRoot: path.resolve(suppliedSource), cleanup: async () => {} };
  }
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "continuity-skills-source-"));
  const sourceRoot = path.join(temporaryRoot, "source");
  try {
    await execFileAsync("git", ["clone", "--quiet", "--no-checkout", lock.repository, sourceRoot], {
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch (error) {
    await rm(temporaryRoot, { force: true, recursive: true });
    throw error;
  }
  return { sourceRoot, cleanup: () => rm(temporaryRoot, { force: true, recursive: true }) };
}

async function assertPinnedCommit(sourceRoot, commit) {
  let resolved;
  try {
    resolved = (await git(sourceRoot, ["rev-parse", "--verify", "--quiet", `${commit}^{commit}`])).trim();
  } catch {
    throw new Error(`Source at ${sourceRoot} does not contain commit ${commit}; fetch it first`);
  }
  if (resolved !== commit) {
    throw new Error(`Source resolved ${commit} to ${resolved}; refusing to materialize an unpinned revision`);
  }
}

async function listSkillFiles(sourceRoot, commit, skill) {
  const listing = await git(sourceRoot, ["ls-tree", "-r", "--name-only", commit, "--", `${skill}/`]);
  const files = listing.split("\n").filter((line) => line.length > 0);
  if (!files.includes(`${skill}/SKILL.md`)) {
    throw new Error(`${skill}: ${commit} has no ${skill}/SKILL.md`);
  }
  return files;
}

async function readPinnedFile(sourceRoot, commit, filePath) {
  try {
    return await git(sourceRoot, ["show", `${commit}:${filePath}`]);
  } catch (error) {
    throw new Error(`${filePath} does not exist at ${commit}: ${error.message}`);
  }
}

/**
 * Builds every output the lock describes without touching the working tree.
 * Returns `[{ source, destination, content }]` with repository-relative paths.
 */
export async function planOutputs({ lock, renameMap, sourceRoot }) {
  await assertPinnedCommit(sourceRoot, lock.commit);
  const outputs = [];
  const seen = new Set();
  const add = (source, destination, upstream) => {
    const content = applyRenameMap(upstream, renameMap);
    const residue = findResidue(content, renameMap);
    if (residue.length > 0) {
      throw new Error(
        `${destination}: the rename left brand tokens behind; add a rule to ${RENAME_MAP_RELATIVE_PATH} or a preserve entry:\n` +
          residue.map((hit) => `  ${hit}`).join("\n"),
      );
    }
    if (seen.has(destination)) throw new Error(`Two sources write ${destination}`);
    seen.add(destination);
    outputs.push({ source, destination, content });
  };

  for (const skill of lock.skills) {
    for (const file of await listSkillFiles(sourceRoot, lock.commit, skill)) {
      const destination = applyRenameMap(file, renameMap);
      add(file, destination, await readPinnedFile(sourceRoot, lock.commit, file));
    }
  }
  for (const entry of lock.files) {
    add(entry.from, entry.to, await readPinnedFile(sourceRoot, lock.commit, entry.from));
  }
  return outputs;
}

/** Every locked skill must be linked from the hand-maintained README. */
export function findUnlistedSkills(readme, lock) {
  return lock.skills.filter((skill) => !readme.includes(`](./${skill}/SKILL.md)`));
}

export async function materializeSpureeSkills({
  repositoryRoot = REPOSITORY_ROOT,
  source,
  check = false,
} = {}) {
  repositoryRoot = path.resolve(repositoryRoot);
  const lock = await readJson(resolveRepositoryPath(repositoryRoot, LOCK_RELATIVE_PATH, "Lock path"));
  const renameMap = await readJson(
    resolveRepositoryPath(repositoryRoot, RENAME_MAP_RELATIVE_PATH, "Rename map path"),
  );
  validateLock(lock);
  validateRenameMap(renameMap);

  const resolvedSource = await resolveSource(lock, source);
  let outputs;
  try {
    outputs = await planOutputs({ lock, renameMap, sourceRoot: resolvedSource.sourceRoot });
  } finally {
    await resolvedSource.cleanup();
  }

  const readme = await readFile(
    resolveRepositoryPath(repositoryRoot, README_RELATIVE_PATH, "README path"),
    "utf8",
  );
  const unlisted = findUnlistedSkills(readme, lock);
  if (unlisted.length > 0) {
    throw new Error(
      `README.md does not link these locked skills: ${unlisted.join(", ")}. Add a row to the Available Skills table.`,
    );
  }

  const stale = [];
  for (const { destination, content } of outputs) {
    const target = resolveRepositoryPath(repositoryRoot, destination, `Destination ${destination}`);
    if (check) {
      let current = null;
      try {
        current = await readFile(target, "utf8");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (current !== content) stale.push(destination);
    } else {
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, content);
    }
  }

  if (stale.length > 0) {
    throw new Error(
      `Generated files are stale:\n${stale.map((file) => `- ${file}`).join("\n")}\nRun node scripts/materialize-spuree-skills.mjs.`,
    );
  }
  return { commit: lock.commit, skills: [...lock.skills], files: outputs.length };
}

export async function updatePin({ commit, source, repositoryRoot = REPOSITORY_ROOT }) {
  if (!SHA_PATTERN.test(commit ?? "")) {
    throw new Error("--pin requires a full lowercase 40-character SHA");
  }
  if (!source) throw new Error("--pin requires --source <SpureeSkills checkout>");
  const sourceRoot = path.resolve(source);
  await assertPinnedCommit(sourceRoot, commit);

  repositoryRoot = path.resolve(repositoryRoot);
  const lockPath = resolveRepositoryPath(repositoryRoot, LOCK_RELATIVE_PATH, "Lock path");
  const original = await readFile(lockPath, "utf8");
  const lock = JSON.parse(original);
  validateLock(lock);
  lock.commit = commit;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  try {
    return await materializeSpureeSkills({ repositoryRoot, source: sourceRoot });
  } catch (error) {
    await writeFile(lockPath, original);
    throw error;
  }
}

function parseArguments(argv) {
  const options = { check: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
    } else if (argument === "--source" || argument === "--pin") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (options.pin && options.check) throw new Error("--pin and --check cannot be combined");
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.pin) {
    const result = await updatePin({ commit: options.pin, source: options.source });
    console.log(`Pinned ${result.commit} and materialized ${result.files} files for ${result.skills.length} skills.`);
    return;
  }
  const result = await materializeSpureeSkills({ source: options.source, check: options.check });
  console.log(
    `${options.check ? "Verified" : "Materialized"} ${result.files} files for ${result.skills.length} skills from ${result.commit}.`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  await main();
}
