# Continuity Skills

Continuity provides an agent-friendly cloud storage via a simple Project → Folder → File hierarchy. Agents authenticate with an API key, then create projects, organize folders, and upload/download files — all through REST APIs designed for programmatic access.

These skills are structured API documentation for AI agent consumption. Each skill documents a specific API domain with endpoints, request/response schemas, and working examples.

## Installation

```bash
npx skills add https://github.com/StageContinuity/ContinuitySkills
```

To update to the latest version, run the same command again.

## Install by Continued feature

You do not need every skill. [features.json](features.json) declares independent feature groups:

| Feature | Skills | When to install |
| --- | --- | --- |
| `automation` | continued-automation | Let an agent produce tested Automation artifacts for Continued |
| `knowledge` | knowledge-base | Curate local work knowledge and prepare Folio KB assets |
| `folio-connection` | authentication, project-management | Optional: connect to Folio to publish/read cloud content |

For a selective macOS/Linux install from a checkout (Python 3.9+):

```bash
git clone https://github.com/StageContinuity/ContinuitySkills.git
cd ContinuitySkills
python3 scripts/install-feature.py automation
# Or: python3 scripts/install-feature.py knowledge
# Optional cloud access: python3 scripts/install-feature.py folio-connection
```

The feature installer installs the selected group for both Codex and Claude, using the same immutable local copy. Use `--agents codex` or `--agents claude` for one client and `--dry-run` to inspect changes. It never replaces unrelated skills; name conflicts are reported before any links change. Re-running updates only this selected feature. It does not log in, upload a KB, enable an automation or restart an agent. The local installer is POSIX-only; the existing skills CLI remains available for other platforms/clients.

Continued can offer these groups in Skills & MCP. App-bundled copies must record their source revision; this repository is canonical. Automation authoring currently requires the Continued build supporting schema v1, Python 3 and GitHub CLI for GitHub connectors. Local KB authoring does not need Continued or a cloud account.

## Getting Started

After installing or connecting Continuity, ask your agent:

> "How do I use Continuity skills?"

The **getting-started** skill explains the available public capabilities and
offers a guided, read-only first step. You can also ask “What can Continuity do?” or
“Walk me through Continuity.” The guide adapts to full skill/MCP clients and to
read-only web connectors that expose search and fetch. Studio also publishes
the same guide as the `getting_started` MCP tool for Claude Code on the web and
ChatGPT.

## Install Guide

Connect Claude Code, Claude Code Web & Cowork, ChatGPT, Codex, or OpenClaw — via the OAuth connector or skills + API keys. See [INSTALL.md](./INSTALL.md).

## Available Skills

| Skill | Description |
| --- | --- |
| [Automation authoring](continued-automation/SKILL.md) | Create, validate, preview and register draft Automation artifacts |
| [Knowledge Base](knowledge-base/SKILL.md) | Curate local work knowledge and publish/read versioned Folio KB assets |
| [Getting Started](./getting-started/SKILL.md) | Learn what Continuity can do and complete a safe guided first run |
| [Authentication](./authentication/SKILL.md) | Obtain JWT tokens, manage API keys |
| [Project Management](./project-management/SKILL.md) | Create, list, update, delete, and share projects; browse contents |
| [Folder Management](./folder-management/SKILL.md) | Find canonical folders in one bounded call, list recent folders, and create, update, delete, browse, or download folder content |
| [File Management](./file-management/SKILL.md) | Get, create, upload, update, and delete files with checksum-verified uploads (includes name search) |
| [File Comments](./file-comment/SKILL.md) | Add, list, resolve, update, and delete line-anchored review comments on files, with threaded replies and @mentions |
| [Project Invitations](./project-invitation/SKILL.md) | Manage sharing invitations for non-workspace members |

## Authentication

All skills use the V1 API. Two authentication methods are supported:

| Method | Header | Use case |
| --- | --- | --- |
| JWT token | `Authorization: Bearer <token>` | Interactive sessions (1 hour expiry, refreshable) |
| API key | `X-API-Key: <key>` | Automation and long-lived access |

See the [Authentication skill](./authentication/SKILL.md) for details on obtaining tokens and managing API keys.

## Contract checks and diagnostics

The folder-discovery contract is checked offline so documentation drift fails
before release. The guard pins exact endpoint headings, ordered query
parameters (types, required flags, defaults, enums, and bounds), canonical
context object shapes, response field names and types, closed response enums,
status codes, and bounded fallback behavior:

```bash
node scripts/check-folder-discovery-contract.mjs
node --test test/*.test.mjs
```

To diagnose duplicate public and plugin skill copies without changing or
deleting any installation, run the script from a checkout of this repository
and point `--target` at the project or agent workspace whose active catalog you
want to inspect:

```bash
node scripts/diagnose-continuity-skill-copies.mjs --target /path/to/project
node scripts/diagnose-continuity-skill-copies.mjs --target /path/to/project --json
```

When the checkout and target project differ, the checkout remains the immutable
source reference while `--target` controls project/workspace discovery. The
diagnostic scans all seven public skills across `.agents`, `.codex`, `.claude`,
OpenClaw workspace/global, Hermes global, and Codex plugin-cache roots. It
reports paths, SHA-256 hashes, catalog scan order, exposed names, and plugin
namespace/version metadata. Collision groups use the exposed skill name, so a
namespaced plugin such as `internal-continuity-skills:folder-management` is not
misreported as shadowing the public `folder-management` skill. If a cached
plugin manifest is missing or unreadable, the diagnostic assigns that cache
root a stable `unknown-plugin-<hash>` namespace instead of assuming the skill
is bare. Scan order is informational; the active client owns runtime
precedence.

## Continued plugins (release preparation)

`plugins/catalog.json` declares seven first-party packages: GitHub monitoring, Work knowledge, Folio connection, Diff Viewer, Code Viewer, JSON & CSV Viewer, and Review Rules. Skills are packaged from this repository rather than maintained in duplicate. Run `python3 scripts/build-plugins.py --output /tmp/continued-plugins --tag plugins-v0.1.0` from a clean checkout to produce deterministic ZIPs and `catalog.json`.

The plugin-packages workflow only uploads build artifacts for review. It has read-only repository permissions and does not publish a release. When a release is separately approved, attach the generated catalog and exact ZIPs together under the planned tag. Continued reads the latest release catalog and verifies archive size, SHA-256 and package identity before installation review. The catalog is trusted through the official GitHub repository over HTTPS; this is not an independent package-signing system. Local dirty builds require `--allow-dirty` and are marked as development builds.
