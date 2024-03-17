import { IWVSFilterOptions } from './IWVSFilterOptions';

export interface IWVSSimilaritySearchParams {
  query: string;
  k?: number;
  filterOptions?: IWVSFilterOptions;
  includeValues?: boolean;
}
