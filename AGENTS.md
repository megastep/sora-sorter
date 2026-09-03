# Repository Guidelines

## Project Structure & Module Organization

- `app.py` configures FastAPI routes, media streaming, and poster generation.
- `catalog_db.py` owns SQLite schema initialization, JSON imports, search, filtering, and editorial updates.
- `scripts/process_videos.py` is the optional video-analysis and deduplication pipeline.
- `frontend/src/` contains the React/TypeScript gallery. Keep reusable UI in `components/`, API calls in `api.ts`, shared catalog types in `catalog.ts`, and styling in `style.css` or `layout.css`.
- `DESIGN.md` is the UI source of truth. Update its token and component guidance whenever a shared visual rule changes; implement those rules in `frontend/src/theme.ts` rather than adding one-off component styles.
- Generated `frontend/dist/`, local `.env`, SQLite files, poster caches, media libraries, and analysis output are not source files and must remain uncommitted.

## Build, Test, and Development Commands

Use Python 3.11+, `uv`, Node.js, pnpm, and FFmpeg.

```sh
uv sync                              # install backend dependencies
pnpm --dir frontend install          # install frontend dependencies
pnpm --dir frontend dev              # run the Vite development server
pnpm --dir frontend build            # build the production frontend/dist bundle
uv run app.py                         # serve the built app on 127.0.0.1:8765
uv run python -m unittest discover -s tests -v  # run backend unit tests
pnpm --dir frontend test             # run frontend unit tests
```

Copy `.env.example` to `.env` and set `VIDEO_CATALOG_LIBRARY_ROOT` before starting the backend. Use a disposable library when exercising imports or video processing.

Before submitting frontend changes, run:

```sh
pnpm --dir frontend lint
pnpm --dir frontend format:check
pnpm --dir frontend exec tsc --noEmit
pnpm --dir frontend run doctor
pnpm --dir frontend test
pnpm --dir frontend run fallow
pnpm --dir frontend build
```

## Coding Style & Naming Conventions

Python uses four-space indentation, type hints, `snake_case` functions, and `PascalCase` classes. TypeScript is strict; use two-space indentation, single quotes, semicolons, `PascalCase` React components, and `camelCase` variables. Prettier enforces a 100-column width and trailing commas; ESLint enforces TypeScript and React Hooks rules. Run `pnpm --dir frontend format` to apply formatting.

## Design System

Follow [DESIGN.md](DESIGN.md) for colors, type, spacing, component states, and responsive behavior. Use MUI semantic palette values and component theme overrides first; reserve local `sx` styling for layout or media-specific behavior.

## Testing Guidelines

Backend tests live in `tests/` and use `unittest`; frontend `*.test.ts` files run with Vitest. Test observable API, import, update, and UI data behavior, not implementation details. For frontend changes, also manually verify loading, filtering, editing, and lightbox behavior as relevant. Fallow’s coverage-gap report identifies runtime-reachable TypeScript files that still need tests.

## Commit & Pull Request Guidelines

Recent commits use short, imperative subjects such as `Add gallery video lightbox`. Keep commits focused and exclude local media and configuration. Pull requests should explain user-visible behavior, identify configuration or migration effects, list validation commands, link related issues, and include screenshots or recordings for UI changes.

## Security & Configuration

Never commit `.env`, API keys, absolute media paths, or personal catalog data. Preserve path-containment checks and the localhost-only binding. Review generated analysis before treating it as editorial truth.

---

<!-- fallow:setup-hooks:start -->
## Fallow local gate

Before any `git commit` or `git push`, run `pnpm --dir frontend exec fallow audit --format json --quiet --explain --gate-marker agent`. If the verdict is `fail`, fix the reported findings before retrying. Treat JSON runtime errors like `{ "error": true, ... }` as non-blocking.

Audit defaults to `gate=new-only`: only findings introduced by the current changeset affect the verdict. Inherited findings on touched files are reported under `attribution` and annotated with `introduced: false`, but do not block the commit. Set `[audit] gate = "all"` in `fallow.toml` to gate every finding in changed files.

For non-skill agents, treat the task map below as the local onboarding source: run the listed fallow command before destructive edits, before commits, and before pull request handoff.

## Fallow task map

| When the agent is about to... | Run |
|---|---|
| delete an "unused" export or file | `pnpm --dir frontend exec fallow dead-code --trace <file>:<export>` |
| prove a TypeScript symbol's exact consumers before refactoring | `pnpm --dir frontend exec fallow dead-code --type-aware --symbol-impact <file>:<export-or-class.method>` |
| delete an "unused" dependency | `pnpm --dir frontend exec fallow dead-code --trace-dependency <name>` |
| commit or open a PR | `pnpm --dir frontend exec fallow audit --base <ref>` |
| prioritize refactoring | `pnpm --dir frontend exec fallow health --hotspots --targets` |
| ask who owns code | `pnpm --dir frontend exec fallow health --ownership` |
| check untested-but-reachable code | `pnpm --dir frontend exec fallow health --coverage-gaps` |
| consolidate duplication | `pnpm --dir frontend exec fallow dupes --trace dup:<fingerprint>` |
| find feature flags | `pnpm --dir frontend exec fallow flags` |
| check which architecture rules apply to a file before changing it | `pnpm --dir frontend exec fallow guard <files>` |
| surface security candidates | `pnpm --dir frontend exec fallow security` |
| understand a finding | `pnpm --dir frontend exec fallow explain <issue-type>` |
| scope a monorepo | `--workspace <glob> / --changed-workspaces <ref>` (global flags, prefix any command) |
<!-- fallow:setup-hooks:end -->
