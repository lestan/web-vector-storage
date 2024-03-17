import { IEmbedder, IEmbedderOptions } from '../types/IEmbedder';
import { constants } from '../common/constants';
import ollama from 'ollama';

export class OllamaEmbedder implements IEmbedder {
  private readonly defaultEmbeddingModel = constants.DEFAULT_OLLAMA_MODEL;
  private static readonly defaultOllamaUrl = constants.OLLAMA_BASE_URL;
  private readonly embeddingModel: string = this.defaultEmbeddingModel;
  private readonly ollamaUrl: string = OllamaEmbedder.defaultOllamaUrl;

  constructor(embedderOptions: IEmbedderOptions = { baseUrl: OllamaEmbedder.defaultOllamaUrl }) {
    this.embeddingModel = embedderOptions.embeddingModel ?? this.defaultEmbeddingModel;
    this.ollamaUrl = embedderOptions.baseUrl ?? OllamaEmbedder.defaultOllamaUrl;

    // do a ping check for Ollama server or throw error
    this.pingCheck().then((result) => {
      if (!result) {
        throw new Error('Ollama server is not running. Please start the Ollama server.');
      }
    });

    // do a model check for the embedding model or throw error
    this.embeddingModelCheck().then((result) => {
      if (!result) {
        throw new Error(`The embedding model ${this.embeddingModel} is not available. Please pull the model first.`);
      }
    });
  }

  // ping check to see if Ollama server is running
  // and that the embedding model is available
  private async pingCheck(): Promise<boolean> {
    // ping check to defaultOlamaUrl
    // and check for http status 200
    const response = await fetch(this.ollamaUrl);
    return response.status === 200;
  }

  // check if the embedding model is available
  // by caling the /api/tags endpoing using fetch
  // and validating the the model is the models array using the name property
  private async embeddingModelCheck(): Promise<boolean> {
    const response = await fetch(`${this.ollamaUrl}/api/tags`);
    const modelExists = await response.json().then((data): boolean => {
      // check if the model matching the name property is in the models array
      for (const model of data.models) {
        if (model.name.startsWith(this.embeddingModel)) {
          return true;
        }
      }
      return false;
    });

    return modelExists;
  }

  public async embedText(text: string): Promise<number[]> {
    const embeddingResponse = await ollama.embeddings({ model: this.embeddingModel, prompt: text });
    return embeddingResponse.embedding;
  }

  public async embedTexts(texts: string[]): Promise<number[][]> {
    // loop through the texts and embed each one
    const promises = [];
    for (const text of texts) {
      promises.push(this.embedText(text));
    }

    // wait for all promises to resolve
    const embeddings = await Promise.all(promises);

    return embeddings;
  }

  toString(): string {
    return `OllamaEmbedder: ${this.embeddingModel}`;
  }
}
