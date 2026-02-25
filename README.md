# Figma CLI

Read-only Figma tools for audits and implementation details.

## Install

```bash
npm install
npm run build
npm link
```

## Install as a skill

```bash
npx playbooks add skill iannuttall/figma-cli
```

The skill source is published at:

```text
skills/figma/SKILL.md
```

## Help

```bash
fig --help
fig <command> --help
```

## One-time auth

```bash
fig auth
source ~/.zshrc
```

## Quick command picker

- `fig export`: get a picture of the design.
- `fig text`: get copy you can actually copy/paste.
- `fig styles`: get CSS-like values (padding, radius, colors, font size).
- `fig inspect`: one-shot node inspection (dimensions + text + styles).
- `fig tree`: get hierarchy with child node IDs/types.
- `fig comments`: get feedback threads (now includes node text preview by default).
- `fig search`: find where text appears.
- `fig diff`: compare two nodes.
- `fig info`: file-level metadata only (`--page` supported, `--node-id` not supported).

## Comment -> implementation workflow

1. `fig comments <file-or-url> --unresolved`
2. Copy the node ID from a comment.
3. Run `fig inspect <file-or-url> --node-id <id>` for all key implementation data.
4. If needed, add visual export:
   `fig export <file-or-url> --node-ids <id> --format png --retina`

## Layout replication workflow

1. `fig tree <file-or-url> --node-id <frame-id> --depth 3`
2. `fig styles <file-or-url> --node-ids <child-id-1>,<child-id-2>,<child-id-3>`
3. `fig export <file-or-url> --node-ids <frame-id> --format png --retina`
4. Optional close-up: `fig export <file-or-url> --node-ids <frame-id> --format png --crop 0,0,800,120`

## Examples

```bash
# file-level overview
fig info <file-or-url>
fig info <file-or-url> --page "Schema Markup Generator"

# comments with node text preview (default)
fig comments <file-or-url> --unresolved
fig comments <file-or-url> --no-node-preview

# copy + CSS values
fig text <file-or-url> --node-id 2039-16736
fig styles <file-or-url> --node-id 2039-16736
fig styles <file-or-url> --node-ids 2039:16736,2039:6114
fig inspect <file-or-url> --node-id 2039-16736
fig tree <file-or-url> --node-id 2039:16700 --depth 3

# find and compare
fig search <file-or-url> --text "Shortened copy"
fig diff <file-or-url> --node-ids 2039:16736,2039:6114

# export with crop (png only)
fig export <file-or-url> --node-ids 2039:16700 --format png --crop 0,0,800,120
```

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
