export interface IWVSFilterOptions {
  include?: IWVSFilterCriteria;
  exclude?: IWVSFilterCriteria;
}

export interface IWVSFilterCriteria {
  metadata?: Record<string, any>;
  text?: string | string[];
}
