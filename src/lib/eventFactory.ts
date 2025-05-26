import DataManager from './DataManager';
import Kline from './Kline';
import type { event, Interval } from './types';
export interface AggTradeEvent {
    e: string; // Event type
    E: number; // Event time
    s: string; // Symbol
    a: number; // Aggregate trade ID
    p: string; // Price
    q: string; // Quantity
    f: number; // First trade ID
    l: number; // Last trade ID
    T: number; // Trade time
    m: boolean; // Is the buyer the market maker?
    M: boolean; // Ignore
}

export interface KlineEvent {
    e: string; // Event type
    E: number; // Event time
    s: string; // Symbol
    k: {
        t: number; // Kline start time
        T: number; // Kline close time
        s: string; // Symbol
        i: string; // Interval
        f: number; // First trade ID
        L: number; // Last trade ID
        o: string; // Open price
        c: string; // Close price
        h: string; // High price
        l: string; // Low price
        v: string; // Base asset volume
        n: number; // Number of trades
        x: boolean; // Is this kline closed?
        q: string; // Quote asset volume
        V: string; // Taker buy base asset volume
        Q: string; // Taker buy quote asset volume
        B: string; // Ignore
    };
}

export type EventData =
    | { e: 'aggTrade'; E: number; s: string; a: number; p: string; q: string; f: number; l: number; T: number; m: boolean; M: boolean; }
    | { e: 'kline'; E: number; s: string; k: { t: number; T: number; s: string; i: string; f: number; L: number; o: string; c: string; h: string; l: string; v: string; n: number; x: boolean; q: string; V: string; Q: string; B: string; }; };

export function createEvent(data: EventData): AggTradeEvent | KlineEvent | null {
    let event: AggTradeEvent | KlineEvent | null = null;
    if (data.e === 'aggTrade') {
        event = {
            e: data.e,
            E: data.E,
            s: data.s,
            a: data.a,
            p: data.p,
            q: data.q,
            f: data.f,
            l: data.l,
            T: data.T,
            m: data.m,
            M: data.M,
        } as AggTradeEvent;

    }

    if (data.e === 'kline') {
        // console.log('Kline event:', data);
        event = {
            e: data.e,
            E: data.E,
            s: data.s,
            k: {
                t: data.k.t,
                T: data.k.T,
                s: data.k.s,
                i: data.k.i,
                f: data.k.f,
                L: data.k.L,
                o: data.k.o,
                c: data.k.c,
                h: data.k.h,
                l: data.k.l,
                v: data.k.v,
                n: data.k.n,
                x: data.k.x,
                q: data.k.q,
                V: data.k.V,
                Q: data.k.Q,
                B: data.k.B,
            },
        } as KlineEvent;
        const dataManager = DataManager.getInstance();
        const klines = dataManager.getKlines(event.k.s, event.k.i as Interval);
        if (klines) {
            const kline = Kline.fromEvent(event);
            klines.addKline(kline);
        }
        return event;
    }

    console.warn('Unknown event type:', data);
    return event; // Retorna null se o tipo de evento não for reconhecido
}