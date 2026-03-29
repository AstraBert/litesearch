import { Command } from "commander";
import { ingest, retrieve } from "./pipelines";
import { bold, gray, red, yellow } from "@visulima/colorize";
import { runTui } from "./tui";

const program = new Command();

program
  .name("litesearch")
  .description("Local semantic search CLI")
  .version("0.1.0");

program
  .command("ingest <file>")
  .description("Parse, chunk, embed, and store a document")
  .option("-c, --config <path>", "path to liteparse config file")
  .option("-s, --chunk-size <number>", "chunk size in characters", parseInt)
  .action(
    async (file: string, opts: { config?: string; chunkSize?: number }) => {
      await ingest(file, opts.config, opts.chunkSize);
      console.log(`Ingested: ${file}`);
    },
  );

program
  .command("retrieve <query>")
  .description("Search the store for chunks matching a query")
  .option(
    "-f, --files <paths...>",
    "restrict search to specific document paths (provide as space-separated strings",
  )
  .option("-l, --limit <number>", "maximum number of results", parseInt)
  .option(
    "-t, --score-threshold <number>",
    "minimum score threshold",
    parseFloat,
  )
  .action(
    async (
      query: string,
      opts: { files?: string[]; limit?: number; scoreThreshold?: number },
    ) => {
      const results = await retrieve(
        query,
        opts.files,
        opts.limit,
        opts.scoreThreshold,
      );
      if (results.length === 0) {
        console.log(bold(red("No results found.")));
        return;
      }
      for (const r of results) {
        console.log(
          `[${bold(r.score.toFixed(4))}] ${bold(yellow(r.documentPath))}`,
        );
        console.log(r.content);
        console.log();
        console.log(bold(gray("------------------------")));
        console.log();
      }
    },
  );

program
  .command("tui")
  .description(
    "Launch a TUI to interactively access the ingestion and retrieval functionalities.",
  )
  .action(async () => {
    await runTui();
  });

program.parseAsync();
