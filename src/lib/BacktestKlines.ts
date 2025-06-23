import Klines from './Klines';
import { Interval } from './types';
import Kline from './Kline';

/**
 * Klines especial para backtest: permite adicionar candles um a um e manipular a lista facilmente.
 */
export default class BacktestKlines extends Klines {
    private _limit: number;

    constructor(symbol: string, interval: Interval, limit: number = 1000) {
        super(symbol, interval, limit); // começa vazio
        this._limit = limit;
    }


}
