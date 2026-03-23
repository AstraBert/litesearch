import { RecursiveChunker } from "@chonkiejs/core";
import type { EmbeddingPayload } from "qdrant-edge-utils";

const CHUNK_SIZE = 512;

export async function chunk({
  text,
  path,
  chunkSize = undefined,
}: {
  text: string;
  path: string;
  chunkSize?: number | undefined;
}): Promise<Array<EmbeddingPayload>> {
  const chunker = await RecursiveChunker.create({
    chunkSize: chunkSize ?? CHUNK_SIZE,
  });
  const chunks = await chunker.chunk(text);
  const textChunks: Array<EmbeddingPayload> = [];
  for (const chunk of chunks) {
    const payload: EmbeddingPayload = {
      documentPath: path,
      content: chunk.text,
      start: chunk.startIndex,
      end: chunk.endIndex,
    };
    textChunks.push(payload);
  }
  return textChunks;
}
