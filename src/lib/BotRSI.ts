import { Indicator } from "technicalindicators/declarations/indicator/indicator";
import { Bot, BotConfig } from "./Bot";
import DataManager from "./DataManager";
import { Interval, OHLCV } from './types';
import Indicators from './Indicators';
import Operation from './Operation';
import he from 'he';
import Kline from "./Kline";
import CsvWriter from "./CsvWriter";
import { pre } from "telegraf/typings/format";
import { BotRSIStatus2 } from './BotRSIEMA2';


export type BotRSIStatus =
    'CROSS_UP' | // RSI short cruzou acima do longo
    'CROSS_DOWN' | // RSI short cruzou abaixo do longo
    'UP' |  // RSI  short acima de long
    'DOWN'; // // RSI short abaixo de long


export type BotIntentionStatus =
    'BUY' | // Intenção de compra
    'SELL' |
    'HOLD';  // Intenção de venda

class BotRSIConfig extends BotConfig {

    /**
     * @param symbol 
     * @param interval 
     * @param rsiShortInterval 
     * @param fastEMA 
     * @param slowEMA 
     * @param minimumProfitPercent 
     * @param stopLossPercent 
     */
    constructor(
        public symbol: string,
        public interval: Interval,
        public longInterval: Interval = '1d',
        public rsiShortInterval: number = 7,
        public rsiLongInterval: number = 9,
        public stopLossPercent: number = 0.05, // 1% Stop Loss
        public stopGainPercent: number = 0.05, // 3% Stop Gain
        public trailingStopLossPercent: number = 0.03, // 2.5% Trailing Stop Loss
        public minimumProfitPercent: number = 0.015 // 0.5% Minimum Profit
    ) {
        super();
    }

    public toString(): string {
        return `
CONFIGURATION:
SYMBOL.........: ${this.symbol}
INTERVAL.......: ${this.interval}
RSI SHORT......: ${this.rsiShortInterval}
RSI LONG.......: ${this.rsiLongInterval}
STOP LOSS......: ${(this.stopLossPercent * 100).toFixed(2)}%
STOP GAIN......: ${(this.stopGainPercent * 100).toFixed(2)}%
TRAILING STOP..: ${(this.trailingStopLossPercent * 100).toFixed(2)}%
MINIMUM P/L....: ± ${(this.minimumProfitPercent * 100).toFixed(2)}%`;
    }
}


class BotRSI extends Bot {
    private traillingStopActual = 0;
    private operations: Operation[] = []; // List of operations performed by the bot
    private config: BotRSIConfig; // Configuration for the bot
    private buyPrice: number | null = null; // Price at which the bot bought
    private botRSIStatus: BotRSIStatus = 'DOWN'; // Current status of the bot for short interval
    private botIntention: BotIntentionStatus = 'HOLD'; // Intention of the bot (buy or sell)
    private csvFileName: string;
    private trailingStopLossPrice = 0; // Price for trailing stop loss
    private trailingStopLossActive = false; // Whether trailing stop loss is active
    private stopLossPrice = 0; // Price for stop loss
    private stopGainPrice = 0; // Price for stop gain

    constructor(chatId: number, config: BotRSIConfig) {
        super(chatId, 10);
        this.config = config;
        this.sendMessage(this.getBotConfig());
        this.csvFileName = `bot_rsi_${this.config.symbol}_${this.config.interval}.csv`;

    }

    protected async analyzeMarket(): Promise<void> {
        const i = new Indicators();
        const closes = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getClosePrices();
        const lastKline = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getLastKline();

        const startTimes = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getStartTimes();


        const actualDate = startTimes[startTimes.length - 1] / 1000 || 0;
        const actualDateString = new Date(actualDate * 1000).toISOString().replace('T', ' ').replace('Z', '');

        // Check RSI Indicators Short Interval
        const rsiShortIndicator = i.calculateRSI(this.config.symbol, this.config.interval, this.config.rsiShortInterval);
        const previoShortRSI = rsiShortIndicator[rsiShortIndicator.length - 2] || 0;
        const actualShortRSI = rsiShortIndicator[rsiShortIndicator.length - 1] || 0;

        const rsiLongIndicator = i.calculateRSI(this.config.symbol, this.config.interval, this.config.rsiLongInterval);
        const previoLongRSI = rsiLongIndicator[rsiLongIndicator.length - 2] || 0;
        const actualLongdRSI = rsiLongIndicator[rsiLongIndicator.length - 1] || 0;

        const rsiLongDayIndicator = i.calculateRSI(this.config.symbol, this.config.longInterval, 5);
        const rsiShortDayIndicator = i.calculateRSI(this.config.symbol, this.config.longInterval, 3);
        const previoLongDayRSI = rsiLongDayIndicator[rsiLongDayIndicator.length - 2] || 0;
        const actualLongDayRSI = rsiLongDayIndicator[rsiLongDayIndicator.length - 1] || 0;
        const previoShortDayRSI = rsiShortDayIndicator[rsiShortDayIndicator.length - 2] || 0;
        const actualShortDayRSI = rsiShortDayIndicator[rsiShortDayIndicator.length - 1] || 0;

        const crossUpRSI = previoLongRSI > previoShortRSI && actualShortRSI > actualLongdRSI;
        const crossDownRSI = previoShortRSI > previoLongRSI && actualShortRSI < actualLongdRSI;


        const upDayRSI = actualShortDayRSI > actualLongDayRSI;
        const downDayRSI = actualShortDayRSI < actualLongDayRSI;

        const ema23 = i.calculateEMA(this.config.symbol, this.config.interval, 9);
        const ema19 = i.calculateEMA(this.config.symbol, this.config.interval, 7);
        const actualEma23 = ema23[ema23.length - 1] || 0;
        const actualEma19 = ema19[ema19.length - 1] || 0;
        // const actualfast50EMA = ema50[ema50.length - 1] || 0;


        let opReason = '';

        const actualPrice = closes[closes.length - 1] || 0;

        // Definindo os Status do Bot
        if (crossUpRSI) {
            this.botRSIStatus = 'CROSS_UP';
            opReason += `\nRSI CROSS UP Long ${actualShortRSI.toFixed(3)} > ${actualLongdRSI.toFixed(3)}\nCROSS UP Short/Long RSI\nPrevious ${previoShortRSI.toFixed(3)}/${previoLongRSI.toFixed(3)}`;
        } else if (actualShortRSI > actualLongdRSI) {
            this.botRSIStatus = 'UP';
            opReason += `\nRSI UP  ${actualShortRSI.toFixed(3)} > ${actualLongdRSI.toFixed(3)}`;
        } else if (crossDownRSI) {
            this.botRSIStatus = 'CROSS_DOWN';
            opReason += `\nRSI CROSS DOWN Long ${actualShortRSI.toFixed(3)} < ${actualLongdRSI.toFixed(3)}\nCROSS DOWN Short/Long RSI\nPrevious ${previoShortRSI.toFixed(3)}/${previoLongRSI.toFixed(3)}`;
        } else {
            this.botRSIStatus = 'DOWN';
            opReason += `\nRSI DOWN  ${actualShortRSI.toFixed(3)} < ${actualLongdRSI.toFixed(3)}`;
        }

        // if (this.botRSIStatus === 'CROSS_UP' || (this.botRSIStatus === 'UP' && actualShortRSI < 60)) {
        if (
            this.botRSIStatus === 'CROSS_UP' &&
            upDayRSI &&
            actualLongDayRSI < 60 &&
            actualShortRSI < 50 &&
            actualEma19 > actualEma23
        ) {
            this.botIntention = 'BUY';
        } else if (this.botRSIStatus === 'CROSS_DOWN'
            || actualShortDayRSI > 70
            || actualShortRSI > 80
        ) {
            this.botIntention = 'SELL';
        }

        const csv = new CsvWriter('./results');

        let op = 'NONE';
        if (this.status == 'SOLD') {
            this.log(`Status: ${this.status} $${actualPrice.toFixed(2)} RSI L/S: ${actualLongdRSI.toFixed(3)}/${actualShortRSI.toFixed(3)} Intention L/S: ${this.botIntention}}`);


            // Check for buy signal
            // if (this.botIntention01dStatus == 'BUY' && this.botIntention01hStatus == 'BUY' && actualPrice > actualfast01hEMA) {
            if (this.botIntention == 'BUY') {
                op = 'BUY';
                // Ajusta o stopLossPercent dinamicamente conforme o actualShortRSI
                // Exemplo: Se actualShortRSI = 60, stopLossPercent = (100 - 60)% do original = 40% de stopLossPercent
                // Se actualShortRSI = 83, stopLossPercent = (100 - 83)% = 17% do stopLossPercent original
                const rsiPercent = Math.max(0, 100 - actualShortRSI) / 100;
                let stopLoss = this.config.stopLossPercent * rsiPercent;
                let stopGain = this.config.stopGainPercent * rsiPercent;

                let indicators = '\nINDICATORS:\n';
                indicators += `RSI Short/Long....: ${actualShortRSI.toFixed(3)}/${actualLongdRSI.toFixed(3)}\n`;
                indicators += `RSI Short/Long Day: ${actualShortDayRSI.toFixed(3)}/${actualLongDayRSI.toFixed(3)}\n`;
                indicators += `EMA S/L...........: ${actualEma19.toFixed(3)}/${actualEma23.toFixed(3)}\n`;
                indicators += `Stop Loss.........: ${(stopLoss * 100).toFixed(2)}%\n`;
                indicators += `Stop Gain.........: ${(stopGain * 100).toFixed(2)}%\n`;
                indicators += `Stop Loss Price...: ${(actualPrice * (1 - stopLoss)).toFixed(2)}\n`;
                indicators += `Stop Gain Price...: ${(actualPrice * (1 + stopGain)).toFixed(2)}\n`;
                indicators += `Trailing Stop Loss: ${(this.traillingStopActual * 100).toFixed(2)}%\n`;
                const buyPrice = this.openOperation(actualPrice, opReason, actualDate, indicators);
                this.stopLossPrice = buyPrice * (1 - stopLoss);
                this.stopGainPrice = buyPrice * (1 + stopGain);
                this.traillingStopActual = this.config.trailingStopLossPercent * rsiPercent;
            }
        } else if (this.status == 'BOUGHT') {

            let pl: number | null = null;
            let minimumProfitPrice: number | null = null;
            let minimumLossPrice: number | null = null;
            let minimumCriteria = false;
            let indicators = '\nINDICATORS:\n';
            indicators += `RSI Short/Long....: ${actualShortRSI.toFixed(3)}/${actualLongdRSI.toFixed(3)}\n`;
            indicators += `RSI Short/Long Day: ${actualShortDayRSI.toFixed(3)}/${actualLongDayRSI.toFixed(3)}\n`;
            indicators += `EMA S/L...........: ${actualEma19.toFixed(3)}/${actualEma23.toFixed(3)}\n`;

            if (this.buyPrice !== null) {
                pl = (actualPrice / this.buyPrice) - 1;

                if (pl > this.traillingStopActual && !this.trailingStopLossActive) {
                    this.trailingStopLossPrice = actualPrice * (1 - this.traillingStopActual);
                    this.trailingStopLossActive = true;
                    this.sendMessage(`Active Trailing Stop Loss at ${this.trailingStopLossPrice.toFixed(2)} ${(this.trailingStopLossPrice * 100).toFixed(3)}%`);
                }
                if (this.trailingStopLossActive) {
                    let newStopLossPrice = actualPrice * (1 - this.traillingStopActual);
                    if (this.trailingStopLossPrice !== null && newStopLossPrice > this.trailingStopLossPrice) {
                        this.trailingStopLossPrice = newStopLossPrice;
                        // console.log(`Change Trailing Stop Loss Price to ${this.trailingStopLossPrice.toFixed(2)} ${(((this.trailingStopLossPrice / this.buyPrice) - 1) * 100).toFixed(3)}% `);
                    }
                }
                minimumProfitPrice = this.buyPrice * (1 + this.config.minimumProfitPercent);
                minimumLossPrice = this.buyPrice * (1 - this.config.minimumProfitPercent);
                minimumCriteria = actualPrice > minimumProfitPrice || actualPrice < minimumLossPrice;
                this.log(`Status: ${this.status} $${actualPrice.toFixed(2)} PL: ${pl} RSI L/S: ${previoShortRSI.toFixed(3)}/${previoLongRSI.toFixed(3)} Intention L/S: ${this.botIntention}`);
            } else {
                console.error('Buy price is null, cannot calculate P/L or stop loss.');
                return;
            }
            // Check for sell signal
            if (this.botIntention === 'SELL' && minimumCriteria) {
                op = 'SELL';
                this.closeOperation(actualPrice, opReason, actualDate, indicators);
                // this.sendMessage(message);
            } else if (actualPrice < this.stopLossPrice && this.stopLossPrice > 0 && minimumCriteria) {
                // console.log(lastKline?.toString());
                op = 'SELL';
                this.trailingStopLossActive = false;
                this.closeOperation(this.stopLossPrice, `STOP LOSS ${opReason}`, actualDate, indicators);

            } else if (this.stopGainPrice && actualPrice > this.stopGainPrice && minimumCriteria) {
                op = 'SELL';
                this.trailingStopLossActive = false;
                // console.log(lastKline?.toString());
                this.closeOperation(actualPrice, `STOP GAIN ${opReason}`, actualDate, indicators);
            } else if (this.trailingStopLossActive && this.trailingStopLossPrice !== null && actualPrice < this.trailingStopLossPrice) {
                op = 'SELL';
                this.trailingStopLossActive = false;
                this.sendMessage(`Trailing Stop Loss triggered at ${actualPrice.toFixed(2)} with price ${this.trailingStopLossPrice.toFixed(2)}`);
                // console.log(lastKline?.toString());
                this.closeOperation(actualPrice, `TRAILING STOP LOSS ${opReason}`, actualDate, indicators);
            }

        }
        const sanitizedOpReason = opReason.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
        const header = 'Date,Symbol,Status,Price,ShortRSI,LongRSI,Intention,Operation,Reason';
        const row = `${actualDateString},${this.config.symbol},${this.status},${actualPrice.toFixed(2)},${previoShortRSI.toFixed(3)},${previoLongRSI.toFixed(3)},${this.botIntention},${op},${sanitizedOpReason}`;
        csv.writeCsv(this.csvFileName, header, row);
    }

    private openOperation(buyPrice: number, criteria: string, actualDate: number, indicators: string): number {
        const operation = new Operation(this.chatId, this.config.symbol, buyPrice, actualDate, criteria);
        this.operations.push(operation);
        this.status = 'BOUGHT';
        console.log(`------------------------------------------------------------`);
        this.sendMessage(operation.getBuyMessage(buyPrice));
        this.buyPrice = operation.buyPrice; // Set the buy price for future reference
        this.sendMessage(`${indicators}`);
        operation.save();
        return operation.buyPrice; // Return the buy price for further calculations
    }

    private closeOperation(sellPrice: number, criteria: string, actualDate: number, indicators: string): void {
        const operation = this.operations[this.operations.length - 1];
        if (operation) {
            operation.sell(sellPrice, actualDate, criteria);
            this.status = 'SOLD';
            this.sendMessage(operation.toString());
            this.buyPrice = null; // Reset buy price after selling
            operation.save();
        } else {
            console.error(`No operation to close. ${sellPrice} ${criteria} ignored.`);
            return;
        }

        this.sendMessage(`${indicators}`);


        let result = 1;
        let gains = 0;
        for (const op of this.operations) {
            if (op.sellPrice && op.buyPrice) {
                const pl = op.sellPrice / op.buyPrice;
                if (pl > 1) gains++;
                result *= pl;
            }
        }
        result = (result - 1) * 100; // Convert to percentage

        const message = `\nRESULT.......: ${result.toFixed(3)}%\nGAINS........: ${gains}/${this.operations.filter(op => op.sellPrice && op.buyPrice).length}`;
        this.sendMessage(message);
    }

    protected async configKlines(): Promise<void> {
        const klines = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval);
        await klines.fetchKlines();

        const openOperation = await Operation.getOpenOperation(this.chatId);
        if (openOperation) {
            this.operations.push(openOperation);
            this.status = 'BOUGHT';
            this.buyPrice = openOperation.buyPrice;
            this.sendMessage(`Open Operation found: ${openOperation.toString()}`);
        } else {
            this.status = 'SOLD';
            this.sendMessage('No open operations found, starting fresh.');
        }
    }

    protected getBotName(): string {
        return `RSI + SMA Bot(${this.config.symbol})`;
    }

    protected getBotConfig(): string {
        return this.config.toString();
    }

    getLastOperation(): Operation | null {
        return this.operations.length > 0 ? this.operations[this.operations.length - 1] : null;
    }
};

export { BotRSI, BotRSIConfig };