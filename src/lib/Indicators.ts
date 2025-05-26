import DataManager from "./DataManager";
import type { Interval } from "./types";

export default class Indicators {

    getSMA(symbol: string, interval: string, period: number): number {
        const klines = DataManager.getInstance().getKlines(symbol, interval as Interval);
        if (!klines) {
            throw new Error(`Klines not found for ${symbol} with interval ${interval}`);
        }
        const closePrices = klines.getClosePrices();
        if (closePrices.length < period) {
            throw new Error(`Not enough data to calculate SMA for ${symbol} with interval ${interval}`);
        }
        const sum = closePrices.slice(-period).reduce((acc, price) => acc + price, 0);
        return sum / period;
    }
}