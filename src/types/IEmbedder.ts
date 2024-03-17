export interface IEmbedder {
  embedText: (text: string) => Promise<number[]>;
  embedTexts: (texts: string[]) => Promise<number[][]>;
}

export interface IEmbedderOptions {
  apiKey?: string;
  embeddingModel?: string;
  baseUrl?: string;
}
