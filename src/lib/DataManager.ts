import type Klines from "./Klines";
import type { Interval } from "./types";

export default class DataManager {
    private static instance: DataManager;
    private data: Map<string, Klines>;

    private constructor() {
        this.data = new Map();
    }

    public static getInstance(): DataManager {
        if (!DataManager.instance) {
            DataManager.instance = new DataManager();
        }
        return DataManager.instance;
    }

    public setKlines(klines: Klines): void {
        this.data.set(klines.getKey(), klines);
    }

    public getKlines(symbol: string, interval: Interval): Klines {
        const index = `${symbol.toLowerCase()}_${interval}`;
        const klines = this.data.get(index);
        if (!klines) {
            throw new Error(`Klines data not found for symbol: ${symbol}, interval: ${interval}`);
        }
        return klines;
    }

}