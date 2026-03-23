import {
  search,
  upsertEmbeddings,
  type EmbeddingPayload,
  type EmbeddingWithPayload,
  type ResultWithScore,
} from "qdrant-edge-utils";

function fnv1a(str: string): number {
  let hash = 2166136261; // FNV offset basis
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0; // FNV prime, >>> 0 keeps it uint32
  }
  return hash;
}

export function storeEmbeddings(
  embeddings: Array<Array<number>>,
  payloads: Array<EmbeddingPayload>,
) {
  if (embeddings.length != payloads.length) {
    throw new Error("Embeddings and metadata should have the same length");
  }
  const embeddingsWithPayload = [];
  let i = 0;
  while (i < embeddings.length) {
    const embd = embeddings[i];
    const payload = payloads[i];
    if (embd && payload) {
      const toHash =
        payload.content +
        "\n" +
        payload.start.toString() +
        "-" +
        payload.end.toString();
      const embeddingWithPayload: EmbeddingWithPayload = {
        embedding: embd,
        payload,
        id: fnv1a(toHash),
      };
      embeddingsWithPayload.push(embeddingWithPayload);
    }
    i++;
  }
  upsertEmbeddings(embeddingsWithPayload);
}

export function searchStore(
  embedding: Array<number>,
  {
    documentPaths = undefined,
    limit = undefined,
    scoreThreshold = undefined,
  }: {
    documentPaths?: Array<string> | undefined;
    limit?: number | undefined;
    scoreThreshold?: number | undefined;
  },
): Array<ResultWithScore> {
  const results = search(embedding, documentPaths, limit, scoreThreshold);
  return results;
}
