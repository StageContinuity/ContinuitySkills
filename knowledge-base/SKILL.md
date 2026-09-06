---
name: knowledge-base
description: Build and maintain a local, source-backed work knowledge base, or publish/read it as a Folio knowledge_base asset. Use for recurring project knowledge, decisions and cross-session continuity, not live task status or automation scheduling.
---

# Work knowledge bases

Keep original artifacts as sources and curate reusable knowledge as Markdown articles. Organize by work or project, not by provider session; Codex and Claude should maintain the same corpus. Distinguish durable facts/decisions, project work rules and current task progress. Store enforceable work rules in project instructions; a KB does not guarantee that an agent will remember to look them up.

## Build locally

Use ordinary files:

```
work-knowledge/
  .source/<topic>/<stable-source-name>.md
  articles/index.md
  articles/<topic>/<subject>.md
  tree.json
```

Keep approved sources verbatim, with stable identities and dates. Include only user-selected project content and visible conversation excerpts; do not copy credentials, hidden reasoning or all session logs. Preserve source revisions when updating articles, and mark unresolved contradictions with attribution. Merge facts about the same subject rather than producing one summary per file. Update affected articles and both navigation indexes together.

An article can use this structure:

```markdown
# Test requirements

> Sources: [Project instructions](../../.source/development/project-instructions.md)

The checks required before submitting changes to this project.

## Required checks

Describe the actual commands, scope and exceptions from the source.
```

`tree.json` is a navigable table of contents, not a vector index:

```json
{"entity":{"name":"Project knowledge"},"tree":[{"name":"Development","children":[{"title":"Test requirements","path":"development/test-requirements.md"}]}]}
```

The home index links each article, e.g. `[Test requirements](development/test-requirements.md)`. Articles may link relative Markdown paths or use `[[Title]]` matching a tree title. Check that links, sources and the two indexes agree. Missing evidence must remain an explicit unknown; do not promote a previous progress message to verified completion.

Local authoring requires no Folio account or model-powered indexing service. Rebuild searchable local indexes separately; ordinary directory sync does not create a Folio KB asset.

## Publish to Folio

Only when the user requests cloud publishing, use the installed `authentication` skill and read [the API contract](references/api.md). Resolve a writable workspace from the user's selected destination; do not choose an arbitrary org or infer privacy from the name “Personal”. Create the KB asset, register sources/media, publish a version with an expected base version, then read back and verify it.

API publication changes the KB's current readable version. It does not make content public to everyone; visibility remains governed by Folio permissions. Sharing a KB can expose copied source material, so publish only content authorized for that destination. Keep the source-to-article mapping and returned asset/version identifiers with the local project.

## Read and continue work

Start with `articles/index.md` locally, or the Folio index as Markdown. Read only relevant articles, follow citations when evidence matters, and cite the material used. Compare recorded decisions with current files before acting. A missing source or version conflict is not permission to invent content or overwrite other changes.

Publishing, reading and available media support depend on the deployed API. On unsupported routes, show the capability mismatch and retain the local corpus; do not silently upload somewhere else.
