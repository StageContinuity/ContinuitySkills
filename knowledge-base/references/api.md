# Folio KB API

Use the public Continuity environment configured by the authentication skill. The production data base is `https://data.stagecontinuity.com/api`; examples use `BASE` for that complete base and authenticate with `X-API-Key: $CONTINUITY_API_KEY` or an authorized bearer token. Never print tokens or copy authentication state into the KB bundle. Explicit non-production environments must use matching account and service configuration; do not change environments implicitly after a failure.

These shapes describe the KB route contract reviewed for this skill. A source review is not a live deployment test. Check API errors/capabilities before relying on newer fields.

## Create and locate

`POST BASE/v1/assets` with `{ "workspaceId": "…", "entityType": "knowledge_base", "name": "…", "description": "…" }` creates a KB asset. Use the returned `id` as KB_ID. The workspace must be writable under the caller's membership; creating a project folder with tree.json is not equivalent. New KBs have no readable published content until the first publish. Use project-management to resolve the destination if necessary.

## Sources and images

`POST BASE/v1/assets/KB_ID/knowledge_base/sources` takes multipart `sourcePath` and either raw `file` bytes or an accessible existing `fileId`. It returns `fileId`, `sourcePath`, `citePath`. Cite the returned `.source/…` path relative to the article in a leading blockquote immediately after the H1. A direct `/api/v1/files/…` URL is not the authoring form for source attribution. Reusing a taken sourcePath conflicts; use source revision identities, not blind retries with a new random name.

`POST BASE/v1/assets/KB_ID/knowledge_base/media` supports inline raster images via multipart `mediaPath` plus `file` or `fileId`, returning a `.media/…` citePath. Use that returned reference in Markdown. Supported types are PNG/JPEG/GIF/WebP, not SVG; the reviewed limit is 25 MiB. Source uploads have a separate reviewed 32 MiB limit. Both remain subject to workspace storage limits. `$asset-<id>` can reference a reusable existing asset instead.

The Markdown publish body does not upload arbitrary bundled binary files. Sources/media are separately stored, not automatically immutable with every article version; record content hashes and handle deleted/unavailable sources explicitly.

## Publish

`POST BASE/v1/assets/KB_ID/knowledge_base/publish`:

```json
{
  "expectedBaseVersion": null,
  "bump": "patch",
  "tree": {"entity":{"name":"Project knowledge"},"tree":[{"name":"Development","children":[{"title":"Test requirements","path":"development/test-requirements.md"}]}]},
  "index": "# Project knowledge\n\n[Tests](development/test-requirements.md)",
  "articles": [{"path":"development/test-requirements.md","md":"# Test requirements\n\n…"}]
}
```

Use null for the first base; later bases and returned `version` are semantic-version strings. The reviewed API accepts changed/new articles as an overlay, carries unchanged pages forward and uses the full tree as the manifest. Omitting a page from the tree removes it from the new version. First publication must provide all articles. Supplying all articles remains a valid conservative strategy.

A stale base returns 409: read the current version, reconcile competing changes, and rebuild before resubmitting. Merely changing expectedBaseVersion on an old payload can overwrite work. Do not mistake a lock-related 409 for a content conflict; inspect the structured response. Validation errors block publication; warnings should be shown and addressed rather than described as “all checks passed”. The reviewed aggregate publish bound is 16 MiB; do not infer limits solely from document count.

A successful response includes a semantic `version`, `articleCount` and `warnings`. Publication switches the current readable version. It is not an embeddings/indexing completion receipt, and it is not a public-share operation. Specialized staged-draft workflows are outside this skill's initial authoring flow; direct publish must not be presented as “only save draft”.

## Read and verify

All reads use `GET BASE/v1/assets/KB_ID/knowledge_base`:

| Query | Meaning |
| --- | --- |
| none | Navigation tree and current version metadata |
| `format=md` | Home index as Markdown |
| `path=development/test-requirements.md&format=md` | Verbatim article Markdown |
| `path=development/test-requirements.md` | UI page JSON with resolved links/citations |
| `path=.source/<relative-path>` | Redirect to source bytes; honor authentication/redirect boundaries |
| `path=.media/<relative-path>` | Redirect to inline image |
| `format=full&offset=0&limit=10` | Bounded page slice on deployments supporting this option |

Read the index, each changed article and required source references after publishing. A 401 requires authentication repair; 403 is a scope/permission issue; 404 can mean not-yet-built, missing content or unsupported capability. Preserve the local corpus and report the exact failure category without leaking credentials.
