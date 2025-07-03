import { Bot, BotConfig } from "./Bot";
import DataManager from "./DataManager";
import { Interval } from './types';
import Indicators from './Indicators';
import Operation from './Operation';
import CsvWriter from "./CsvWriter";
import { addSecondsToDate, formatAllDate } from './utils';



export type StochRSIStatus =
    'CROSS_UP_KD' | // RSI short cruzou acima do longo
    'CROSS_DOWN_KD' | // RSI short cruzou abaixo do longo
    'UP_K_D' |  // RSI  short acima de long
    'DOWN_K_D';// // RSI short abaixo de long

export type EMAStatus =
    'CROSS_UP_EMA' | // EMA short cruzou acima do longo
    'CROSS_DOWN_EMA' | // EMA short cruzou abaixo do longo
    'UP_EMA' | // EMA short acima de long
    'DOWN_EMA';  // EMA short abaixo de long


export type IntentionStatus =
    'BUY' | // Intenção de compra
    'SELL' |
    'HOLD';  // Intenção de venda

class BotStochRSIConfig extends BotConfig {

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
        public interval: Interval = '1d',
        // Condifurações de Indicadores
        public emaShort: number = 3,
        public emaLong: number = 5,
        public stochRsiPeriod: number = 14,
        public kPeriod: number = 3,
        public dPeriod: number = 3,
        // Configuração de Riscos
        public stopLossPercent: number = 1 / 100, // 5% Stop Loss
        public stopGainPercent: number = 0.5 / 100, // 10% Stop Gain
        public trailingStopLossPercent: number = 0.3 / 100, // 2.5% Trailing Stop Loss
        public minimumProfitPercent: number = 0.3 / 100 // 0.5% Minimum Profit
    ) {
        super();
    }

    public toString(): string {
        return `
CONFIGURATION ${this.constructor.name}:
SYMBOL..........: ${this.symbol}
INTERVAL........: ${this.interval}
EMA SHORT.......: ${this.emaShort}
EMA LONG........: ${this.emaLong}
STOCH RSI PERIOD: ${this.stochRsiPeriod}
K PERIOD........: ${this.kPeriod}
D PERIOD........: ${this.dPeriod}
STOP LOSS.......: ${(this.stopLossPercent * 100).toFixed(2)}%
STOP GAIN.......: ${(this.stopGainPercent * 100).toFixed(2)}%
TRAILING STOP...: ${(this.trailingStopLossPercent * 100).toFixed(2)}%
MINIMUM P/L.....: ± ${(this.minimumProfitPercent * 100).toFixed(2)}%`;
    }
}


class BotStochRSI extends Bot {
    private config: BotStochRSIConfig; // Configuration for the bot

    private maxPrice = 0; // Maximum price reached during the operation

    // private traillingStopActual = 0;
    private trailingStopLossPrice = 0; // Price for trailing stop loss
    private trailingStopLossActive = false; // Whether trailing stop loss is active
    private stopLossPrice = 0; // Price for stop loss
    private stopGainPrice = 0; // Price for stop gain
    private buyPrice: number | null = null; // Price at which the bot bought

    private stochRSIStatus: StochRSIStatus = 'DOWN_K_D'; // Current status of the bot for short interval
    private emaStatus: EMAStatus = 'DOWN_EMA'; // Current status of the bot for long interval
    private intention: IntentionStatus = 'HOLD'; // Intention of the bot (buy or sell)

    private operations: Operation[] = []; // List of operations performed by the bot

    private gains: number = 0; // Total gains from operations
    private totalOperations: number = 0; // Total number of operations performed
    private plTotal: number = 1; // Total profit/loss from operation
    private lastSellDate: number = 0; // Date of the last buy operation
    private lastSellPrice: number = 0; // Price of the last buy operation
    private csvFileName: string;
    private csv: CsvWriter; // CSV writer for logging results

    private results: CsvWriter; // CSV writer for storing results
    private resultsFileName: string; // Name of the results CSV file
    private header: string; // Header for the CSV file
    private headerResult: string; // Header for the results CSV file
    constructor(chatId: number, config: BotStochRSIConfig) {
        super(chatId, 10);
        this.config = config;
        this.sendMessage(this.getBotConfig());
        this.header = '';
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}_${pad(now.getHours())}${pad(now.getMinutes())}`;
        this.csvFileName = `${dateStr}_${this.constructor.name}_${this.config.symbol}_${this.config.interval}.csv`;
        this.resultsFileName = `${dateStr}_${this.constructor.name}_${this.config.symbol}_${this.config.interval}_results.csv`;
        this.csv = new CsvWriter('./candles');
        this.results = new CsvWriter('./results');
        this.headerResult = this.config.toString();
    }

    protected async analyzeMarket(date: number = 0): Promise<void> {
        const i = new Indicators();
        const closes = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getClosePrices();
        const klines = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getKlines();

        const lastKline = klines[klines.length - 1];
        const openPrice = lastKline.open;
        const closePrice = lastKline.close;
        const highPrice = lastKline.high;
        const lowPrice = lastKline.low;
        const volume = lastKline.volume;
        // Convert to seconds

        const startTimes = DataManager.getInstance().getKlines(this.config.symbol, this.config.interval).getStartTimes();

        const actualDate = (date == 0) ? startTimes[startTimes.length - 1] / 1000 : date;
        const actualDateString = formatAllDate(actualDate);

        const logDate = new Date().getTime();

        // Check RSI Indicators Short Interval
        const stochRSIIndicator = i.calculateStochRSI(this.config.symbol, this.config.interval, this.config.stochRsiPeriod, this.config.kPeriod, this.config.dPeriod);
        const stochLength = stochRSIIndicator.stochRSI.length;
        const stochRSI = stochRSIIndicator.stochRSI[stochLength - 1];
        const stochK = stochRSIIndicator.k[stochLength - 1];
        const stochD = stochRSIIndicator.d[stochLength - 1];
        const previoStochRSI = stochRSIIndicator.stochRSI[stochLength - 2] || 0;
        const previoStochK = stochRSIIndicator.k[stochLength - 2] || 0;
        const previoStochD = stochRSIIndicator.d[stochLength - 2] || 0;

        const emaShortIndicator = i.calculateEMA(this.config.symbol, this.config.interval, this.config.emaShort);
        const emaLongIndicator = i.calculateEMA(this.config.symbol, this.config.interval, this.config.emaLong);
        const rsiShortIndicator = i.calculateRSI(this.config.symbol, this.config.interval, 3);
        const rsiLongIndicator = i.calculateRSI(this.config.symbol, this.config.interval, 5);

        const obvIndicator = i.calculateOBV(this.config.symbol, this.config.interval);


        const shortEma = emaShortIndicator[emaShortIndicator.length - 1] || 0;
        const longEma = emaLongIndicator[emaLongIndicator.length - 1] || 0;
        const previoShortEma = emaShortIndicator[emaShortIndicator.length - 2] || 0;
        const previoLongEma = emaLongIndicator[emaLongIndicator.length - 2] || 0;
        const obv = obvIndicator[obvIndicator.length - 1] || 0;
        const previoObv = obvIndicator[obvIndicator.length - 2] || 0;
        const rsiShort = rsiShortIndicator[rsiShortIndicator.length - 1] || 0;
        const rsiLong = rsiLongIndicator[rsiLongIndicator.length - 1] || 0;
        const previoRsiShort = rsiShortIndicator[rsiShortIndicator.length - 2] || 0;
        const previoRsiLong = rsiLongIndicator[rsiLongIndicator.length - 2] || 0;

        const crossUpRSI = previoRsiShort < previoRsiLong && rsiShort > rsiLong;
        const crossDownRSI = previoRsiShort > previoRsiLong && rsiShort < rsiLong;

        const crossUpKD = previoStochK < previoStochD && stochK > stochD;
        const crossDownKD = previoStochK > previoStochD && stochK < stochD;

        const crescentObv = previoObv < obv;

        const UpKD = stochK > stochD;
        const DownKD = stochK < stochD;

        const crossEma = previoShortEma < previoLongEma && shortEma > longEma;
        const crossDownEma = previoShortEma > previoLongEma && shortEma < longEma;
        const upEma = shortEma > longEma;
        const downEma = shortEma < longEma;

        let opReason = '';

        const actualPrice = closes[closes.length - 1] || 0;
        // console.log(stochRSI, stochK, stochD);

        if (crossUpKD) {
            this.stochRSIStatus = 'CROSS_UP_KD';
            opReason += `\nStoch RSI CROSS UP K/D ${stochK.toFixed(3)} > ${stochD.toFixed(3)}\nCROSS UP K/D Stoch RSI\nPrevious ${previoStochK.toFixed(3)}/${previoStochD.toFixed(3)}`;
        } else if (UpKD) {
            this.stochRSIStatus = 'UP_K_D';
            opReason += `\nStoch RSI UP K/D  ${stochK.toFixed(3)} > ${stochD.toFixed(3)}`;
        } else if (crossDownKD) {
            this.stochRSIStatus = 'CROSS_DOWN_KD';
            opReason += `\nStoch RSI CROSS DOWN K/D ${stochK.toFixed(3)} < ${stochD.toFixed(3)}\nCROSS DOWN K/D Stoch RSI\nPrevious ${previoStochK.toFixed(3)}/${previoStochD.toFixed(3)}`;
        } else if (DownKD) {
            this.stochRSIStatus = 'DOWN_K_D';
            opReason += `\nStoch RSI DOWN K/D  ${stochK.toFixed(3)} < ${stochD.toFixed(3)}`;
        }

        if (crossEma) {
            this.emaStatus = 'CROSS_UP_EMA';
            opReason += `\nEMA CROSS UP ${shortEma.toFixed(3)} > ${longEma.toFixed(3)}\nCROSS UP EMA\nPrevious ${previoShortEma.toFixed(3)}/${previoLongEma.toFixed(3)}`;
        } else if (upEma) {
            this.emaStatus = 'UP_EMA';
            opReason += `\nEMA UP ${shortEma.toFixed(3)} > ${longEma.toFixed(3)}\nPrevious ${previoShortEma.toFixed(3)}/${previoLongEma.toFixed(3)}`;
        } else if (crossDownEma) {
            this.emaStatus = 'CROSS_DOWN_EMA';
            opReason += `\nEMA CROSS DOWN ${shortEma.toFixed(3)} < ${longEma.toFixed(3)}\nCROSS DOWN EMA\nPrevious ${previoShortEma.toFixed(3)}/${previoLongEma.toFixed(3)}`;
        } else {
            this.emaStatus = 'DOWN_EMA';
            opReason += `\nEMA DOWN ${shortEma.toFixed(3)} < ${longEma.toFixed(3)}\nPrevious ${previoShortEma.toFixed(3)}/${previoLongEma.toFixed(3)}`;
        }

        const isStochRSICrossDown = (stochK < stochD) && (previoStochK > previoStochD);

        const isRSIDown = stochRSI < previoStochRSI;

        const isObvDescending = obv < previoObv;

        const isEmaReversal = shortEma < longEma &&
            previoShortEma > previoLongEma;

        const sellSignals = [
            isStochRSICrossDown,
            isRSIDown,
            isObvDescending,
            isEmaReversal,
            crossDownEma,
            crossDownRSI,
            rsiShort < rsiLong,
        ];

        const activeSellSignals = sellSignals.filter(Boolean).length;
        const ad = addSecondsToDate(actualDate, 0); // Add one day in seconds
        const ld = addSecondsToDate(this.lastSellDate, 60 * 60); // Add one day in seconds

        if (
            previoStochK > previoStochD &&
            stochK > stochD &&
            (upEma || crossEma) //&&
            // rsiShort > rsiLong &&
            // obv > previoObv &&
            // (this.lastSellPrice <= actualPrice || (ad && ld && ad > ld)) // Ensure at least one day has passed since last sell
        ) {
            this.intention = 'BUY';
        } else if (
            activeSellSignals >= 4 && this.buyPrice && actualPrice / this.buyPrice > 1) {
            this.intention = 'SELL';
        } else {
            this.intention = 'HOLD';
        }

        this.header = `Date,Status,Symbol,openPrice,highPrice,lowPrice,closPrice,volume,StochRSI,PrevioStochRSI,PrevioK,PrevioD,K,D,PrevioShortEma,PrevioLongEma,ShortEma,LongEma,PrevioObv,Obv,PrevioRsiShort,PrevioRsiLong,RsiShort,RsiLong`;
        const row = `${actualDateString},${this.status},${this.config.symbol},${openPrice},${highPrice},${lowPrice},${closePrice},${volume},${stochRSI.toFixed(3)},${previoStochRSI},${previoStochK.toFixed(3)},${previoStochD.toFixed(3)},${stochK.toFixed(3)},${stochD.toFixed(3)},${previoShortEma.toFixed(3)},${previoLongEma.toFixed(3)},${shortEma.toFixed(3)},${longEma.toFixed(3)},${previoObv.toFixed(3)}, ${obv.toFixed(2)},${previoRsiShort.toFixed(3)},${previoRsiLong.toFixed(3)},${rsiShort.toFixed(3)},${rsiLong.toFixed(3)}`;

        // this.csv.writeCsv(this.csvFileName, this.header, row);
        console.log(`[${formatAllDate(logDate)}] Kline o ${formatAllDate(actualDate)} o $${actualPrice.toFixed(2)} PK ${previoStochK.toFixed(3)} > PD ${previoStochD.toFixed(3)} ${previoStochK > previoStochD ? "OK!" : "NOK"} | K ${stochK.toFixed(3)} > D ${stochD.toFixed(3)} ${stochK > stochD ? "OK!" : "NOK"} | ${stochRSI.toFixed(3)} | ${this.intention} | ${this.status}`);

        if (this.status == 'SOLD') {


            // Check for buy signal
            // if (this.botIntention01dStatus == 'BUY' && this.botIntention01hStatus == 'BUY' && actualPrice > actualfast01hEMA) {
            if (this.intention == 'BUY') {
                const rsiPercent = Math.max(0, 100 - stochRSI) / 100;
                //* rsiPercent;
                this.maxPrice = actualPrice;
                const buyPrice = actualPrice * 1.001; // Add a TradeTax 

                this.stopLossPrice = buyPrice * (1 - this.config.stopLossPercent); // Set the stop loss price
                this.stopGainPrice = buyPrice * (1 + this.config.stopGainPercent); // Set the stop gain price
                this.config.trailingStopLossPercent; // Set the trailing stop loss percentage
                this.trailingStopLossPrice = buyPrice * (1 + this.config.trailingStopLossPercent); // Initialize trailing stop loss price to activate
                this.trailingStopLossActive = false;

                let indicators = '\nBUY INDICATORS:\n';
                indicators += `Stoch RSI K D RSI.: K ${stochK.toFixed(3)} D ${stochD.toFixed(3)} ${(((stochK / stochD) - 1) * 100).toFixed(2)}% RSI ${stochRSI.toFixed(3)} ${UpKD || crossUpKD ? "OK!" : "NOK"} ${previoStochRSI < stochRSI ? 'RSI_UP' : 'RSI DOWN'}\n`;
                indicators += `Stoch RSI Previous: K ${previoStochK.toFixed(3)} D ${previoStochD.toFixed(3)} ${(((previoStochK / previoStochD) - 1) * 100).toFixed(2)}% RSI ${previoStochRSI.toFixed(3)} ${UpKD || crossUpKD ? "OK!" : "NOK"}\n`;
                indicators += `OBV...............: ${obv.toFixed(2)} ${crescentObv ? "CRESCENTE" : "DECRESCENTE"} Previous ${previoObv.toFixed(2)}\n`;
                indicators += `RSI Short/Long....: ${rsiShort.toFixed(3)}/${rsiLong.toFixed(3)} ${(((rsiShort / rsiLong) - 1) * 100).toFixed(2)}% Previous ${previoRsiShort.toFixed(3)}/${previoRsiLong.toFixed(3)} ${(((previoRsiShort / previoRsiLong) - 1) * 100).toFixed(2)}%\n`;
                indicators += `EMA S/L...........: ${shortEma.toFixed(3)}/${longEma.toFixed(3)} ${(((longEma / shortEma) - 1) * 100).toFixed(2)}% ${upEma ? "OK!" : "!OK"} Previous ${previoShortEma.toFixed(3)}/${previoLongEma.toFixed(3)} ${(((previoLongEma / previoShortEma) - 1) * 100).toFixed(2)}%\n`;
                indicators += `Stop Loss.........: ${(this.config.stopLossPercent * 100).toFixed(2)}%\n`;
                indicators += `Stop Gain.........: ${(this.config.stopGainPercent * 100).toFixed(2)}%\n`;
                indicators += `Stop Loss Price...: ${this.stopLossPrice.toFixed(2)}\n`;
                indicators += `Stop Gain Price...: ${this.stopGainPrice.toFixed(2)}\n`;
                indicators += `trailing Price....: ${this.trailingStopLossPrice.toFixed(2)}\n`;
                this.buyPrice = this.openOperation(actualPrice, opReason, actualDate, indicators);

            }

        } else if (this.status == 'BOUGHT') {

            let pl: number | null = null;
            let minimumProfitPrice: number | null = null;
            let minimumLossPrice: number | null = null;
            let minimumCriteria = false;
            this.maxPrice = actualPrice > this.maxPrice ? actualPrice : this.maxPrice;


            let indicators = '\nSELL INDICATORS:\n';
            indicators += `Stoch RSI K D RSI.: K ${stochK.toFixed(3)} D ${stochD.toFixed(3)} RSI ${stochRSI.toFixed(3)} ${UpKD || crossUpKD ? "OK!" : "NOK"} ${previoStochRSI < stochRSI ? 'RSI_UP' : 'RSI DOWN'}\n`;
            indicators += `Stoch RSI Previous: K ${previoStochK.toFixed(3)} D ${previoStochD.toFixed(3)} RSI ${previoStochRSI.toFixed(3)} ${UpKD || crossUpKD ? "OK!" : "NOK"}\n`;
            indicators += `OBV...............: ${obv.toFixed(2)} ${crescentObv ? "CRESCENTE" : "DECRESCENTE"} Previous ${previoObv.toFixed(2)}\n`;
            indicators += `EMA S/L...........: ${shortEma.toFixed(3)}/${longEma.toFixed(3)} ${upEma ? "OK!" : "NOK"} Previous ${previoShortEma.toFixed(3)}/${previoLongEma.toFixed(3)}\n`;
            indicators += `RSI Short/Long....: ${rsiShort.toFixed(3)}/${rsiLong.toFixed(3)} Previous ${previoRsiShort.toFixed(3)}/${previoRsiLong.toFixed(3)}\n`;
            indicators += `Max Price.........: ${this.maxPrice.toFixed(2)} P/L ${this.buyPrice !== null ? (((this.maxPrice / this.buyPrice) - 1) * 100).toFixed(2) : 'N/A'}%\n`;
            indicators += `SELL SIGNS........: RSI CrossDown ${isStochRSICrossDown ? 'OK' : 'NOK'} isRSIDown ${isRSIDown ? 'OK' : 'NOK'} isObvDescending ${isObvDescending ? 'OK' : 'NOK'} isEmaReversal ${isEmaReversal ? 'OK' : 'NOK'} crossDownEma ${crossDownEma ? 'OK' : 'NOK'} crossDownRSI ${crossDownRSI ? 'OK' : 'NOK'} RSI Short < Long ${rsiShort < rsiLong ? 'OK' : 'NOK'}\n`;

            if (this.buyPrice !== null) {
                pl = (actualPrice / this.buyPrice) - 1;

                // if (pl > 0.02 && this.stopLossPrice < this.buyPrice * 1.003) {
                //     console.log(`STOP LOSS Change: ${pl.toFixed(3)}%`);
                //     this.stopLossPrice = this.buyPrice * 1.003;
                // }

                if (actualPrice > this.trailingStopLossPrice && !this.trailingStopLossActive) {
                    this.trailingStopLossPrice = actualPrice * (1 - this.config.trailingStopLossPercent);
                    this.trailingStopLossActive = true;
                    this.sendMessage(`Active Trailing Stop Loss at ${this.trailingStopLossPrice.toFixed(2)} ${(this.config.trailingStopLossPercent * 100).toFixed(3)}%`);
                    this.results.writeCsv(this.resultsFileName, this.headerResult, `Active Trailing Stop Loss at ${this.trailingStopLossPrice.toFixed(2)} ${(this.config.trailingStopLossPercent * 100).toFixed(3)}%`);
                }
                this.trailingStopLossActive = true;
                if (this.trailingStopLossActive) {
                    let newStopLossPrice = actualPrice * (1 - this.config.trailingStopLossPercent);
                    if (this.trailingStopLossPrice !== null && newStopLossPrice > this.trailingStopLossPrice) {
                        this.trailingStopLossPrice = newStopLossPrice;
                        // console.log(`Change Trailing Stop Loss Price to ${this.trailingStopLossPrice.toFixed(2)} ${(((this.trailingStopLossPrice / this.buyPrice) - 1) * 100).toFixed(3)}% `);
                        this.results.writeCsv(this.resultsFileName, this.headerResult, `Actual Price ${actualPrice} Change Trailing Stop Loss Price to ${this.trailingStopLossPrice.toFixed(2)} ${(((this.trailingStopLossPrice / this.buyPrice) - 1) * 100).toFixed(3)}% `);
                    }
                    this.stopLossPrice = this.trailingStopLossPrice; // Update stop loss price to trailing stop loss price
                }
                minimumProfitPrice = this.buyPrice * (1 + this.config.minimumProfitPercent);
                minimumLossPrice = this.buyPrice * (1 - this.config.minimumProfitPercent);
                minimumCriteria = actualPrice > minimumProfitPrice || actualPrice < minimumLossPrice;

            } else {
                console.error('Buy price is null, cannot calculate P/L or stop loss.');
                return;
            }
            indicators += `Minimum P/L.......: ${actualPrice} < ${minimumLossPrice} || ${actualPrice} > ${minimumProfitPrice} ${minimumCriteria ? 'OK' : 'NOT'}\n`;
            // Check for sell signal
            console.log(`[${formatAllDate(logDate)}] Kline ${formatAllDate(actualDate)} Price $${this.buyPrice.toFixed(2)} PL ${(pl * 100).toFixed(2)}% StopLoss ${this.stopLossPrice.toFixed(2)} (${((this.stopLossPrice / this.buyPrice - 1) * 100).toFixed(2)}%)`);
            if (this.intention === 'SELL' && minimumCriteria) {
                this.sendMessage(`SELL signal detected at ${actualPrice.toFixed(2)} with P/L ${(pl * 100).toFixed(2)}%`);
                this.closeOperation(actualPrice, opReason, actualDate, indicators);
                // this.sendMessage(message);
            } else if (actualPrice < this.stopLossPrice && this.stopLossPrice > 0 && minimumCriteria) {
                this.sendMessage(`STOP LOSS triggered at ${this.stopLossPrice.toFixed(2)} with price ${actualPrice.toFixed(2)}`);
                this.closeOperation(actualPrice, `STOP LOSS ${opReason}`, actualDate, indicators);

            } else if (this.stopGainPrice && actualPrice > this.stopGainPrice && minimumCriteria) {
                this.closeOperation(actualPrice, `STOP GAIN ${opReason}`, actualDate, indicators);
                this.sendMessage(`STOP GAIN triggered at ${this.stopGainPrice.toFixed(2)} with price ${actualPrice.toFixed(2)}`);
            }
            // else if (this.trailingStopLossActive && this.trailingStopLossPrice !== null && actualPrice < this.trailingStopLossPrice) {
            //     this.closeOperation(actualPrice, `TRAILING STOP LOSS ${opReason}`, actualDate, indicators);
            //     this.sendMessage(`Trailing Stop Loss triggered at ${actualPrice.toFixed(2)} with price ${this.trailingStopLossPrice.toFixed(2)}`);
            // }

        }
    }

    private openOperation(buyPrice: number, criteria: string, actualDate: number, indicators: string): number {
        const operation = new Operation(this.chatId, this.config.symbol, buyPrice, actualDate, criteria);
        this.operations.push(operation);
        this.status = 'BOUGHT';
        console.log(`------------------------------------------------------------`);

        this.sendMessage(operation.getBuyMessage(buyPrice));
        this.results.writeCsv(this.resultsFileName, this.headerResult, operation.getBuyMessage(buyPrice));
        this.buyPrice = operation.buyPrice; // Set the buy price for future reference
        this.sendMessage(`${indicators}`);
        this.results.writeCsv(this.resultsFileName, this.header, `------------------------------------------------------------`);
        this.results.writeCsv(this.resultsFileName, this.header, operation.getBuyMessage(buyPrice));
        this.results.writeCsv(this.resultsFileName, this.headerResult, indicators);
        operation.save();
        return operation.buyPrice; // Return the buy price for further calculations
    }

    private closeOperation(sellPrice: number, criteria: string, actualDate: number, indicators: string): void {
        const operation = this.operations[this.operations.length - 1];
        if (operation) {
            this.maxPrice = 0; // Reset max price after selling
            operation.sell(sellPrice, actualDate, criteria);
            indicators += `Trailing Stop Loss: ${(this.config.trailingStopLossPercent * 100).toFixed(2)}%\n`;
            this.trailingStopLossActive = false; // Reset trailing stop loss after selling
            this.status = 'SOLD';
            this.sendMessage(operation.toString());
            this.results.writeCsv(this.resultsFileName, this.headerResult, operation.toString());
            this.results.writeCsv(this.resultsFileName, this.header, indicators);
            this.buyPrice = null; // Reset buy price after selling
            const pl = ((operation.sellPrice / operation.buyPrice) - 1) * 100;
            this.lastSellDate = operation.sellDate;
            this.totalOperations++;
            this.plTotal *= (operation.sellPrice / operation.buyPrice);
            if (pl > 0) {
                this.gains++;
            }
            operation.save();

            const csvOperation = new CsvWriter('./operations');
            const timeLapse = (operation.sellDate - operation.buyDate) / 1000 / 60; // Convert to seconds
            const timeLapseBuy = (operation.buyDate - this.lastSellDate) / 1000 / 60; // Convert to seconds
            const headerOperation = 'TimeLapse(m)Buy, Buy Date, Sell Date, Time Lapse (m), Buy Price Actual, BuyPrice, Sell Price Actual, SellPrice,P/L (%),Total P/L (%),Gains/Lost';
            const row = `${timeLapseBuy},${formatAllDate(operation.buyDate)},${formatAllDate(operation.sellDate)},${timeLapse},${operation.actualBuyPrice},${operation.buyPrice.toFixed(2)},${operation.actualSellPrice},${operation.sellPrice.toFixed(2)},${pl.toFixed(3)}%,${((this.plTotal - 1) * 100).toFixed(3)}%,${this.gains}/${this.totalOperations}`;
            csvOperation.writeCsv("op_" + this.csvFileName, headerOperation, row);


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
        this.results.writeCsv(this.resultsFileName, this.headerResult, message);
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
        return this.constructor.name;
    }

    protected getBotConfig(): string {
        return this.config.toString();
    }

    getLastOperation(): Operation | null {
        return this.operations.length > 0 ? this.operations[this.operations.length - 1] : null;
    }

    public writeCsv(): void {
        this.results.writeCsv(this.resultsFileName, this.header, '');
        // for (const operation of this.operations) {
        //     const row = operation.toString();
        //     this.results.writeCsv(this.resultsFileName, this.header, row);
        // }
    }
};

export { BotStochRSI, BotStochRSIConfig };