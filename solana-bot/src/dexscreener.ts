import axios, { type AxiosInstance } from 'axios';
import type { DexScreenerPair, DexScreenerSearchResponse } from './types.js';

const DEXSCREENER_BASE_URL = 'https://api.dexscreener.com/latest/dex';

// DexScreener imposes a rate limit; stay well within it.
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Thin wrapper around the DexScreener REST API focused on Solana pairs.
 *
 * Docs: https://docs.dexscreener.com/api/reference
 */
export class DexScreenerClient {
  private readonly http: AxiosInstance;

  constructor() {
    this.http = axios.create({
      baseURL: DEXSCREENER_BASE_URL,
      timeout: REQUEST_TIMEOUT_MS,
      headers: { 'Accept': 'application/json' },
    });
  }

  /**
   * Fetch all currently-listed Solana token pairs from DexScreener.
   * Uses the `/search` endpoint filtered to the Solana chain, which returns
   * up to 30 pairs ordered by relevance / recent activity.
   */
  async getSolanaTokens(): Promise<DexScreenerPair[]> {
    const response = await this.http.get<DexScreenerSearchResponse>(
      '/search',
      { params: { q: 'solana' } },
    );

    const pairs = response.data.pairs ?? [];
    // Keep only Solana pairs
    return pairs.filter((p) => p.chainId === 'solana');
  }

  /**
   * Fetch pairs by their specific token address on Solana.
   * Useful for follow-up details after an initial scan.
   */
  async getPairsByTokenAddress(tokenAddress: string): Promise<DexScreenerPair[]> {
    const response = await this.http.get<DexScreenerSearchResponse>(
      `/tokens/solana/${tokenAddress}`,
    );
    return response.data.pairs ?? [];
  }

  /**
   * Fetch the most active Solana pairs right now by querying a selection of
   * well-known Solana DEX identifiers and pooling the results.  This gives a
   * broader snapshot than a single keyword search.
   */
  async getActiveSolanaPairs(): Promise<DexScreenerPair[]> {
    const queries = ['SOL', 'PUMP', 'NEW'];
    const results: DexScreenerPair[][] = await Promise.all(
      queries.map((q) =>
        this.http
          .get<DexScreenerSearchResponse>('/search', { params: { q } })
          .then((r) => (r.data.pairs ?? []).filter((p) => p.chainId === 'solana'))
          .catch(() => [] as DexScreenerPair[]),
      ),
    );

    // Deduplicate by pairAddress
    const seen = new Set<string>();
    const merged: DexScreenerPair[] = [];
    for (const batch of results) {
      for (const pair of batch) {
        if (!seen.has(pair.pairAddress)) {
          seen.add(pair.pairAddress);
          merged.push(pair);
        }
      }
    }
    return merged;
  }
}
