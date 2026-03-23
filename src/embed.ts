import { pipeline, layer_norm } from "@huggingface/transformers";

const MODEL_NAME = "nomic-ai/nomic-embed-text-v1.5";

export async function embed(
  chunks: Array<string>,
): Promise<Array<Array<number>>> {
  const extractor = await pipeline("feature-extraction", MODEL_NAME);
  let embeddings = await extractor(chunks, { pooling: "mean" });
  // @ts-expect-error Type undefined is not assignable to type number. (ts 2322)
  embeddings = layer_norm(embeddings, [embeddings.dims[1]]).normalize(2, -1);
  return embeddings.tolist() as Array<Array<number>>;
}

export async function embedQuery(query: string): Promise<Array<number>> {
  const extractor = await pipeline("feature-extraction", MODEL_NAME);
  let embeddings = await extractor([query], { pooling: "mean" });
  // @ts-expect-error Type undefined is not assignable to type number. (ts 2322)
  embeddings = layer_norm(embeddings, [embeddings.dims[1]]).normalize(2, -1);
  return (embeddings.tolist() as Array<Array<number>>).at(0)!;
}
