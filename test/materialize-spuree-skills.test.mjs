import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  applyRenameMap,
  findResidue,
  findUnlistedSkills,
  materializeSpureeSkills,
  planOutputs,
  validateLock,
  validateRenameMap,
} from "../scripts/materialize-spuree-skills.mjs";

const execFileAsync = promisify(execFile);
const REPOSITORY_ROOT = new URL("../", import.meta.url);
const renameMap = JSON.parse(await readFile(new URL("distribution/rename-map.json", REPOSITORY_ROOT), "utf8"));
const lock = JSON.parse(await readFile(new URL("distribution/spuree-skills.lock.json", REPOSITORY_ROOT), "utf8"));

test("the committed lock and rename map validate", () => {
  validateLock(lock);
  validateRenameMap(renameMap);
});

test("hosts are renamed before the bare brand word so no half-renamed host appears", () => {
  const renamed = applyRenameMap(
    "Sign in at https://studio.spuree.com/api-keys, call https://data.spuree.com/api/v1/projects, read spuree.com.",
    renameMap,
  );
  assert.equal(
    renamed,
    "Sign in at https://folio.stagecontinuity.com/api-keys, call https://data.stagecontinuity.com/api/v1/projects, read stagecontinuity.com.",
  );
});

test("regex-escaped hosts in the contract checker are renamed too", () => {
  const renamed = applyRenameMap(String.raw`/https:\/\/studio\.spuree\.com\/file\//`, renameMap);
  assert.equal(renamed, String.raw`/https:\/\/folio\.stagecontinuity\.com\/file\//`);
});

test("the web app is Folio, including the two-word product name", () => {
  assert.equal(
    applyRenameMap("made in Spuree Studio; open the Studio preview URL; Spuree projects", renameMap),
    "made in Folio; open the Folio preview URL; Continuity projects",
  );
});

test("environment variables, the repository and the lowercase brand are renamed", () => {
  assert.equal(
    applyRenameMap(
      "export SPUREE_API_KEY=x; npx skills add https://github.com/CheehooLabs/SpureeSkills; claude mcp login spuree",
      renameMap,
    ),
    "export CONTINUITY_API_KEY=x; npx skills add https://github.com/StageContinuity/ContinuitySkills; claude mcp login continuity",
  );
});

test("the spuree-agent machine marker is preserved for Studio's skill parser", () => {
  const block = "<!-- spuree-agent\nsurfaces: [\"claude\"]\n-->\nSpuree text";
  const renamed = applyRenameMap(block, renameMap);
  assert.equal(renamed, "<!-- spuree-agent\nsurfaces: [\"claude\"]\n-->\nContinuity text");
  assert.deepEqual(findResidue(renamed, renameMap), []);
});

test("renaming is idempotent on already-renamed text", () => {
  const once = applyRenameMap("Spuree at studio.spuree.com with $SPUREE_API_KEY in Studio", renameMap);
  assert.equal(applyRenameMap(once, renameMap), once);
});

test("residue detection names the line a brand token survives on", () => {
  const hits = findResidue("fine line\nstill says Spuree-Cloud here\nfolio.stagecontinuity.com", renameMap);
  assert.deepEqual(hits, ["2: still says Spuree-Cloud here"]);
});

test("every locked skill must be linked from the README", () => {
  const readme = lock.skills.map((skill) => `| [x](./${skill}/SKILL.md) |`).join("\n");
  assert.deepEqual(findUnlistedSkills(readme, lock), []);
  assert.deepEqual(findUnlistedSkills("", { skills: ["authentication"] }), ["authentication"]);
});

test("validateLock refuses a short SHA, a duplicate skill, and a file inside a skill directory", () => {
  const base = { ...lock, files: [...lock.files] };
  assert.throws(() => validateLock({ ...base, commit: "abc123" }), /40-character/);
  assert.throws(() => validateLock({ ...base, skills: ["a", "a"] }), /duplicate/);
  assert.throws(
    () => validateLock({ ...base, files: [{ from: "x.md", to: `${lock.skills[0]}/x.md` }] }),
    /writes into skill directory/,
  );
});

test("validateRenameMap refuses an identity replacement", () => {
  assert.throws(
    () => validateRenameMap({ ...renameMap, replacements: [{ from: "a", to: "a", reason: "r" }] }),
    /with itself/,
  );
});

async function gitIn(root, args) {
  await execFileAsync("git", ["-C", root, ...args]);
}

async function makeSourceRepository({ skillText, extraFiles = {} }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "continuity-skills-test-source-"));
  await gitIn(root, ["init", "--quiet", "--initial-branch=main"]);
  await gitIn(root, ["config", "user.email", "test@example.com"]);
  await gitIn(root, ["config", "user.name", "Test"]);
  await mkdir(path.join(root, "authentication"), { recursive: true });
  await writeFile(path.join(root, "authentication/SKILL.md"), skillText);
  for (const [file, content] of Object.entries(extraFiles)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), content);
  }
  await gitIn(root, ["add", "."]);
  await gitIn(root, ["commit", "--quiet", "-m", "source"]);
  const { stdout } = await execFileAsync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" });
  return { root, commit: stdout.trim() };
}

test("planOutputs reads the pinned commit, renames paths and content, and refuses residue", async () => {
  const source = await makeSourceRepository({
    skillText: "# Spuree\n\nUse $SPUREE_API_KEY at https://data.spuree.com/api.\n",
    extraFiles: { "scripts/diagnose-spuree-skill-copies.mjs": "// SpureeSkills helper\n" },
  });
  try {
    const testLock = {
      ...lock,
      commit: source.commit,
      skills: ["authentication"],
      files: [{ from: "scripts/diagnose-spuree-skill-copies.mjs", to: "scripts/diagnose-continuity-skill-copies.mjs" }],
    };
    const outputs = await planOutputs({ lock: testLock, renameMap, sourceRoot: source.root });
    assert.deepEqual(
      outputs.map(({ source: from, destination }) => [from, destination]),
      [
        ["authentication/SKILL.md", "authentication/SKILL.md"],
        ["scripts/diagnose-spuree-skill-copies.mjs", "scripts/diagnose-continuity-skill-copies.mjs"],
      ],
    );
    assert.equal(outputs[0].content, "# Continuity\n\nUse $CONTINUITY_API_KEY at https://data.stagecontinuity.com/api.\n");
    assert.equal(outputs[1].content, "// ContinuitySkills helper\n");

    const strictMap = { ...renameMap, replacements: renameMap.replacements.filter((rule) => rule.from !== "SPUREE_") };
    await assert.rejects(
      planOutputs({ lock: testLock, renameMap: strictMap, sourceRoot: source.root }),
      /authentication\/SKILL\.md: the rename left brand tokens behind[\s\S]*SPUREE_API_KEY/,
    );

    await assert.rejects(
      planOutputs({ lock: { ...testLock, commit: "0".repeat(40) }, renameMap, sourceRoot: source.root }),
      /does not contain commit 0{40}/,
    );
  } finally {
    await rm(source.root, { force: true, recursive: true });
  }
});

test("materializeSpureeSkills writes the outputs and --check reports stale files", async () => {
  const source = await makeSourceRepository({ skillText: "# Spuree\n" });
  const repositoryRoot = await mkdtemp(path.join(os.tmpdir(), "continuity-skills-test-repo-"));
  try {
    await mkdir(path.join(repositoryRoot, "distribution"), { recursive: true });
    const testLock = { ...lock, commit: source.commit, skills: ["authentication"], files: [] };
    await writeFile(path.join(repositoryRoot, "distribution/spuree-skills.lock.json"), JSON.stringify(testLock));
    await writeFile(path.join(repositoryRoot, "distribution/rename-map.json"), JSON.stringify(renameMap));
    await writeFile(path.join(repositoryRoot, "README.md"), "| [Authentication](./authentication/SKILL.md) |\n");

    await assert.rejects(
      materializeSpureeSkills({ repositoryRoot, source: source.root, check: true }),
      /stale:\n- authentication\/SKILL\.md/,
    );
    const written = await materializeSpureeSkills({ repositoryRoot, source: source.root });
    assert.equal(written.files, 1);
    assert.equal(await readFile(path.join(repositoryRoot, "authentication/SKILL.md"), "utf8"), "# Continuity\n");
    await materializeSpureeSkills({ repositoryRoot, source: source.root, check: true });

    await writeFile(path.join(repositoryRoot, "README.md"), "no table\n");
    await assert.rejects(
      materializeSpureeSkills({ repositoryRoot, source: source.root, check: true }),
      /README\.md does not link these locked skills: authentication/,
    );
  } finally {
    await rm(source.root, { force: true, recursive: true });
    await rm(repositoryRoot, { force: true, recursive: true });
  }
});
