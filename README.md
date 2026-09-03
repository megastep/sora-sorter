# Sora Sorter

Local, SQLite-backed browser for Sora video metadata. The application source is
kept separate from the video library and never stores absolute media paths in
the catalog.

## Setup

```sh
cd ~/src/sora-sorter
pnpm --dir frontend install
pnpm --dir frontend build
uv run app.py --library-root /path/to/sora-library
```

The server listens only on `http://127.0.0.1:8765` by default. It imports the
analysis JSON on startup and serves the built frontend.

## Configuration

`--library-root` identifies the directory with the videos. The following
optional arguments separate mutable data from the library when desired:

```sh
uv run app.py \
  --library-root /path/to/sora-library \
  --database /path/to/catalog.sqlite \
  --json-directory /path/to/video_catalog_json \
  --poster-directory /path/to/poster-cache \
  --port 8765
```

The equivalent environment variables are `VIDEO_CATALOG_LIBRARY_ROOT`,
`VIDEO_CATALOG_DATABASE_PATH`, `VIDEO_CATALOG_JSON_DIRECTORY`,
`VIDEO_CATALOG_POSTER_DIRECTORY`, and `VIDEO_CATALOG_PORT`.

If optional paths are omitted, the database, JSON directory, and poster cache
default to `catalog.sqlite`, `video_catalog_json`, and `.catalog_posters`
inside the library root.
