export interface IWVSOptions {
  maxSizeInMB?: number; // The maximum size of the storage in megabytes. Defaults to 4.8. Cannot exceed 5.
  debounceTime?: number; // The debounce time in milliseconds for saving to local storage. Defaults to 0.
}
