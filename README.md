# Sora Sorter

Sora Sorter is a local, SQLite-backed catalog for a library of analyzed video
clips. It turns one JSON analysis record per clip into a fast, editable gallery
for finding clips, reviewing them, and preparing selections for later edits or
publishing.

It is designed for a personal media library: the app listens only on localhost,
has no accounts, and keeps its source code separate from the video files.

## What it does

- Imports per-video JSON analysis records into SQLite without modifying the
  source JSON files.
- Searches effective title, summary, keywords, visible text, and transcript.
  Search terms are prefix matches, so `centi` can find `centipede`.
- Filters clips by language, orientation, speech, review status, favorite,
  publishable status, and content flag.
- Sorts by import time, title in either direction, duration, or language.
- Streams clips safely from the configured library root and lazily creates
  poster frames with FFmpeg.
- Lets you edit descriptions, transcripts, keywords, flags, likeness/reference
  evidence, review state, rating, favorites, publishability, and notes.
- Preserves editorial edits as SQLite overrides when you re-import the original
  analysis JSON.

## How it works

The analyzer that produced the JSON remains the source of imported facts. Sora
Sorter stores each raw payload in SQLite, normalizes fields for filtering and
search, and stores human corrections separately. This means re-importing picks
up improved analysis without replacing your review work.

```text
Video library
├── video files
├── video_catalog_json/     analysis JSON, one record per clip
├── catalog.sqlite          imported catalog and editorial overrides
└── .catalog_posters/       generated on demand; safe to regenerate

Sora Sorter repository
├── app.py                  local FastAPI server and configuration
├── catalog_db.py           SQLite importer, search, and metadata updates
└── frontend/               React + Vite gallery
```

The default database and poster cache live in the library root so the app can
move independently of the media library. You may place them elsewhere with
configuration options below.

## Requirements

- Python 3.11 or newer
- [uv](https://docs.astral.sh/uv/), for the local Python environment
- Node.js and [pnpm](https://pnpm.io/), for the React frontend
- [FFmpeg](https://ffmpeg.org/), to generate poster frames the first time each
  clip is displayed

The app has been developed for a local macOS workflow, but it uses standard
Python, SQLite, and Node tooling.

## Quick start

1. Clone the repository and install frontend dependencies.

   ```sh
   git clone <repository-url> sora-sorter
   cd sora-sorter
   pnpm --dir frontend install
   pnpm --dir frontend build
   ```

2. Create your local configuration.

   ```sh
   cp .env.example .env
   ```

3. Set the location of the directory that holds your video files and analysis
   JSON in `.env`.

   ```dotenv
   VIDEO_CATALOG_LIBRARY_ROOT=/path/to/sora-library
   ```

4. Start the catalog.

   ```sh
   uv run app.py
   ```

5. Open [http://127.0.0.1:8765](http://127.0.0.1:8765) in a browser.

On startup, the server re-imports JSON files from
`video_catalog_json/`. Later, use **Import / Reimport** in the app whenever
new analysis records arrive.

## Configuration

`.env` is local and gitignored. It is loaded automatically when the server
starts; variables explicitly supplied by your shell take precedence.

| Setting                          | Default                             | Purpose                                       |
| -------------------------------- | ----------------------------------- | --------------------------------------------- |
| `VIDEO_CATALOG_LIBRARY_ROOT`     | Required                            | Root directory that contains the media files. |
| `VIDEO_CATALOG_DATABASE_PATH`    | `<library-root>/catalog.sqlite`     | SQLite catalog and editorial overrides.       |
| `VIDEO_CATALOG_JSON_DIRECTORY`   | `<library-root>/video_catalog_json` | Analysis JSON to import.                      |
| `VIDEO_CATALOG_POSTER_DIRECTORY` | `<library-root>/.catalog_posters`   | Lazily generated JPEG poster cache.           |
| `VIDEO_CATALOG_PORT`             | `8765`                              | Localhost port.                               |

Every setting also has a command-line equivalent. Command-line values take
precedence over `.env`:

```sh
uv run app.py \
  --library-root /path/to/sora-library \
  --database /path/to/catalog.sqlite \
  --json-directory /path/to/video_catalog_json \
  --poster-directory /path/to/poster-cache \
  --port 8765
```

Use `uv run app.py --help` for the complete argument reference.

## Using the catalog

### Find clips

Use the search field for titles, summaries, keywords, on-screen text, and
transcript text. Combine it with the filter rail to narrow results, then choose
a sort order in the header. The gallery loads additional clips as you scroll.

### Review and correct metadata

Select a clip to open the inspector. Its editable metadata is intentionally
separate from the read-only technical facts, checksum, and media path.

- Enter one keyword, content flag, or visible-text item per line.
- Likeness/reference evidence has separate name, confidence, and rationale
  fields; it does not require editing JSON.
- Set a review state (`unreviewed`, `shortlisted`, `approved`, or `rejected`),
  rating, favorite, publishable status, and notes as you make editorial
  decisions.
- Choose **Save changes** to write the edits. A checkmark confirms the save.

### Re-import analysis

Use **Import / Reimport** after adding new JSON records or rerunning analysis.
The import is idempotent: one record is kept per SHA-256 ID, imported data is
refreshed, and saved descriptive/editorial overrides remain in place.

## Data and privacy

- The server binds to `127.0.0.1` only; it is not exposed to your local network
  by default.
- Video paths stored in the catalog are relative to the configured library
  root. The media endpoint rejects paths outside that root.
- Original per-video JSON is treated as the immutable analysis source. The app
  writes its working catalog and your edits to SQLite instead.
- Poster images are a cache. Delete the configured poster directory if you need
  to regenerate them.
- Back up `catalog.sqlite` if you want to preserve human edits independently of
  your video library backup.

## Development

The server serves the built Vite bundle from `frontend/dist`. After changing
frontend code, rebuild it and refresh the browser:

```sh
pnpm --dir frontend build
```

Useful checks:

```sh
cd frontend
pnpm run doctor
pnpm lint
pnpm format:check
pnpm exec tsc --noEmit
pnpm build
```

`pnpm run doctor` is the React Doctor quality gate. It must report no findings
before a change is merged. Use `run` deliberately: `pnpm doctor` invokes
pnpm's unrelated built-in diagnostic command.

To apply the repository’s formatting rules:

```sh
pnpm --dir frontend format
```

## Troubleshooting

| Symptom                                    | What to check                                                                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The server says a library root is required | Copy `.env.example` to `.env` and set `VIDEO_CATALOG_LIBRARY_ROOT`, or pass `--library-root`.                                                                               |
| No clips appear                            | Confirm that the configured JSON directory exists and contains the per-video `.json` records. `deduplication.json` and AppleDouble (`._*`) files are intentionally skipped. |
| A video is unavailable                     | Its saved relative path no longer resolves inside the library root. Restore the file or re-import analysis after updating the library.                                      |
| Poster generation fails                    | Install FFmpeg and make sure the video is readable. The catalog itself remains usable without a poster.                                                                     |
| Port 8765 is already in use                | Start with `uv run app.py --port 8766`, then open the matching localhost URL.                                                                                               |

## Scope

Sora Sorter is a single-user, local workflow tool. It does not provide hosted
storage, user authentication, remote sharing, or automated video analysis.
Use the analyzer that produces your per-video JSON records before importing
them here.
