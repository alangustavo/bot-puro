import type { KlineEvent } from "./EventFactory";
import { formatAllDate } from "./utils";

export default class Kline {
    public startTime: number;
    public closeTime: number;
    public open: number;
    public close: number;
    public high: number;
    public low: number;
    public volume: number;
    public trades: number;

    private constructor() {
        this.startTime = 0;
        this.closeTime = 0;
        this.open = 0;
        this.close = 0;
        this.high = 0;
        this.low = 0;
        this.volume = 0;
        this.trades = 0;
    }


    /**
     * 
     * @param obj 
     * @returns 
     */
    public static fromObject(obj: {
        openTime: number;
        open: number;
        close: number;
        high: number;
        low: number;
        volume: number;
        closeTime: number;
    }): Kline {
        const kline = new Kline();
        kline.startTime = obj.openTime;
        kline.closeTime = obj.closeTime;
        kline.open = obj.open;
        kline.close = obj.close;
        kline.high = obj.high;
        kline.low = obj.low;
        kline.volume = obj.volume;
        return kline;
    }

    public static fromEvent(event: KlineEvent): Kline {
        const kline = new Kline();
        kline.startTime = event.k.t;
        kline.closeTime = event.k.T;
        kline.open = Number.parseFloat(event.k.o);
        kline.close = Number.parseFloat(event.k.c);
        kline.high = Number.parseFloat(event.k.h);
        kline.low = Number.parseFloat(event.k.l);
        kline.volume = Number.parseFloat(event.k.v);
        kline.trades = event.k.n;
        return kline;
    }


    /**
     * 
     * @param data  
     * @returns 
     * [
    1499040000000,      // Kline open time
    "0.01634790",       // Open price
    "0.80000000",       // High price
    "0.01575800",       // Low price
    "0.01577100",       // Close price
    "148976.11427815",  // Volume
    1499644799999,      // Kline Close time
    "2434.19055334",    // Quote asset volume
    308,                // Number of trades
    "1756.87402397",    // Taker buy base asset volume
    "28.46694368",      // Taker buy quote asset volume
    "0"                 // Unused field, ignore.
  ]
     */
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    public static fromArray(data: any[]): Kline {
        const kline = new Kline();
        kline.startTime = data[0];
        kline.closeTime = data[6];
        kline.open = Number.parseFloat(data[1]);
        kline.close = Number.parseFloat(data[4]);
        kline.high = Number.parseFloat(data[2]);
        kline.low = Number.parseFloat(data[3]);
        kline.volume = Number.parseFloat(data[5]);
        kline.trades = data[8];
        return kline;
    }

    formatDate(ms: number): string {
        return formatAllDate(ms);
    }

    public getFormatedStartTime(): String {
        return this.formatDate(this.startTime);
    }

    public getFormatedCloseTime(): String {
        return this.formatDate(this.closeTime);
    }
    public toString(): string {
        return `Kline(${this.startTime} = ${this.formatDate(this.startTime)}, O: ${this.open.toFixed(3)}, H: ${this.high.toFixed(3)}, L: ${this.low.toFixed(3)}, C: ${this.close.toFixed(3)}, V: ${this.volume.toFixed(3)})`;
    }
}