# litesearch

A fully-local semantic search CLI. Ingest documents, embed them locally, and run vector search — no external services required.

## How it works

`litesearch ingest` runs a document through a four-stage pipeline:

1. **Parse**: extracts plain text from the file using [LiteParse](https://github.com/run-llama/liteparse)
2. **Chunk**: splits the text into overlapping segments using [Chonkie](https://github.com/chonkie-ai/chonkie) (default: 512 characters)
3. **Embed**: generates 768-dimensional embeddings locally using [`nomic-ai/nomic-embed-text-v1.5`](https://huggingface.co/nomic-ai/nomic-embed-text-v1.5) via `@huggingface/transformers`
4. **Store**: upserts vectors and payloads into a local [Qdrant Edge](https://github.com/qdrant/qdrant-edge) shard persisted at `.litesearch.qdrant/`

`litesearch retrieve` embeds the query with the same model and performs a cosine similarity search against the local shard.

The vector store is backed by `qdrant-edge-utils`, a Rust native addon (napi-rs) that wraps `qdrant-edge` for on-disk mmap-backed storage.

## Requirements

- [Bun](https://bun.sh)
- Rust toolchain (only needed if rebuilding `qdrant-edge-utils` from source)

## Installation

```sh
bun install
```

## Usage

### Ingest a document

```sh
bun run ingest <file> [options]
```

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Path to a LiteParse config file |
| `-s, --chunk-size <number>` | Chunk size in characters (default: 512) |

### Search

```sh
bun run retrieve <query> [options]
```

| Option | Description |
|--------|-------------|
| `-f, --files <paths...>` | Restrict search to specific ingested document paths |
| `-l, --limit <number>` | Maximum number of results (default: 10) |
| `-t, --score-threshold <number>` | Minimum cosine similarity score |

### Example

```sh
bun run ingest ./data/report.pdf
bun run retrieve "quarterly revenue breakdown" --limit 5
```

Output:

```
[0.8723] ./data/report.pdf
Revenue for Q3 reached $4.2M, up 18% from the prior quarter...

[0.8341] ./data/report.pdf
The board approved a revised forecast of $17M for the full fiscal year...
```

## Project structure

```
src/
  index.ts       # CLI entry point (commander)
  pipelines.ts   # ingest and retrieve orchestration
  parsing.ts     # document parsing via LiteParse
  chunk.ts       # text chunking via Chonkie
  embed.ts       # local embedding via transformers.js
  store.ts       # vector upsert and search

packages/
  qdrant-edge-utils/
    src/lib.rs   # Rust native addon wrapping qdrant-edge
```

## Vector store

The local shard is stored in `.litesearch.qdrant/` in the working directory. This directory is created automatically on first ingest. To reset the store, delete this directory.

## Development

```sh
bun run lint
bun run format
```
