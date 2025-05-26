import axios from 'axios';

export default class HistoricalKlines {
    private static instance: HistoricalKlines;
    private baseUrl: string;

    private constructor() {
        this.baseUrl = 'https://api.binance.com/api/v3/klines';
    }

    /**
     * Get the singleton instance of HistoricalKlines.
     * @returns The singleton instance of HistoricalKlines.
     */
    public static getInstance(): HistoricalKlines {
        if (!HistoricalKlines.instance) {
            HistoricalKlines.instance = new HistoricalKlines();
        }
        return HistoricalKlines.instance;
    }

    /**
     * Fetch historical Klines from Binance.
     * @param symbol - The trading pair (e.g., 'BTCUSDT').
     * @param interval - The interval for the Klines (e.g., '1m', '5m', '1h').
     * @param startTime - The start time in milliseconds (optional).
     * @param endTime - The end time in milliseconds (optional).
     * @param limit - The maximum number of Klines to fetch (default: 500, max: 1000).
     * @returns An array of Klines.
     */
    public async fetchKlines(
        symbol: string,
        interval: string,
        startTime?: number,
        endTime?: number,
        limit = 500
        // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    ): Promise<any[]> {
        if (limit < 1 || limit > 1000) {
            throw new Error('Limit must be between 1 and 1000.');
        }
        try {
            console.log(`Fetching historical Klines for ${symbol.toUpperCase()} with interval ${interval}, limit ${limit}`);
            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
            const params: Record<string, any> = {
                symbol: symbol.toUpperCase(),
                interval,
                limit,
            };

            if (startTime) params.startTime = startTime;
            if (endTime) params.endTime = endTime;

            const response = await axios.get(this.baseUrl, { params });
            return response.data;
        } catch (error) {
            console.error('Failed to fetch historical Klines:', error);
            throw error;
        }
    }
}