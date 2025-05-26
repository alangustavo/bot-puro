import type { KlineEvent } from "./EventFactory";

export default class Kline {
    public startTime: number;
    public closeTime: number;
    public symbol: string;
    public interval: string;
    public open: number;
    public close: number;
    public high: number;
    public low: number;
    public volume: number;
    public trades: number;

    private constructor() {
        this.startTime = 0;
        this.closeTime = 0;
        this.symbol = '';
        this.interval = '';
        this.open = 0;
        this.close = 0;
        this.high = 0;
        this.low = 0;
        this.volume = 0;
        this.trades = 0;
    }

    public static fromEvent(event: KlineEvent): Kline {
        const kline = new Kline();
        kline.startTime = event.k.t;
        kline.closeTime = event.k.T;
        kline.symbol = event.k.s;
        kline.interval = event.k.i;
        kline.open = Number.parseFloat(event.k.o);
        kline.close = Number.parseFloat(event.k.c);
        kline.high = Number.parseFloat(event.k.h);
        kline.low = Number.parseFloat(event.k.l);
        kline.volume = Number.parseFloat(event.k.v);
        kline.trades = event.k.n;
        return kline;
    }

    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    public static fromArray(data: any[]): Kline {
        const kline = new Kline();
        kline.startTime = data[0];
        kline.closeTime = data[6];
        kline.symbol = data[1];
        kline.interval = data[2];
        kline.open = Number.parseFloat(data[3]);
        kline.close = Number.parseFloat(data[4]);
        kline.high = Number.parseFloat(data[5]);
        kline.low = Number.parseFloat(data[7]);
        kline.volume = Number.parseFloat(data[8]);
        kline.trades = data[9];
        return kline;
    }
}