import type { DocumentChunk } from "@/components/universal/attachments/documentChunking";

export interface VectorDocument {
  id: string;
  chunk: DocumentChunk;
  embedding: number[];
}

export interface SearchResult {
  score: number;
  item: VectorDocument;
}

export class VectorStore {

  private readonly items =
    new Map<string, VectorDocument>();

  clear(): void {
    this.items.clear();
  }

  size(): number {
    return this.items.size;
  }

  add(
    chunk: DocumentChunk,
    embedding: number[],
  ): void {

    this.items.set(
      chunk.id,
      {
        id: chunk.id,
        chunk,
        embedding,
      },
    );
  }

  addMany(
    chunks: DocumentChunk[],
    embeddings: number[][],
  ): void {

    if (
      chunks.length !==
      embeddings.length
    ) {
      throw new Error(
        "Chunks / embeddings mismatch.",
      );
    }

    for (
      let i = 0;
      i < chunks.length;
      i++
    ) {
      this.add(
        chunks[i],
        embeddings[i],
      );
    }
  }

  get(
    id: string,
  ): VectorDocument | undefined {

    return this.items.get(id);

  }

  getAll(): VectorDocument[] {

    return [
      ...this.items.values(),
    ];

  }

  private cosineSimilarity(
    a: number[],
    b: number[],
  ): number {

    if (
      a.length !== b.length
    ) {
      return -1;
    }

    let dot = 0;

    for (
      let i = 0;
      i < a.length;
      i++
    ) {
      dot +=
        a[i] * b[i];
    }

    return dot;

  }

  search(
    queryEmbedding: number[],
    topK = 5,
  ): SearchResult[] {

    return [
      ...this.items.values(),
    ]
      .map(item => ({
        item,
        score:
          this.cosineSimilarity(
            queryEmbedding,
            item.embedding,
          ),
      }))
      .sort(
        (a, b) =>
          b.score - a.score,
      )
      .slice(
        0,
        topK,
      );

  }

  serialize() {

    return JSON.stringify(
      this.getAll(),
      null,
      2,
    );

  }

  load(
    json: string,
  ) {

    this.clear();

    const items =
      JSON.parse(
        json,
      ) as VectorDocument[];

    for (
      const item of items
    ) {
      this.items.set(
        item.id,
        item,
      );
    }

  }

}

export const
globalVectorStore =
  new VectorStore();
