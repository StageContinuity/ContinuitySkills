# Contributing to ContinuitySkills

Continuity is the new name of Spuree. The API behind these skills is the same
one documented in the public [SpureeSkills](https://github.com/CheehooLabs/SpureeSkills)
repository, which stays maintained for Spuree users. To keep the two from
drifting, **the shared skills in this repository are generated** from a pinned
SpureeSkills commit with the Continuity names substituted. Edit them there, then
re-pin here.

- [What is generated and what is owned here](#what-is-generated-and-what-is-owned-here)
- [Updating a shared skill](#updating-a-shared-skill)
- [The rename map](#the-rename-map)
- [Adding a Continuity-only skill](#adding-a-continuity-only-skill)
- [Local checks](#local-checks)
- [Opening a pull request](#opening-a-pull-request)

## What is generated and what is owned here

`distribution/spuree-skills.lock.json` is the list. Everything it names is
written by `scripts/materialize-spuree-skills.mjs` and must not be edited by
hand; CI regenerates it from the pinned commit and fails when the tree differs.

| Generated (edit in SpureeSkills, then re-pin) | Owned here (edit directly) |
| --- | --- |
| Every directory under `skills` in the lock — today `authentication`, `file-comment`, `file-management`, `first-post`, `folder-management`, `getting-started`, `project-invitation`, `project-management`, `workspace-management` — including `agents/openai.yaml` | `README.md` |
| `INSTALL.md` | `CONTRIBUTING.md` (this file) |
| `scripts/check-folder-discovery-contract.mjs` and `test/folder-discovery-contract.test.mjs` | `.github/workflows/pr-tests.yml` and `.github/pull_request_template.md` |
| `scripts/diagnose-continuity-skill-copies.mjs` and `test/diagnose-continuity-skill-copies.test.mjs` (renamed from `…-spuree-…` on the way) | `distribution/spuree-skills.lock.json`, `distribution/rename-map.json` |
| `test/workflow-pins.test.mjs` | `scripts/materialize-spuree-skills.mjs` and `test/materialize-spuree-skills.test.mjs` |

A pull request that changes a generated file by hand will fail the
`Verify the shared skills match the pinned SpureeSkills commit` step. Make the
change in SpureeSkills instead; its [CONTRIBUTING.md](https://github.com/CheehooLabs/SpureeSkills/blob/main/CONTRIBUTING.md)
explains the structure, the contract checker and the review rules, and all of
it applies to the text that lands here.

## Updating a shared skill

1. **Change SpureeSkills** and wait for the pull request to merge.
2. **Pick the commit on `main`** that contains it (the merge commit, never a
   branch head, so the pin stays reachable):

   ```bash
   git -C ../SpureeSkills fetch origin
   git -C ../SpureeSkills rev-parse origin/main
   ```

3. **Re-pin here** on a new branch, with SpureeSkills cloned next to this
   checkout:

   ```bash
   node scripts/materialize-spuree-skills.mjs --pin <full-40-character-sha> --source ../SpureeSkills
   ```

   This rewrites the lock and every generated file in one step. If the run fails
   with `the rename left brand tokens behind`, SpureeSkills introduced a spelling
   the rename map does not cover; see [The rename map](#the-rename-map).

4. **If SpureeSkills added, renamed or removed a skill**, update `skills` in the
   lock and the **Available Skills** table in `README.md` (the check fails until
   every locked skill is linked there). A new shared non-skill file goes under
   `files` in the lock with its destination path.

5. **Run the local checks** and open a pull request whose description links the
   SpureeSkills pull request and states the pinned SHA.

Without `--source` the script clones the pinned repository into a temporary
directory, which is how CI runs it.

## The rename map

`distribution/rename-map.json` is an **ordered** list of literal replacements.
Order matters: hosts (`studio.spuree.com` → `folio.stagecontinuity.com`,
`data.spuree.com` → `data.stagecontinuity.com`) and the repository slug run
before the bare brand words (`Spuree` → `Continuity`, `spuree` → `continuity`),
and `Studio` → `Folio` runs last so no host is half-renamed. Regex-escaped hosts
in the contract checker have their own rules.

Two lists guard the result:

- `preserve` — tokens that must keep their Spuree spelling because a program
  reads them. Today that is `spuree-agent`, the HTML-comment marker Studio's
  MCP skill parser matches on.
- `residue` — tokens that must not appear in any generated file. The script
  refuses to write when one survives, and names the file and line. Fix it by
  adding a rule (or a `preserve` entry when the token is a machine marker), not
  by editing the output.

When you add a rule, add a case to `test/materialize-spuree-skills.test.mjs`
that shows the old text and the renamed text.

## Adding a Continuity-only skill

A skill that exists only for Continuity (not part of the shared API surface)
lives in its own top-level directory, is **not** listed in the lock, and is
edited here directly. Add it to the **Available Skills** table in `README.md`.
Do not add it to `SKILL_FILES` in `scripts/check-folder-discovery-contract.mjs`:
that file is generated and the next re-pin would drop the entry. If the skill
needs URL-format checks, add a small Continuity-owned checker under `scripts/`
and call it from the workflow.

Before adding one, consider whether it belongs in SpureeSkills instead: if the
endpoints it documents also exist for Spuree users, it is a shared skill.

## Local checks

Use Node.js 22 (CI uses 22.23.2). From the repository root, with SpureeSkills
cloned next to this checkout:

```bash
node --test test/*.test.mjs
node scripts/materialize-spuree-skills.mjs --check --source ../SpureeSkills
node scripts/check-folder-discovery-contract.mjs
git diff --check
```

CI runs the first three on every pull request. `test/workflow-pins.test.mjs`
asserts the exact action SHAs and Node version in `.github/workflows/`; it is
generated from SpureeSkills, so keep this repository's workflow on the same
pinned actions.

## Opening a pull request

**Branch.** Branch from an up-to-date `main`; never push to `main` directly.
Name the branch `<your-handle>/<ticket>-<short-description>` when there is a
ticket, or `<your-handle>/<short-description>` otherwise.

**Scope.** One concern per pull request: a re-pin, or one Continuity-only
change.

**Title.** Conventional Commits with the skill or `distribution` as the scope,
for example `chore(distribution): re-pin SpureeSkills to 71dd442 (ENG-7938)` or
`feat(continued-automation): add the automation skill`.

**Description.** The template asks for the summary, what changed (for a re-pin:
the SpureeSkills pull requests and the new SHA), the verification commands you
ran, and a confirmation that no generated file was edited by hand.

**Review.** A maintainer must approve before merging. Reply to every review
comment, whether you changed something or not.
