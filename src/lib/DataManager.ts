import Klines from "./Klines";
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

    public getKlines(symbol: string, interval: Interval, limit = 1000): Klines {
        const index = `${symbol.toLowerCase()}_${interval}`;

        let klines = this.data.get(index);
        if (!klines) {
            klines = new Klines(symbol, interval, limit);
            this.setKlines(klines);
        }
        // console.log(`DataManager.getKlines(${symbol}, ${interval}, ${limit}) - index: ${index} ${klines.getKey()} ${klines.getKlines().length} klines`);
        // console.log(`${klines.getLastKline()}`);
        return klines;
    }

}