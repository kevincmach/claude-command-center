# Claude Command Center

A LAN-served virtual office for your live Claude Code sessions. See every running
session grouped by project — status, model, context %, and cost — on your phone,
and auto-log everything to an Obsidian-ready markdown vault.

> **Tier 0** (this release): the live board + the vault. The animated pixel office,
> phone control, and analytics arrive in later tiers — see
> `docs/superpowers/specs/`.

## Quick start

```bash
npx claude-command-center          # localhost only
npx claude-command-center --lan    # share on your Wi-Fi (trusted networks only)
```

Then open the printed URL. In `--lan` mode, open `http://<your-computer-ip>:4317`
on your phone (same Wi-Fi).

## Options

| Flag | Default | Meaning |
| --- | --- | --- |
| `--lan` | off | Bind to `0.0.0.0` so other devices on your network can connect |
| `--host <ip>` | `127.0.0.1` | Explicit bind address |
| `--port <n>` | `4317` | Port to listen on |
| `--vault <path>` | `~/ClaudeVault` | Where the Obsidian markdown vault is written |
| `--claude-home <path>` | `~/.claude` | Override the Claude Code data directory |
| `--log-content` | off | Also log prompt/response text (metadata only by default) |

## What it reads

- `~/.claude/sessions/*.json` — the live registry (pid, cwd, status, model…)
- `~/.claude/projects/<encoded-cwd>/<sessionId>.jsonl` — transcripts (title,
  current tool/activity, context tokens, cost)

It is **read-only**. Nothing is sent anywhere; the dashboard lives entirely on
your machine and network.

## The vault

```
~/ClaudeVault/
├── Daily/2026-06-03.md     # chronological timeline of session events
├── Projects/<name>.md      # per-project rollup, links to its sessions
└── Sessions/<id>.md        # one page per session, with a timeline
```

Files use YAML frontmatter and `[[wikilinks]]`, so they open directly as an
Obsidian vault. Point Obsidian at the folder (or use `--vault` to write inside an
existing vault).

## Security

LAN mode exposes session **metadata** (project names, status, titles, token
counts) to anyone on your network. Use it on trusted networks only. Token-based
auth and the ability to *act* on sessions arrive in Tier 3.

## Develop

```bash
npm install
npm run dev    # backend (tsx) + Vite dev server together
npm test       # node:test suite
npm run build  # compile backend to dist/ + bundle frontend to dist/public/
```

**Stack:** TypeScript · Node + Express · React + Vite · SSE · `node:test`.
