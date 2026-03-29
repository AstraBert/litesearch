import { select, path, confirm, text, log } from "@clack/prompts";
import { ingest, retrieve } from "./pipelines";
import type { ResultWithScore } from "qdrant-edge-utils";
import { bold, gray, red, yellow } from "@visulima/colorize";

const SUPPORTED_FORMATS = [
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".webp",
  ".svg",
  ".doc",
  ".docx",
  ".docm",
  ".odt",
  ".rtf",
  ".ppt",
  ".pptx",
  ".pptm",
  ".odp",
  ".xls",
  ".xlsx",
  ".xlsm",
  ".ods",
  ".csv",
  ".tsv",
];

export async function runTui() {
  const action = await select({
    message: "What do you want to do?",
    options: [
      {
        value: "ingest",
        label: "Ingest",
        hint: "Parse, chunk, embed and store file data",
      },
      {
        value: "retrieve",
        label: "Retrieve",
        hint: "Retrieve relevant file parts based on a query",
      },
    ],
    maxItems: 2, // Maximum number of items to display at once
  });
  if (action === "ingest") {
    const selectedPath = await path({
      message: "Select a file to ingest:",
      root: process.cwd(), // Starting directory
      directory: false, // Set to true to only show directories
      validate: (p) => {
        if (p) {
          const ext = p.split(".").at(-1) ?? "";
          if (!SUPPORTED_FORMATS.includes("." + ext)) {
            return "File format not supported";
          }
        } else {
          return "You should specify a file path";
        }
      },
    });
    const filePath = selectedPath.toString();
    let conf: string | undefined = undefined;
    const hasConf = await confirm({
      message: "Do you want to specify the path for the LiteParse config file?",
    });
    if (hasConf) {
      const confPath = await path({
        message: "Select the path to the LiteParse config file:",
        root: process.cwd(), // Starting directory
        directory: false, // Set to true to only show directories
        validate: (p) => {
          if (!p) return "You should specify a file path";
        },
      });
      conf = confPath.toString();
    }
    let chunkSize: undefined | number = undefined;
    const hasChunk = await confirm({
      message: "Do you want to specify the chunk size for chunking?",
    });
    if (hasChunk) {
      const cSize = await text({
        message: "Chunk size:",
        placeholder: "512",
        validate: (value) => {
          if (!value) return "You should specify a chunk size";
          try {
            parseInt(value);
          } catch {
            return "Value should be a valid integer";
          }
          return undefined;
        },
      });
      chunkSize = parseInt(cSize.toString());
    }
    log.info("Starting to ingest the file...");
    try {
      await ingest(filePath, conf, chunkSize);
    } catch (e) {
      log.error(`An error occurred while ingesting the file: ${e}`);
      return;
    }
    log.success("Succesfully ingested the file!");
  } else {
    const q = await text({
      message: "Your query",
      validate: (value) => {
        if (!value) return "You should provide a query";
        return undefined;
      },
    });
    const query = q.toString();
    let filePaths: string[] | undefined = undefined;
    const hasFiles = await confirm({
      message:
        "Do you want to specify file paths to filter for in the retrieval?",
    });
    if (hasFiles) {
      const confPath = await text({
        message: "Provide a list of space-separated file paths:",
        validate: (p) => {
          if (!p) return "You should specify at least one file path";
        },
      });
      filePaths = confPath.toString().split(" ");
    }
    let limit: undefined | number = undefined;
    const hasLimit = await confirm({
      message:
        "Do you want to specify a limit for the maximum number of retrieved results?",
    });
    if (hasLimit) {
      const l = await text({
        message: "Limit:",
        placeholder: "10",
        validate: (value) => {
          if (!value) return "You should specify a limit";
          try {
            parseInt(value);
          } catch {
            return "Value should be a valid integer";
          }
          return undefined;
        },
      });
      limit = parseInt(l.toString());
    }
    let scoreThreshold: undefined | number = undefined;
    const hasThreshold = await confirm({
      message:
        "Do you want to specify a minimum score threshold for a retrieval result to be considered a relevant match?",
    });
    if (hasThreshold) {
      const t = await text({
        message: "Score threshold:",
        placeholder: "10",
        validate: (value) => {
          if (!value) return "You should specify a threshold";
          try {
            parseFloat(value);
          } catch {
            return "Value should be a valid float";
          }
          return undefined;
        },
      });
      scoreThreshold = parseFloat(t.toString());
    }
    log.info("Starting retrieval...");
    let results: ResultWithScore[] = [];
    try {
      results = await retrieve(query, filePaths, limit, scoreThreshold);
    } catch (e) {
      log.error(`An error occurred while ingesting the file: ${e}`);
      return;
    }
    if (results.length === 0) {
      log.error("No results found");
      return;
    }
    log.success("Succesfully completed retrieval!");
    for (const r of results) {
      console.log("\n\n");
      console.log(
        `[${bold(r.score.toFixed(4))}] ${bold(yellow(r.documentPath))}`,
      );
      console.log(r.content);
      console.log();
      console.log(bold(gray("------------------------")));
      console.log();
    }
  }
}
