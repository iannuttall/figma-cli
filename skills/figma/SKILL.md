---
name: figma
description: Read-only Figma REST API workflows for file inspection, audits, token extraction, typography analysis, component listing, asset export, comment retrieval, text extraction, text search, node style inspection, node diffing, and combined node inspection. Use when a user provides a Figma file key or URL and needs implementation-facing design data without opening Figma manually.
---

# Figma CLI

Use the local `fig` command for fast Figma analysis and exports.

Assume `fig` is already installed and authenticated.

If a command fails with `FIGMA_TOKEN is not configured`, tell the user to run:

```bash
fig auth
source ~/.zshrc
```

Then retry the original `fig ...` command.

## Use URL or file key directly

Every command accepts either:
- file key: `5264IJYvl05aFGo7uC5X7G`
- full URL: `https://www.figma.com/design/5264IJYvl05aFGo7uC5X7G/...`

## Help pattern

```bash
fig --help
fig <command> --help
```

Use help first when you're unsure about flags on a specific command.

## Fast command picker

- Need a screenshot: `fig export`
- Need copy text: `fig text`
- Need CSS-like values: `fig styles`
- Need one-shot implementation details: `fig inspect`
- Need hierarchy/tree: `fig tree`
- Need feedback threads: `fig comments`
- Need to find where text appears: `fig search`
- Need to compare before/after nodes: `fig diff`
- Need file-level metadata/pages: `fig info` (no `--node-id`)
- Need design-system health checks: `fig audit`
- Need typography inventory: `fig typography`
- Need design tokens: `fig tokens`
- Need component inventory: `fig components`
- Need quick summary: `fig quick`

## Most useful workflows

### 1) Comments -> implementation

```bash
fig comments <file-or-url> --unresolved
fig inspect <file-or-url> --node-id <node-id-from-comment>
fig export <file-or-url> --node-ids <same-node-id> --format png --retina
```

Why: `comments` gives feedback, `inspect` gives code-ready details, `export` gives visual confirmation.

### 2) Copy change only

```bash
fig text <file-or-url> --node-id <node-id>
```

Why: this is copy/pasteable text. PNG export is not.

### 3) Exact spacing, padding, radius, colors for one element

```bash
fig styles <file-or-url> --node-id 2039-16736
```

### 3b) Exact spacing/colors for multiple elements at once

```bash
fig styles <file-or-url> --node-ids 2039:16736,2039:6114,2039:6200
```

### 4) Find all nodes containing phrase, then inspect one

```bash
fig search <file-or-url> --text "Shortened copy"
fig inspect <file-or-url> --node-id <match-node-id>
```

### 5) Compare two versions of a node

```bash
fig diff <file-or-url> --node-ids 2039:16736,2039:6114
```

### 6) Layout replication (hierarchy -> styles -> export)

```bash
fig tree <file-or-url> --node-id 2039-16700 --depth 3
fig styles <file-or-url> --node-ids 2039:16701,2039:16702,2039:16703
fig export <file-or-url> --node-ids 2039:16700 --format png --retina
```

Optional close-up crop:

```bash
fig export <file-or-url> --node-ids 2039:16700 --format png --crop 0,0,800,120
```

## Scope rules (important)

- `--node-id` works on: `audit`, `typography`, `comments`, `text`, `search`, `styles`, `inspect`, `tree`
- `--node-ids` works on: `export`, `diff`, `styles`
- `--page` works on: `info`, `audit`, `comments`, `text`, `search`, `components`, `tree`
- `fig info` does not support `--node-id`
- For `text` and `search`, use `--node-id` or `--page`, not both
- `--page` does not work on: `styles`, `inspect`, `export`, `diff`, `tokens`, `typography`
- `--crop` works only on `export` with `--format png`

## Node ID format tips

- Both formats are accepted: `2005-5651` and `2005:5651`
- `diff` needs two IDs separated by comma:
  `--node-ids 2005:5651,2005:6000`

## JSON-friendly examples

```bash
fig comments <file-or-url> --unresolved --format json
fig inspect <file-or-url> --node-id 2039-16736 --format json
fig styles <file-or-url> --node-id 2039-16736 --format json
fig styles <file-or-url> --node-ids 2039:16736,2039:6114 --format json
fig tree <file-or-url> --node-id 2039:16700 --depth 3 --format json
fig diff <file-or-url> --node-ids 2039:16736,2039:6114 --format json
```

## Common errors and what to do

- `FIGMA_TOKEN is not configured`:
  run `fig auth` then `source ~/.zshrc`, then retry.
- `Node <id> not found`:
  confirm the node ID from `fig comments`, `fig search`, or Figma inspect panel.
- `unknown option --node-id` on `fig info`:
  expected; `info` is file/page level only.

## Node discovery fallback

- Preferred: `fig tree <file-or-url> --node-id <id> --depth 3`
- If tree output is unavailable, node IDs are often near each other.
  Example fallback pattern:
  `fig inspect <file-or-url> --node-id 2070:20929`
  then try `2070:20930`, `2070:20931`, etc.

## `fig info --page` behavior

- `fig info <file-or-url> --page "<name>"` now lists top-level items on that page with IDs and types, not just count.

## `fig styles` sample output

```css
.figma-node-2039-16736 {
  width: 160px;
  height: 48px;
  padding: 12px 20px 12px 20px;
  border-radius: 8px;
  background-color: #0d6efd;
  font-size: 16px;
}
```
