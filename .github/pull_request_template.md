<!-- Guidelines: CONTRIBUTING.md#opening-a-pull-request -->

## Summary

<!-- The problem, and why this change is needed now. Link the ticket if there is one. -->

## What changed

<!-- A re-pin: the SpureeSkills pull request(s) and the new pinned SHA. A Continuity-only change: what an agent will do differently after reading the new text. -->

## Verification

- [ ] `node --test test/*.test.mjs`
- [ ] `node scripts/materialize-spuree-skills.mjs --check --source ../SpureeSkills`
- [ ] `node scripts/check-folder-discovery-contract.mjs`
- [ ] `git diff --check`

## Generated files

<!-- Did you edit a generated file by hand? If so, stop: the change belongs in SpureeSkills (see CONTRIBUTING.md#what-is-generated-and-what-is-owned-here). -->
