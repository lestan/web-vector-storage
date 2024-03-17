// Uses HuggingFace embedders to embed text
import { IEmbedder, IEmbedderOptions } from '../types/IEmbedder';
import { constants } from '../common/constants';
import { env, pipeline } from '@xenova/transformers';

export class HFTransformerEmbedder implements IEmbedder {
  private readonly defaultEmbeddingModel = constants.DEFAULT_HF_MODEL;
  private readonly embeddingModel: string = this.defaultEmbeddingModel;
  private hfPipeline: any;

  constructor(embedderOptions: IEmbedderOptions = {}) {
    this.embeddingModel = embedderOptions.embeddingModel ?? this.defaultEmbeddingModel;
    env.allowLocalModels = false;
  }

  public async embedText(text: string): Promise<number[]> {
    return (await this.embedTexts([text]))[0];
  }

  public async embedTexts(texts: string[]): Promise<number[][]> {
    if (!this.hfPipeline) {
      this.hfPipeline = await pipeline('feature-extraction', this.embeddingModel);
    }

    const embeddings: number[][] = [];

    for (const text of texts) {
      // eslint-disable-next-line no-await-in-loop
      const embedding = await this.hfPipeline(text, {
        normalize: true,
        pooling: 'mean',
      });
      embeddings.push(embedding.data);
    }
    return embeddings;
  }

  toString(): string {
    return `HFTransformerEmbedder: ${this.embeddingModel}`;
  }
}
