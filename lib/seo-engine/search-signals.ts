/**
 * Search signals provider stub — no volumes/trends until GSC/Trends is wired.
 */
export type SearchSignal = {
  query: string;
  kind: 'heuristic_editorial_opportunity';
  note: string;
};

export interface SearchSignalsProvider {
  getSignals(query: string): Promise<SearchSignal[] | null>;
}

export class NullSearchSignalsProvider implements SearchSignalsProvider {
  async getSignals(_query: string): Promise<SearchSignal[] | null> {
    return null;
  }
}

export const defaultSearchSignalsProvider: SearchSignalsProvider =
  new NullSearchSignalsProvider();
