import { embed, embedQuery } from "./embed";
import { parse } from "./parsing";
import { chunk } from "./chunk";
import { storeEmbeddings, searchStore } from "./store";

export async function ingest(
  filePath: string,
  liteparseConfigPath: string | undefined,
  chunkSize: number | undefined,
) {
  const parsed = await parse({ filePath, configFile: liteparseConfigPath });
  const payloads = await chunk({ text: parsed, path: filePath, chunkSize });
  const textChunks = payloads.map((p) => p.content);
  const embeddings = await embed(textChunks);
  storeEmbeddings(embeddings, payloads);
}

export async function retrieve(
  query: string,
  filePaths: Array<string> | undefined,
  limit: number | undefined,
  scoreThreshold: number | undefined,
) {
  const embedding = await embedQuery(query);
  const results = searchStore(embedding, {
    documentPaths: filePaths,
    limit,
    scoreThreshold,
  });
  return results;
}
