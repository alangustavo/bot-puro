import ChatManager from "./ChatManager";
import DataManager from './DataManager';
import Indicators from "./Indicators";
import Klines from "./Klines";
import Operation from "./Operation";
import type { Interval, Status } from "./types";

export default class BotSMA {

    private indicators: Indicators;
    private stopLossPercent: number;
    private trailingStopLossPercent: number;
    private trailingStopLossActivePercent: number;
    private trailingStopLossPrice = 0;
    private trailingStopLossActive = false;
    private status: Status = "SOLD";
    private chatId: number;
    private symbol: string;
    private interval: Interval;
    private shortSMA: number;
    private longSMA: number;
    private operation: Operation | null = null;
    private chatManager!: ChatManager;
    private dataManager: DataManager;
    private crossShortLong: boolean;
    private result = 1;


    constructor(chatId: number, symbol: string, interval: Interval, shortSMA: number, longSMA: number, stopLossPercent = 0.98, trailingStopLossPercent = 0.995, trailingStopLossActivePercent = 1.007) {

        this.chatId = chatId;
        this.symbol = symbol;
        this.interval = interval;
        this.shortSMA = shortSMA;
        this.longSMA = longSMA;
        this.crossShortLong = true; // shortSMA > longSMA;
        this.stopLossPercent = stopLossPercent;
        this.trailingStopLossPercent = trailingStopLossPercent;
        this.trailingStopLossActivePercent = trailingStopLossActivePercent;
        this.indicators = new Indicators();
        this.dataManager = DataManager.getInstance();
        const klines = new Klines(this.symbol, this.interval, 1000);
        this.dataManager.setKlines(klines);


    }

    private closeOperation(sellPrice: number, sellDate: number, sellCriteria: string) {
        if (this.operation) {
            this.operation.sell(sellPrice, sellDate, sellCriteria);
            this.status = "SOLD";
            this.operation.save();
            this.result *= sellPrice / this.operation.buyPrice;
            const message = this.operation.toString();
            this.operation = null;
            this.trailingStopLossPrice = 0;
            this.trailingStopLossActive = false;

            const resultMessage = `
            RESULT.......: ${this.result.toFixed(4)}%`;
            this.chatManager.sendFormattedMessage(this.chatId, message + resultMessage);
        }
    }
    public async start() {
        this.chatManager = await ChatManager.getInstance();
        const klines = DataManager.getInstance().getKlines(this.symbol, this.interval);
        await klines.fetchKlines();
        setInterval(async () => {
            const klinesSize = klines.getSize();
            if (klinesSize < this.longSMA) {
                console.log(`Aguardando mais dados de Klines para calcular SMA (${klinesSize}/${this.longSMA})`);
                return;
            }
            const lastPrice = klines.getClosePrices()[klinesSize - 1];
            const shortSMA = this.indicators.getSMA(this.symbol, this.interval, this.shortSMA);
            const longSMA = this.indicators.getSMA(this.symbol, this.interval, this.longSMA);
            const ultaSMA = this.indicators.getSMA(this.symbol, this.interval, 1000);

            if (this.status === "SOLD") {
                console.log(`Status: ${this.status} Last Price: ${lastPrice.toFixed(2)}, S: ${shortSMA.toFixed(3)}, L: ${longSMA.toFixed(3)} U: ${ultaSMA.toFixed(3)} CROSS: ${this.crossShortLong} P>U: ${lastPrice > ultaSMA}`);
                // Compra apenas no cruzamento de baixo para cima
                if (this.crossShortLong === false && shortSMA > longSMA && ultaSMA < lastPrice) {
                    console.log('BUY');
                    this.crossShortLong = true;
                    this.operation = new Operation(this.chatId, this.symbol, lastPrice, Date.now(), 'SMA CROSS');
                    await this.operation.save();
                    this.chatManager.sendFormattedMessage(this.chatId, this.operation.getMessage(lastPrice));
                    this.status = "BOUGHT";
                }
            } else if (this.operation && this.status === "BOUGHT") {
                const buyPrice = this.operation.buyPrice;
                const stopLossPrice = buyPrice * this.stopLossPercent;
                const pl = lastPrice / buyPrice;
                // console.log(`Status: ${this.status} Last Price: ${lastPrice}, Buy: ${this.operation.buyPrice.toFixed(3)}, P/L: ${(lastPrice / buyPrice).toFixed(3)} S: ${shortSMA.toFixed(3)}, L: ${longSMA.toFixed(3)} S>L: ${this.crossShortLong}`);
                console.log(this.operation.getMessage(lastPrice));

                // Venda no cruzamento de cima para baixo
                if (this.crossShortLong === true && shortSMA < longSMA && (pl > 1.003 || pl < 0.99)) {
                    console.log('SELL');
                    this.closeOperation(lastPrice, Date.now(), 'SMA CROSS');
                    return;
                }
                // Stop Loss
                if (lastPrice < stopLossPrice) {
                    console.log('STOP LOSS');
                    this.closeOperation(lastPrice, Date.now(), 'STOP LOSS');
                    return;
                }

                // active trailing stop loss and adjusting the trailing stop loss price
                if (!this.trailingStopLossActive && lastPrice > this.operation.buyPrice * this.trailingStopLossActivePercent) {
                    this.trailingStopLossPrice = lastPrice * this.trailingStopLossPercent;
                    this.trailingStopLossActive = true;
                    this.chatManager.sendMessage(this.chatId, `Active Trailing Stop Loss at ${this.trailingStopLossPrice}`);
                }

                if (this.trailingStopLossActive) {
                    const price = lastPrice * this.trailingStopLossPercent;
                    if (price > this.trailingStopLossPrice) {
                        this.trailingStopLossPrice = lastPrice * this.trailingStopLossPercent;
                        console.log(`Change Trailing Stop Loss Price to ${this.trailingStopLossPrice}`);
                    }
                }

                // Trailing Stop Loss
                if (lastPrice < this.trailingStopLossPrice) {
                    console.log('TRAILING STOP LOSS');
                    this.closeOperation(lastPrice, Date.now(), 'TRAILING STOP LOSS');
                    return;
                }
            }
            // Atualiza o estado do cruzamento para o próximo ciclo
            this.crossShortLong = shortSMA > longSMA;
        }, 10000);
    }
}