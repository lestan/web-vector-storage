import { IDBPDatabase, openDB } from 'idb';
import { IEmbedder } from './types/IEmbedder';
import { IWVSDocument, IWVSSimilaritySearchItem } from './types/IWVSDocument';
import { IWVSOptions } from './types/IWVSOptions';
import { IWVSSimilaritySearchParams } from './types/IWVSSimilaritySearchParams';
import { constants } from './common/constants';
import { filterDocuments, getObjectSizeInMB } from './common/helpers';

export class WebVectorStorage<T> {
  private db!: IDBPDatabase<any>;
  private documents: Array<IWVSDocument<T>> = [];
  private readonly maxSizeInMB: number;
  private readonly debounceTime: number;
  private readonly embedder: IEmbedder;
  private initialized: boolean = false;
  private loaded: boolean = false;

  constructor(embedder: IEmbedder, options: IWVSOptions = {}) {
    this.embedder = embedder;
    this.maxSizeInMB = options.maxSizeInMB ?? constants.DEFAULT_MAX_SIZE_IN_MB;
    this.debounceTime = options.debounceTime ?? constants.DEFAULT_DEBOUNCE_TIME;

    // check that embedder is valid
    if (!this.embedder) {
      console.error('WebVectorStorage: pass a valid Embedder to use');
      throw new Error('WebVectorStorage: pass a valid Embedder to use');
    }
  }

  public async addText(text: string, metadata: T): Promise<IWVSDocument<T>> {
    // load if not loaded
    if (!this.loaded) {
      await this.loadFromIndexDbStorage();
    }
    // Create a document from the text and metadata
    const doc: IWVSDocument<T> = {
      metadata,
      text,
      timestamp: Date.now(),
      vector: [],
      vectorMag: 0,
    };
    const docs = await this.addDocuments([doc]);
    return docs[0];
  }

  public async addTexts(texts: string[], metadatas: T[]): Promise<Array<IWVSDocument<T>>> {
    if (texts.length !== metadatas.length) {
      throw new Error('The lengths of texts and metadata arrays must match.');
    }
    // load if not loaded
    if (!this.loaded) {
      await this.loadFromIndexDbStorage();
    }
    const docs: Array<IWVSDocument<T>> = texts.map((text, index) => ({
      metadata: metadatas[index],
      text,
      timestamp: Date.now(),
      vector: [],
      vectorMag: 0,
    }));
    return await this.addDocuments(docs);
  }

  public async similaritySearch(params: IWVSSimilaritySearchParams): Promise<{
    similarItems: Array<IWVSSimilaritySearchItem<T>>;
    query: { text: string; embedding: number[] };
  }> {
    const { query, k = 4, filterOptions, includeValues } = params;
    const queryEmbedding = await this.embedder.embedText(query);
    const queryMagnitude = await this.calculateMagnitude(queryEmbedding);
    const filteredDocuments = filterDocuments(this.documents, filterOptions);
    const scoresPairs: Array<[IWVSDocument<T>, number]> = this.calculateSimilarityScores(filteredDocuments, queryEmbedding, queryMagnitude);
    const sortedPairs = scoresPairs.sort((a, b) => b[1] - a[1]);
    const results = sortedPairs.slice(0, k).map((pair) => ({ ...pair[0], score: pair[1] }));
    this.updateHitCounters(results);
    if (results.length > 0) {
      this.removeDocsLRU();
      await this.saveToIndexDbStorage();
    }
    if (!includeValues) {
      results.forEach((result) => {
        delete result.vector;
        delete result.vectorMag;
      });
    }
    return {
      query: { embedding: queryEmbedding, text: query },
      similarItems: results,
    };
  }

  private async initDB(): Promise<IDBPDatabase<any>> {
    const vdb = await openDB<any>('WebVectorStorageDatabase', undefined, {
      upgrade(db) {
        const documentStore = db.createObjectStore('documents', {
          autoIncrement: true,
          keyPath: 'id',
        });
        documentStore.createIndex('text', 'text', { unique: true });
        documentStore.createIndex('metadata', 'metadata');
        documentStore.createIndex('timestamp', 'timestamp');
        documentStore.createIndex('vector', 'vector');
        documentStore.createIndex('vectorMag', 'vectorMag');
        documentStore.createIndex('hits', 'hits');
      },
    });
    this.initialized = true;
    return vdb;
  }

  private async addDocuments(documents: Array<IWVSDocument<T>>): Promise<Array<IWVSDocument<T>>> {
    // filter out already existing documents
    const newDocuments = documents.filter((doc) => !this.documents.some((d) => d.text === doc.text));
    // If there are no new documents, return an empty array
    if (newDocuments.length === 0) {
      return [];
    }
    const newVectors = await this.embedder.embedTexts(newDocuments.map((doc) => doc.text));
    // Assign vectors and precompute vector magnitudes for new documents
    newDocuments.forEach((doc, index) => {
      doc.vector = newVectors[index];
      doc.vectorMag = calcVectorMagnitude(doc);
    });
    // Add new documents to the store
    this.documents.push(...newDocuments);
    this.removeDocsLRU();
    // Save to index db storage
    await this.saveToIndexDbStorage();
    return newDocuments;
  }

  private calculateMagnitude(embedding: number[]): number {
    const queryMagnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return queryMagnitude;
  }

  private calculateSimilarityScores(filteredDocuments: Array<IWVSDocument<T>>, queryVector: number[], queryMagnitude: number): Array<[IWVSDocument<T>, number]> {
    return filteredDocuments.map((doc) => {
      const dotProduct = doc.vector!.reduce((sum, val, i) => sum + val * queryVector[i], 0);
      let score = getCosineSimilarityScore(dotProduct, doc.vectorMag!, queryMagnitude);
      score = normalizeScore(score); // Normalize the score
      return [doc, score];
    });
  }

  private updateHitCounters(results: Array<IWVSDocument<T>>): void {
    results.forEach((doc) => {
      doc.hits = (doc.hits ?? 0) + 1; // Update hit counter
    });
  }

  private async loadFromIndexDbStorage(): Promise<void> {
    if (!this.db) {
      this.db = await this.initDB();
    }
    this.documents = await this.db.getAll('documents');
    this.removeDocsLRU();
    this.loaded = true;
  }

  private async saveToIndexDbStorage(): Promise<void> {
    if (!this.db) {
      this.db = await this.initDB();
    }
    try {
      const tx = this.db.transaction('documents', 'readwrite');
      await tx.objectStore('documents').clear();
      for (const doc of this.documents) {
        // eslint-disable-next-line no-await-in-loop
        await tx.objectStore('documents').put(doc);
      }
      await tx.done;
    } catch (error: any) {
      console.error('Failed to save to IndexedDB:', error.message);
    }
  }

  private removeDocsLRU(): void {
    if (getObjectSizeInMB(this.documents) > this.maxSizeInMB) {
      // Sort documents by hit counter (ascending) and then by timestamp (ascending)
      this.documents.sort((a, b) => (a.hits ?? 0) - (b.hits ?? 0) || a.timestamp - b.timestamp);

      // Remove documents until the size is below the limit
      while (getObjectSizeInMB(this.documents) > this.maxSizeInMB) {
        this.documents.shift();
      }
    }
  }

  public async resetDB(): Promise<void> {
    // remove all documents from the store
    this.documents = [];
    return await this.saveToIndexDbStorage();
  }

  toString(): string {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string
    return `WebVectorStorage: ${this.embedder.toString()}`;
  }
}

function calcVectorMagnitude(doc: IWVSDocument<any>): number {
  return Math.sqrt(doc.vector!.reduce((sum, val) => sum + val * val, 0));
}

function getCosineSimilarityScore(dotProduct: number, magnitudeA: number, magnitudeB: number): number {
  return dotProduct / (magnitudeA * magnitudeB);
}

function normalizeScore(score: number): number {
  return (score + 1) / 2;
}
