import BinanceStreamManager from "./BinanceStreamManager";
import HistoricalKlines from "./HistoricalKlines";
import Kline from "./Kline";
import type { Interval } from "./types";

export default class Klines {
    private limit: number;
    private klines: Kline[];
    private interval: Interval;
    private symbol: string;

    constructor(symbol: string, interval: Interval, limit: number) {
        this.symbol = symbol;
        this.interval = interval;
        this.limit = limit;
        this.klines = [];
    }

    public getKey(): string {
        return `${this.symbol.toLowerCase()}_${this.interval}`;
    }
    public getSize(): number {
        return this.klines.length;
    }

    public async fetchKlines() {
        console.log(`Fetching klines for ${this.symbol} with interval ${this.interval}`);
        if (this.klines.length === 0) {
            const historicalKlines = HistoricalKlines.getInstance();
            const data = await historicalKlines.fetchKlines(this.symbol, this.interval, undefined, undefined, this.limit);
            // biome-ignore lint/suspicious/noExplicitAny: <explanation>
            data.map((klineData: any) => {
                const kline = Kline.fromArray(klineData);
                this.addKline(kline);
            });
            const ws = BinanceStreamManager.getInstance();
            const channel = `${this.symbol.toLowerCase()}@kline_${this.interval}`;
            ws.subscribe(channel);
        }
    }

    public addKline(kline: Kline): void {

        // Verifica se já existe um Kline com o mesmo startTime
        const existingIndex = this.klines.findIndex(existingKline => existingKline.startTime === kline.startTime);
        if (existingIndex !== -1) {
            // Atualiza o Kline existente
            this.klines[existingIndex] = kline;
        } else {
            // Adiciona um novo Kline
            this.klines.push(kline);
            // Remove o Kline mais antigo se o limite for excedido
            if (this.klines.length > this.limit) {
                this.klines.shift();
            }
        }
        // console.log(this.klines);
    }

    public getClosePrices(): number[] {
        return this.klines.map(kline => kline.close);
    }
    public getOpenPrices(): number[] {
        return this.klines.map(kline => kline.open);
    }
    public getHighPrices(): number[] {
        return this.klines.map(kline => kline.high);
    }
    public getLowPrices(): number[] {
        return this.klines.map(kline => kline.low);
    }
    public getVolumes(): number[] {
        return this.klines.map(kline => kline.volume);
    }
}