# NugNotes

**ADHD-friendly study app** — write notes, upload documents and handwriting, and study with Nugget, your AI study cat.

NugNotes is a clean-break fork of ScribeCat-v3 with everything audio removed. See [NUGNOTES-SPEC.md](NUGNOTES-SPEC.md) for what it is and where it's headed.

## Stack

Vite + React + TypeScript on the front end, Convex for the backend and database, Clerk for auth, Cloudflare R2 for uploaded files, and Claude for the AI features. Notes are edited in [BlockNote](https://www.blocknotejs.org) (MPL-2.0), synced through Convex as Yjs documents (`src/editor/`, `convex/ydoc.ts`). The built app is served as static assets from Cloudflare Workers (`wrangler.jsonc`).

## Running locally

```bash
pnpm install
pnpm convex:dev   # Convex dev deployment (first run asks you to log in and pick a project)
pnpm dev          # Vite dev server
```

Copy `.env.example` to `.env.local` for the client variables. Server variables (Anthropic, Clerk issuer, R2, GitHub bug reports) are set in the Convex dashboard; `.env.example` lists them.

## Scripts

| Command | What it does |
|---------|--------------|
| `pnpm dev` | Vite dev server |
| `pnpm convex:dev` | Convex backend in dev mode |
| `pnpm build` | Production build into `dist/` |
| `pnpm compile` | Type-check only |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm lint` | Biome |

## License

AGPL-3.0 — see [LICENSE](../LICENSE). The notes editor, BlockNote, is MPL-2.0; the editor fonts in `assets/editor-fonts/` are OFL (licenses beside each file).
