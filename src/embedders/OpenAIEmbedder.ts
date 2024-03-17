import { IEmbedder, IEmbedderOptions } from '../types/IEmbedder';
import { constants } from '../common/constants';
import OpenAI from 'openai';

export class OpenAIEmbedder implements IEmbedder {
  private readonly openaiClient: OpenAI;
  private readonly openaiDefaultEmbeddingModel = constants.DEFAULT_OPENAI_MODEL;
  private readonly embeddingModel: string = this.openaiDefaultEmbeddingModel;

  constructor(options: IEmbedderOptions = {}) {
    this.openaiClient = new OpenAI({ apiKey: options.apiKey, dangerouslyAllowBrowser: true });
    this.embeddingModel = options.embeddingModel ?? this.openaiDefaultEmbeddingModel;
  }

  public async embedText(text: string): Promise<number[]> {
    return (await this.embedTexts([text]))[0];
  }

  public async embedTexts(texts: string[]): Promise<number[][]> {
    const embeddings = await this.openaiClient.embeddings.create({ input: texts, model: this.embeddingModel });
    return embeddings.data.map((item: any) => item.embedding);
  }

  toString(): string {
    return `OpenAIEmbedder: ${this.embeddingModel}`;
  }
}
