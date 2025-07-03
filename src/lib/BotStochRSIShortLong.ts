import { Bot, BotConfig } from "./Bot";
import DataManager from "./DataManager";
import { Interval } from './types';
import Indicators from './Indicators';
import Operation from './Operation';
import CsvWriter from "./CsvWriter";
import { addSecondsToDate, formatAllDate } from './utils';
import Klines from "./Klines";



class BotStochRSIShortLongConfig extends BotConfig {

    constructor(
        public symbol: string,
        public shortInterval: Interval = '1m',
        public dayInterval: Interval = '1d',

        public dayEmaShort: number = 3, // EMA Short for 1D
        public dayEmaLong: number = 5,  // EMA Long for 1D

        public emaShort: number = 9, // EMA Short for 1m
        public emaLong: number = 21, // EMA Long for 1m

        public rsiShort: number = 14, // RSI Short for 1m
        public rsiLong: number = 28, // RSI Long for 1m


        public stochRsiPeriod: number = 14,
        public kPeriod: number = 3,
        public dPeriod: number = 3,
        // Configuração de Riscos
        public stopLossPercent: number = 5 / 100, // 5% Stop Loss
        public stopGainPercent: number = 20 / 100, // 10% Stop Gain
        public trailingStopLossPercent: number = 2.5 / 100, // 2.5% Trailing Stop Loss
        public minimumProfitPercent: number = 1 / 100, // 0.5% Minimum Profit
        public securityActiveGainPercent: number = 3 / 100, // 0.5% Security Gain - after gain more than 0.5% to avoid false positives
        public securityGainPercent: number = 2.5 / 100 // 0.25% Security Gain - after gain more than 0.25% to avoid false positives
    ) {
        super();
    }

    public toString(): string {
        return `
CONFIGURATION ${this.constructor.name}:
SYMBOL..........: ${this.symbol}
SHORT INTERVAL..: ${this.shortInterval}
LONG INTERVAL...: ${this.dayInterval}
EMA DAY SHORT...: ${this.dayEmaShort}
EMA DAY LONG....: ${this.dayEmaLong}
EMA SHORT.......: ${this.emaShort}
EMA LONG........: ${this.emaLong}
STOCH RSI PERIOD: ${this.stochRsiPeriod}
K PERIOD........: ${this.kPeriod}
D PERIOD........: ${this.dPeriod}
STOP LOSS.......: ${(this.stopLossPercent * 100).toFixed(2)}%
STOP GAIN.......: ${(this.stopGainPercent * 100).toFixed(2)}%
TRAILING STOP...: ${(this.trailingStopLossPercent * 100).toFixed(2)}%
MINIMUM P/L.....: ± ${(this.minimumProfitPercent * 100).toFixed(2)}%
SECURITY ACTIV..: ${(this.securityActiveGainPercent * 100).toFixed(2)}%
SECURITY GAIN...: ${(this.securityGainPercent * 100).toFixed(2)}%
`;
    }
}


class BotStochRSIShortLong extends Bot {
    private config: BotStochRSIShortLongConfig; // Configuration for the bot

    // private traillingStopActual = 0;
    private trailingStopLossPrice = 0; // Price for trailing stop loss
    private trailingStopLossActive = false; // Whether trailing stop loss is active
    private stopLossPrice = 0; // Price for stop loss
    private stopGainPrice = 0; // Price for stop gain
    private securityPrice = 0; // Price for security gain
    private activateSecurityPrice = 0; // Whether to activate security price
    private securityGainActive = false; // Whether security gain is active
    private buyPrice: number | null = null; // Price at which the bot bought

    private gains: number = 0; // Total gains from operations
    private totalOperations: number = 0; // Total number of operations performed
    private plTotal: number = 1; // Total profit/loss from operation
    private lastSellDate: number = 0; // Date of the last buy operation
    private lastSellPrice: number = 0; // Price of the last buy operation
    private lastBuyDate: number = 0; // Date of the last sell operation
    private lastBuyPrice: number = 0; // Price of the last sell operation

    private operations: Operation[] = []; // List of operations performed by the bot

    private intention: string = 'HOLD'; // Current intention of the bot (BUY, SELL, HOLD)


    private csvFileName: string;
    private csv: CsvWriter; // CSV writer for logging results

    private results: CsvWriter; // CSV writer for storing results
    private resultsFileName: string; // Name of the results CSV file
    private header: string; // Header for the CSV file
    private row: string;
    private headerResult: string; // Header for the results CSV file

    constructor(chatId: number, config: BotStochRSIShortLongConfig) {
        super(chatId, 10);
        this.config = config;
        this.sendMessage(this.getBotConfig());
        this.header = '';
        this.row = '';
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dateStr = `${pad(now.getDate())}${pad(now.getMonth() + 1)}_${pad(now.getHours())}${pad(now.getMinutes())}`;
        this.csvFileName = `${dateStr}_${this.constructor.name}_${this.config.symbol}_${this.config.shortInterval}.csv`;
        this.resultsFileName = `${dateStr}_${this.constructor.name}_${this.config.symbol}_${this.config.shortInterval}_results.csv`;
        this.csv = new CsvWriter('./candles');
        this.results = new CsvWriter('./results');
        this.headerResult = this.config.toString();

    }

    protected async analyzeMarket(date: number = 0): Promise<void> {
        const i = new Indicators();
        const dayKlines = DataManager.getInstance().getKlines(this.config.symbol, this.config.dayInterval);
        const minuteKlines = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval);
        const lastDayKline = dayKlines.getLastKline();
        const lastMinutesKline = minuteKlines.getLastKline();

        console.log(lastMinutesKline);
        console.log(lastDayKline);


        this.row = '';

        date == 0 ? date = new Date().getTime() : date = date;


        if (!lastDayKline) {
            console.error('lastDayKline is null');
            return;
        }

        const closePrice = lastDayKline.close;

        let actualDate: Date;
        let actualDateString: string;

        if (date !== 0) {
            const dateResult = addSecondsToDate(date, 0); // Use the open time of the last kline
            if (dateResult !== null) {
                actualDate = dateResult;
                actualDateString = formatAllDate(actualDate.getTime());

                this.row += `${actualDateString},`;
            } else {
                actualDate = new Date(date);
                actualDateString = formatAllDate(date);
                this.row += `${actualDateString},`;
            }
        } else {
            actualDate = new Date(); // fallback to current date if null
            actualDateString = formatAllDate(actualDate.getTime());
            this.row += `${actualDateString},`;
        }
        this.header = `Date,DayOpenTime,DayOpen,DayClose,DayHigh,DayLow,DayVolume,MinuteOpenTime,MinuteOpen,MinuteClose,MinuteHigh,MinuteLow,MinuteVolume,dayEmaShort${this.config.dayEmaShort},dayEmaLong${this.config.dayEmaLong},dayPrevioFastEMA,dayPrevioLongEMA,EmaSignal,DayStochRSI,DayK,DayD,DayPrevioStochRSI,DayPrevioK,DayPrevioD,StochRSISignal,DayRsiShort,DayRsiLong,DayPrevioRsiShort,DayRsiSignal,Obv01d,dayPrevioObv,dayCrescentObv,dayPrevioEmaShortObv,dayPrevioEmaLongObv,dayLastEmaShortObv,dayLastEmaLongObv,EmaSignal,StochRSI,K,D,PrevioStochRSI,PrevioK,PrevioD,StochRSISignal,ShortEma${this.config.emaShort},LongEma${this.config.emaLong},PrevioShortEma,PrevioLongEma,EmaSignal,RsiShort${this.config.rsiShort},RsiLong${this.config.rsiLong},PrevioRsiShort,PrevioRsiLong,RsiSignal,Obv,PrevioObv,CrescentObv,PrevioEmaShortObv,PrevioEmaLongObv,LastEmaShortObv,LastEmaLongObv,EmaSignal,ObvSignal,ayIndicatorsHeader + s
status,pl,`;
        this.row += `${lastDayKline.startTime},${lastDayKline.open},${lastDayKline.close},${lastDayKline.high},${lastDayKline.low},${lastDayKline.volume},`;
        this.row += `${lastMinutesKline?.startTime},${lastMinutesKline?.open},${lastMinutesKline?.close},${lastMinutesKline?.high},${lastMinutesKline?.low},${lastMinutesKline?.volume},`;




        const logDate = new Date().getTime();
        let dayIndicators: string = '';


        // Checking Day Indicators EMA
        const dayEmaShortIndicator = i.calculateEMA(
            this.config.symbol,
            this.config.dayInterval,
            this.config.dayEmaShort
        );
        const dayEmaLongIndicator = i.calculateEMA(
            this.config.symbol,
            this.config.dayInterval,
            this.config.dayEmaLong
        );
        const dayActualfastEMA = dayEmaShortIndicator[dayEmaShortIndicator.length - 1] || 0;

        dayIndicators += `${dayActualfastEMA.toFixed(3)},`;
        const dayActualLongEMA = dayEmaLongIndicator[dayEmaLongIndicator.length - 1] || 0;

        dayIndicators += `${dayActualLongEMA.toFixed(3)},`;
        const dayPrevioFastEMA = dayEmaShortIndicator[dayEmaShortIndicator.length - 2] || 0;

        dayIndicators += `${dayPrevioFastEMA.toFixed(3)},`;
        const dayPrevioLongEMA = dayEmaLongIndicator[dayEmaLongIndicator.length - 2] || 0;

        dayIndicators += `${dayPrevioLongEMA.toFixed(3)},`;
        const dayCrossUpEMA = dayPrevioFastEMA < dayPrevioLongEMA && dayActualfastEMA > dayActualLongEMA;
        const dayCrossDownEMA = dayPrevioFastEMA > dayPrevioLongEMA && dayActualfastEMA < dayActualLongEMA;
        const dayUpEMA = dayActualfastEMA > dayActualLongEMA;
        const dayDownEMA = dayActualfastEMA < dayActualLongEMA;
        const dayEmaStatus = dayCrossUpEMA ? "CROSS_UP_EMA" : dayCrossDownEMA ? "CROSS_DOWN_EMA" : dayUpEMA ? "UP_EMA" : dayDownEMA ? "DOWN_EMA" : "N/A";

        dayIndicators += `${dayEmaStatus},`;

        // Checking Day Stoch RSI Indicators
        const dayStochRSIIndicator = i.calculateStochRSI(
            this.config.symbol,
            this.config.dayInterval,
            this.config.stochRsiPeriod,
            this.config.kPeriod,
            this.config.dPeriod
        );

        const dayActualStochLength = dayStochRSIIndicator.stochRSI.length;
        const dayActualStochRSI = dayStochRSIIndicator.stochRSI[dayActualStochLength - 1];

        dayIndicators += `${dayActualStochRSI.toFixed(3)},`;
        const dayActualStochK = dayStochRSIIndicator.k[dayActualStochLength - 1];

        dayIndicators += `${dayActualStochK.toFixed(3)},`;
        const dayActualStochD = dayStochRSIIndicator.d[dayActualStochLength - 1];

        dayIndicators += `${dayActualStochD.toFixed(3)},`;
        const DayPrevioStochRSI = dayStochRSIIndicator.stochRSI[dayActualStochLength - 2] || 0;

        dayIndicators += `${DayPrevioStochRSI.toFixed(3)},`;
        const dayPrevioStochK = dayStochRSIIndicator.k[dayActualStochLength - 2] || 0;

        dayIndicators += `${dayPrevioStochK.toFixed(3)},`;
        const dayPrevioStochD = dayStochRSIIndicator.d[dayActualStochLength - 2] || 0;

        dayIndicators += `${dayPrevioStochD.toFixed(3)},`;
        const dayCrossUpKD = dayPrevioStochK < dayPrevioStochD && dayActualStochK > dayActualStochD;
        const dayCrossDownKD = dayPrevioStochK > dayPrevioStochD && dayActualStochK < dayActualStochD;
        const dayUpKD = dayActualStochK > dayActualStochD;
        const dayDownKD = dayActualStochK < dayActualStochD;
        const dayKDStatus = dayCrossUpKD ? "CROSS_UP_KD" : dayCrossDownKD ? "CROSS_DOWN_KD" : dayUpKD ? "UP_KD" : dayDownKD ? "DOWN_KD" : "N/A";

        dayIndicators += `${dayKDStatus},`;

        // Checking Day RSI Indicators
        const dayRsiShortIndicator = i.calculateRSI(
            this.config.symbol,
            this.config.dayInterval,
            this.config.rsiShort
        );
        const dayRsiLongIndicator = i.calculateRSI(
            this.config.symbol,
            this.config.dayInterval,
            this.config.rsiLong
        );
        const dayRsiShort = dayRsiShortIndicator[dayRsiShortIndicator.length - 1] || 0;

        dayIndicators += `${dayRsiShort.toFixed(3)},`;
        const dayRsiLong = dayRsiLongIndicator[dayRsiLongIndicator.length - 1] || 0;

        dayIndicators += `${dayRsiLong.toFixed(3)},`;
        const dayPrevioRsiShort = dayRsiShortIndicator[dayRsiShortIndicator.length - 2] || 0;

        dayIndicators += `${dayPrevioRsiShort.toFixed(3)},`;
        const dayPrevioRsiLong = dayRsiLongIndicator[dayRsiLongIndicator.length - 2] || 0;

        dayIndicators += `${dayPrevioRsiLong.toFixed(3)},`;
        const dayCrossUpRSI = dayPrevioRsiShort < dayPrevioRsiLong && dayRsiShort > dayRsiLong;
        const dayCrossDownRSI = dayPrevioRsiShort > dayPrevioRsiLong && dayRsiShort < dayRsiLong;
        const dayUpRSI = dayRsiShort > dayRsiLong;
        const dayDownRSI = dayRsiShort < dayRsiLong;
        const dayRsiStatus = dayCrossUpRSI ? "CROSS_UP_RSI" : dayCrossDownRSI ? "CROSS_DOWN_RSI" : dayUpRSI ? "UP_RSI" : dayDownRSI ? "DOWN_RSI" : "N/A";
        dayIndicators += `${dayRsiStatus},`;


        // Checking Day OBV Indicator
        const dayObvIndicator = i.calculateOBV(this.config.symbol, this.config.dayInterval);
        const dayLastObv = dayObvIndicator[dayObvIndicator.length - 1] || 0;
        const dayPrevioObv = dayObvIndicator[dayObvIndicator.length - 2] || 0;
        const dayCrescentObv = dayLastObv > dayPrevioObv;
        dayIndicators += `${dayLastObv.toFixed(2)},${dayPrevioObv.toFixed(2)},${dayCrescentObv ? "CRESCENTE" : "DECRESCENTE"},`;
        const dayObvEmaShort = i.calculateEMA(
            this.config.symbol,
            this.config.dayInterval,
            this.config.emaShort,
            dayObvIndicator
        );
        const dayObvEmaLong = i.calculateEMA(
            this.config.symbol,
            this.config.dayInterval,
            this.config.emaLong,
            dayObvIndicator
        );
        const dayLastEmaShortObv = dayObvEmaShort[dayObvEmaShort.length - 1] || 0;
        const dayLastEmaLongObv = dayObvEmaLong[dayObvEmaLong.length - 1] || 0;
        const dayPrevioEmaShortObv = dayObvEmaShort[dayObvEmaShort.length - 2] || 0;
        const dayPrevioEmaLongObv = dayObvEmaLong[dayObvEmaLong.length - 2] || 0;


        dayIndicators += `${dayPrevioEmaShortObv.toFixed(3)},${dayPrevioEmaLongObv.toFixed(3)},${dayLastEmaShortObv.toFixed(3)},${dayLastEmaLongObv.toFixed(3)},`;

        const dayCrossUpObv = dayPrevioEmaShortObv < dayPrevioEmaLongObv && dayLastEmaShortObv > dayLastEmaLongObv;
        const dayCrossDownObv = dayPrevioEmaShortObv > dayPrevioEmaLongObv && dayLastEmaShortObv < dayLastEmaLongObv;
        dayIndicators += dayCrossUpObv ? "CROSS_UP_OBV_EMA" : dayCrossDownObv ? "CROSS_DOWN_OBV_EMA" : dayLastEmaShortObv > dayLastEmaLongObv ? "UP_OBV_EMA" : dayLastEmaShortObv < dayLastEmaLongObv ? "DOWN_OBV_EMA" : "N/A";


        let shortIndicators: string = '';

        // Check RSI Indicators Short Interval
        const stochRSIIndicator = i.calculateStochRSI(
            this.config.symbol, this.config.shortInterval,
            this.config.stochRsiPeriod,
            this.config.kPeriod, this.config.dPeriod
        );
        const stochLength = stochRSIIndicator.stochRSI.length;
        const stochRSI = stochRSIIndicator.stochRSI[stochLength - 1];
        const stochK = stochRSIIndicator.k[stochLength - 1];
        const stochD = stochRSIIndicator.d[stochLength - 1];
        shortIndicators += `${stochRSI.toFixed(3)},${stochK.toFixed(3)},${stochD.toFixed(3)},`;

        const previoStochRSI = stochRSIIndicator.stochRSI[stochLength - 2] || 0;
        const previoStochK = stochRSIIndicator.k[stochLength - 2] || 0;
        const previoStochD = stochRSIIndicator.d[stochLength - 2] || 0;

        shortIndicators += `${previoStochRSI.toFixed(3)},${previoStochK.toFixed(3)},${previoStochD.toFixed(3)},`;
        const crossUpKD = previoStochK < previoStochD && stochK > stochD;
        const crossDownKD = previoStochK > previoStochD && stochK < stochD;
        const upKD = stochK > stochD;
        const downKD = stochK < stochD;
        const stochKDStatus = crossUpKD ? "CROSS_UP_KD" : crossDownKD ? "CROSS_DOWN_KD" : upKD ? "UP_KD" : downKD ? "DOWN_KD" : "N/A";


        // Calculate EMA Indicators
        const emaShortIndicator = i.calculateEMA(
            this.config.symbol,
            this.config.shortInterval,
            this.config.emaShort
        );
        const emaLongIndicator = i.calculateEMA(this.config.symbol, this.config.shortInterval, this.config.emaLong);
        const shortEma = emaShortIndicator[emaShortIndicator.length - 1] || 0;
        const longEma = emaLongIndicator[emaLongIndicator.length - 1] || 0;
        const previoShortEma = emaShortIndicator[emaShortIndicator.length - 2] || 0;
        const previoLongEma = emaLongIndicator[emaLongIndicator.length - 2] || 0;

        shortIndicators += `${shortEma.toFixed(3)},${longEma.toFixed(3)},${previoShortEma.toFixed(3)},${previoLongEma.toFixed(3)},`;
        const crossUpEma = previoShortEma < previoLongEma && shortEma > longEma;
        const crossDownEma = previoShortEma > previoLongEma && shortEma < longEma;
        const upEma = shortEma > longEma;
        const downEma = shortEma < longEma;
        const emaStatus = crossUpEma ? "CROSS_UP_EMA" : crossDownEma ? "CROSS_DOWN_EMA" : upEma ? "UP_EMA" : downEma ? "DOWN_EMA" : "N/A";

        shortIndicators += `${emaStatus},`;

        // Calculate RSI Indicators
        const rsiShortIndicator = i.calculateRSI(
            this.config.symbol,
            this.config.shortInterval,
            this.config.rsiShort
        );
        const rsiLongIndicator = i.calculateRSI(
            this.config.symbol,
            this.config.shortInterval,
            this.config.rsiLong
        );

        const rsiShort = rsiShortIndicator[rsiShortIndicator.length - 1] || 0;
        const rsiLong = rsiLongIndicator[rsiLongIndicator.length - 1] || 0;
        const previoRsiShort = rsiShortIndicator[rsiShortIndicator.length - 2] || 0;
        const previoRsiLong = rsiLongIndicator[rsiLongIndicator.length - 2] || 0;

        shortIndicators += `${rsiShort.toFixed(3)},${rsiLong.toFixed(3)},${previoRsiShort.toFixed(3)},${previoRsiLong.toFixed(3)},`;
        const crossUpRSI = previoRsiShort < previoRsiLong && rsiShort > rsiLong;
        const crossDownRSI = previoRsiShort > previoRsiLong && rsiShort < rsiLong;
        const upRSI = rsiShort > rsiLong;
        const downRSI = rsiShort < rsiLong;
        const rsiStatus = crossUpRSI ? "CROSS_UP_RSI" : crossDownRSI ? "CROSS_DOWN_RSI" : upRSI ? "UP_RSI" : downRSI ? "DOWN_RSI" : "N/A";

        shortIndicators += `${rsiStatus},`;


        // Check OBV Indicator
        const obvIndicator = i.calculateOBV(this.config.symbol, this.config.shortInterval);
        const lastObv = obvIndicator[obvIndicator.length - 1] || 0;
        const previoObv = obvIndicator[obvIndicator.length - 2] || 0;
        const crescentObv = lastObv > previoObv;

        shortIndicators += `${lastObv.toFixed(2)},${previoObv.toFixed(2)},${crescentObv ? "CRESCENTE" : "DECRESCENTE"},`;
        const crescentObvStatus = crescentObv ? "CRESCENTE" : "DECRESCENTE";

        const emaShortObv = i.calculateEMA(
            this.config.symbol,
            this.config.shortInterval,
            this.config.emaShort,
            obvIndicator
        );
        const emaLongObv = i.calculateEMA(
            this.config.symbol,
            this.config.shortInterval,
            this.config.emaLong,
            obvIndicator
        );
        const lastEmaShortObv = emaShortObv[emaShortObv.length - 1] || 0;
        const lastEmaLongObv = emaLongObv[emaLongObv.length - 1] || 0;
        const previoEmaShortObv = emaShortObv[emaShortObv.length - 2] || 0;
        const previoEmaLongObv = emaLongObv[emaLongObv.length - 2] || 0;

        shortIndicators += `${previoEmaShortObv.toFixed(3)},${previoEmaLongObv.toFixed(3)},${lastEmaShortObv.toFixed(3)},${lastEmaLongObv.toFixed(3)},`;
        const crossUpObv = previoEmaShortObv < previoEmaLongObv && lastEmaShortObv > lastEmaLongObv;
        const crossDownObv = previoEmaShortObv > previoEmaLongObv && lastEmaShortObv < lastEmaLongObv;
        const upObv = lastEmaShortObv > lastEmaLongObv;
        const downObv = lastEmaShortObv < lastEmaLongObv;
        const obvStatus = crossUpObv ? "CROSS_UP_OBV_EMA" : crossDownObv ? "CROSS_DOWN_OBV_EMA" : upObv ? "UP_OBV_EMA" : downObv ? "DOWN_OBV_EMA" : "N/A";

        shortIndicators += `${obvStatus},`;

        let opBuyReason = ``;
        const dayBuySignals = [
            (dayCrossUpEMA || dayUpEMA),
            (dayCrossUpKD || dayUpKD),
            (dayCrossUpObv || dayCrescentObv),
            (dayCrossUpRSI || dayUpRSI),
            dayActualStochK > dayPrevioStochK && dayActualStochD > dayPrevioStochD,
            // dayActualStochRSI < 90, 
            // DayPrevioStochRSI < 90,
            // dayRsiShort < 60

        ];

        const dayBuyActiveSignal = dayBuySignals.filter(Boolean).length >= 5;


        const buySignals = [
            (crossUpEma || upEma),
            (crossUpKD || upKD),
            (crossUpObv || crescentObv),
            (crossUpRSI || upRSI),
        ];

        const activeBuySignals = buySignals.filter(Boolean).length >= 3 && stochK > previoStochK && stochD > previoStochD;

        opBuyReason += `Day Buy Signals: ${dayBuySignals.filter(Boolean).length} | `;
        opBuyReason += `Day Cross Up EMA: ${dayCrossUpEMA ? "YES" : "NO"} | `;
        opBuyReason += `Day Up EMA: ${dayUpEMA ? "YES" : "NO"} | `;
        opBuyReason += `Day Cross Up KD: ${dayCrossUpKD ? "YES" : "NO"} | `;
        opBuyReason += `Day Up KD: ${dayUpKD ? "YES" : "NO"} | `;
        opBuyReason += `Day Cross Up OBV: ${dayCrossUpObv ? "YES" : "NO"} | `;
        opBuyReason += `Day Crescent OBV: ${dayCrescentObv ? "YES" : "NO"} | `;
        opBuyReason += `Day Cross Up RSI: ${dayCrossUpRSI ? "YES" : "NO"} | `;
        opBuyReason += `Day Up RSI: ${dayUpRSI ? "YES" : "NO"} | `;
        opBuyReason += `Short Buy Signals: ${buySignals.filter(Boolean).length} | `;
        opBuyReason += `Cross Up EMA: ${crossUpEma ? "YES" : "NO"} | `;
        opBuyReason += `Up EMA: ${upEma ? "YES" : "NO"} | `;
        opBuyReason += `Cross Up KD: ${crossUpKD ? "YES" : "NO"} | `;
        opBuyReason += `Up KD: ${upKD ? "YES" : "NO"} | `;
        opBuyReason += `Cross Up OBV: ${crossUpObv ? "YES" : "NO"} | `;
        opBuyReason += `Crescent OBV: ${crescentObvStatus} | `;
        opBuyReason += `Cross Up RSI: ${crossUpRSI ? "YES" : "NO"} | `;
        opBuyReason += `Up RSI: ${upRSI ? "YES" : "NO"} | `;


        const daySellSignals = [
            (dayCrossDownEMA || dayDownEMA),
            (dayCrossDownKD || dayDownKD),
            (dayCrossDownObv || !dayCrescentObv),
            (dayCrossDownRSI || dayDownRSI),
        ];

        const dayActiveSellSignals = daySellSignals.filter(Boolean).length >= 2;

        const sellSignals = [
            (crossDownEma || downEma),
            (crossDownKD || downKD),
            (crossDownObv || !crescentObv),
            (crossDownRSI || downRSI),
        ];

        const activeSellSignals = sellSignals.filter(Boolean).length >= 4;

        let opSellReason = ``;
        opSellReason += `Day Sell Signals: ${daySellSignals.filter(Boolean).length} | `;
        opSellReason += `Day Cross Down EMA: ${dayCrossDownEMA ? "YES" : "NO"} | `;
        opSellReason += `Day Down EMA: ${dayDownEMA ? "YES" : "NO"} | `;
        opSellReason += `Day Cross Down KD: ${dayCrossDownKD ? "YES" : "NO"} | `;
        opSellReason += `Day Down KD: ${dayDownKD ? "YES" : "NO"} | `;
        opSellReason += `Day Cross Down OBV: ${dayCrossDownObv ? "YES" : "NO"} | `;
        opSellReason += `Day Crescent OBV: ${dayCrescentObv ? "YES" : "NO"} | `;
        opSellReason += `Day Cross Down RSI: ${dayCrossDownRSI ? "YES" : "NO"} | `;
        opSellReason += `Day Down RSI: ${dayDownRSI ? "YES" : "NO"} | `;
        opSellReason += `Short Sell Signals: ${sellSignals.filter(Boolean).length} | `;
        opSellReason += `Cross Down EMA: ${crossDownEma ? "YES" : "NO"} | `;
        opSellReason += `Down EMA: ${downEma ? "YES" : "NO"} | `;
        opSellReason += `Cross Down KD: ${crossDownKD ? "YES" : "NO"} | `;
        opSellReason += `Down KD: ${downKD ? "YES" : "NO"} | `;
        opSellReason += `Cross Down OBV: ${crossDownObv ? "YES" : "NO"} | `;
        opSellReason += `Crescent OBV: ${crescentObvStatus} | `;
        opSellReason += `Cross Down RSI: ${crossDownRSI ? "YES" : "NO"} | `;
        opSellReason += `Down RSI: ${downRSI ? "YES" : "NO"} | `;


        if (dayBuyActiveSignal && activeBuySignals && !activeSellSignals && !dayActiveSellSignals) {
            this.intention = 'BUY';
        } else if (dayActiveSellSignals || activeSellSignals || !dayBuyActiveSignal || !activeBuySignals) {
            this.intention = 'SELL';
        } else {
            this.intention = 'HOLD';
        }



        this.row += dayIndicators + shortIndicators;

        // console.log(`$ Kline o ${formatAllDate(actualDate)} o $${closePrice.toFixed(2)} PK ${previoStochK.toFixed(3)} > PD ${previoStochD.toFixed(3)} ${previoStochK > previoStochD ? "OK!" : "NOK"} | K ${stochK.toFixed(3)} > D ${stochD.toFixed(3)} ${stochK > stochD ? "OK!" : "NOK"} | ${stochRSI.toFixed(3)} | ${this.intention} | ${this.status}`);
        console.log(this.row);
        if (this.status == 'SOLD') {
            // Check for buy signal
            // if (this.botIntention01dStatus == 'BUY' && this.botIntention01hStatus == 'BUY' && closePrice > actualfast01hEMA) {
            if (this.intention == 'BUY') {

                this.stopLossPrice = closePrice * (1 - this.config.stopLossPercent); // Set the stop loss price
                this.stopGainPrice = closePrice * (1 + this.config.stopGainPercent); // Set the stop gain price
                this.config.trailingStopLossPercent; // Set the trailing stop loss percentage
                this.trailingStopLossPrice = closePrice * (1 - this.config.trailingStopLossPercent); // Initialize trailing stop loss price to activate
                this.trailingStopLossActive = true;
                this.securityPrice = closePrice * (1 + this.config.securityGainPercent); // Set the security price
                this.activateSecurityPrice = closePrice * (1 + this.config.securityActiveGainPercent); // Set the activate security price


                let indicators = '\nBUY INDICATORS DAY:\n';
                indicators += `Stoch RSI K D RSI.: K ${dayActualStochK.toFixed(3)} D ${dayActualStochD.toFixed(3)} RSI ${dayActualStochRSI.toFixed(3)} ${dayCrossUpKD || dayUpKD ? "OK!" : "NOK"}\n`;
                indicators += `Stoch RSI Previous: K ${dayPrevioStochK.toFixed(3)} D ${dayPrevioStochD.toFixed(3)} RSI ${DayPrevioStochRSI.toFixed(3)} ${dayCrossUpKD || dayUpKD ? "OK!" : "NOK"}\n`;
                indicators += `OBV...............: ${dayLastObv.toFixed(2)} ${dayCrescentObv ? "CRESCENTE" : "DECRESCENTE"} Previous ${dayPrevioObv.toFixed(2)}\n`;
                indicators += `OBV EMA Short/Long: ${dayLastEmaShortObv.toFixed(3)}/${dayLastEmaLongObv.toFixed(3)} ${dayCrossUpObv ? "OK!" : "NOK"} Previous ${dayPrevioEmaShortObv.toFixed(3)}/${dayPrevioEmaLongObv.toFixed(3)}\n`;
                indicators += `RSI Short/Long....: ${dayRsiShort.toFixed(3)}/${dayRsiLong.toFixed(3)} Previous ${dayPrevioRsiShort.toFixed(3)}/${dayPrevioRsiLong.toFixed(3)}\n`;
                indicators += `EMA S/L...........: ${dayActualfastEMA.toFixed(3)}/${dayActualLongEMA.toFixed(3)} ${dayUpEMA ? "OK!" : "NOK"} Previous ${dayPrevioFastEMA.toFixed(3)}/${dayPrevioLongEMA.toFixed(3)}\n`;

                indicators += '\nBUY INDICATORS SHORT:\n';
                indicators += `Stoch RSI K D RSI.: K ${stochK.toFixed(3)} D ${stochD.toFixed(3)} RSI ${stochRSI.toFixed(3)} ${crossUpKD || upKD ? "OK!" : "NOK"}\n`;
                indicators += `Stoch RSI Previous: K ${previoStochK.toFixed(3)} D ${previoStochD.toFixed(3)} RSI ${previoStochRSI.toFixed(3)}\n`;
                indicators += `OBV...............: ${lastObv.toFixed(2)} ${crescentObv ? "CRESCENTE" : "DECRESCENTE"} Previous ${previoObv.toFixed(2)}\n`;
                indicators += `OBV EMA Short/Long: ${lastEmaShortObv.toFixed(3)}/${lastEmaLongObv.toFixed(3)} ${crossUpObv ? "OK!" : "NOK"} Previous ${previoEmaShortObv.toFixed(3)}/${previoEmaLongObv.toFixed(3)}\n`;
                indicators += `RSI Short/Long....: ${rsiShort.toFixed(3)}/${rsiLong.toFixed(3)} Previous ${previoRsiShort.toFixed(3)}/${previoRsiLong.toFixed(3)}\n`;
                indicators += `EMA S/L...........: ${shortEma.toFixed(3)}/${longEma.toFixed(3)} ${upEma ? "OK!" : "NOK"} Previous ${previoShortEma.toFixed(3)}/${previoLongEma.toFixed(3)}\n`;

                indicators += `Stop Loss.........: ${(this.config.stopLossPercent * 100).toFixed(2)}%\n`;
                indicators += `Stop Gain.........: ${(this.config.stopGainPercent * 100).toFixed(2)}%\n`;
                indicators += `Stop Loss Price...: ${this.stopLossPrice.toFixed(2)}\n`;
                indicators += `Stop Gain Price...: ${this.stopGainPrice.toFixed(2)}\n`;
                indicators += `trailing Price....: ${this.trailingStopLossPrice.toFixed(2)}\n`;

                this.buyPrice = this.openOperation(closePrice, opBuyReason, date, indicators);

            }

        } else if (this.status == 'BOUGHT') {

            let pl: number | null = null;
            let minimumProfitPrice: number | null = null;
            let minimumLossPrice: number | null = null;
            let minimumCriteria = false;
            // this.maxPrice = closePrice > this.maxPrice ? closePrice : this.maxPrice;

            let indicators = '\nSELL INDICATORS DAY:\n';
            indicators += `Stoch RSI K D RSI.: K ${dayActualStochK.toFixed(3)} D ${dayActualStochD.toFixed(3)} RSI ${dayActualStochRSI.toFixed(3)} ${dayCrossUpKD || dayUpKD ? "OK!" : "NOK"}\n`;
            indicators += `Stoch RSI Previous: K ${dayPrevioStochK.toFixed(3)} D ${dayPrevioStochD.toFixed(3)} RSI ${DayPrevioStochRSI.toFixed(3)} ${dayCrossUpKD || dayUpKD ? "OK!" : "NOK"}\n`;
            indicators += `OBV...............: ${dayLastObv.toFixed(2)} ${dayCrescentObv ? "CRESCENTE" : "DECRESCENTE"} Previous ${dayPrevioObv.toFixed(2)}\n`;
            indicators += `OBV EMA Short/Long: ${dayLastEmaShortObv.toFixed(3)}/${dayLastEmaLongObv.toFixed(3)} ${dayCrossUpObv ? "OK!" : "NOK"} Previous ${dayPrevioEmaShortObv.toFixed(3)}/${dayPrevioEmaLongObv.toFixed(3)}\n`;
            indicators += `RSI Short/Long....: ${dayRsiShort.toFixed(3)}/${dayRsiLong.toFixed(3)} Previous ${dayPrevioRsiShort.toFixed(3)}/${dayPrevioRsiLong.toFixed(3)}\n`;
            indicators += `EMA S/L...........: ${dayActualfastEMA.toFixed(3)}/${dayActualLongEMA.toFixed(3)} ${dayUpEMA ? "OK!" : "NOK"} Previous ${dayPrevioFastEMA.toFixed(3)}/${dayPrevioLongEMA.toFixed(3)}\n`;

            indicators += '\nSELL INDICATORS SHORT:\n';
            indicators += `Stoch RSI K D RSI.: K ${stochK.toFixed(3)} D ${stochD.toFixed(3)} RSI ${stochRSI.toFixed(3)} ${crossUpKD || upKD ? "OK!" : "NOK"}\n`;
            indicators += `Stoch RSI Previous: K ${previoStochK.toFixed(3)} D ${previoStochD.toFixed(3)} RSI ${previoStochRSI.toFixed(3)}`;
            indicators += `OBV...............: ${lastObv.toFixed(2)} ${crescentObv ? "CRESCENTE" : "DECRESCENTE"} Previous ${previoObv.toFixed(2)}\n`;
            indicators += `OBV EMA Short/Long: ${lastEmaShortObv.toFixed(3)}/${lastEmaLongObv.toFixed(3)} ${crossUpObv ? "OK!" : "NOK"} Previous ${previoEmaShortObv.toFixed(3)}/${previoEmaLongObv.toFixed(3)}\n`;
            indicators += `RSI Short/Long....: ${rsiShort.toFixed(3)}/${rsiLong.toFixed(3)} Previous ${previoRsiShort.toFixed(3)}/${previoRsiLong.toFixed(3)}\n`;
            indicators += `EMA S/L...........: ${shortEma.toFixed(3)}/${longEma.toFixed(3)} ${upEma ? "OK!" : "NOK"} Previous ${previoShortEma.toFixed(3)}/${previoLongEma.toFixed(3)}\n`;

            indicators += `Stop Loss.........: ${(this.config.stopLossPercent * 100).toFixed(2)}%\n`;
            indicators += `Stop Gain.........: ${(this.config.stopGainPercent * 100).toFixed(2)}%\n`;
            indicators += `Stop Loss Price...: ${this.stopLossPrice.toFixed(2)}\n`;
            indicators += `Stop Gain Price...: ${this.stopGainPrice.toFixed(2)}\n`;
            indicators += `trailing Price....: ${this.trailingStopLossPrice.toFixed(2)}\n`;

            if (this.buyPrice !== null) {
                pl = (closePrice / this.buyPrice) - 1;


                if (closePrice > this.activateSecurityPrice && this.securityPrice > 0) {
                    this.sendMessage(`SECURITY Price activated at ${this.securityPrice.toFixed(2)} with price ${closePrice.toFixed(2)}`);
                    this.securityGainActive = true;
                }
                // if (pl > 0.02 && this.stopLossPrice < this.buyPrice * 1.003) {
                //     console.log(`STOP LOSS Change: ${pl.toFixed(3)}%`);
                //     this.stopLossPrice = this.buyPrice * 1.003;
                // }

                if (closePrice > this.trailingStopLossPrice && !this.trailingStopLossActive) {
                    this.trailingStopLossPrice = closePrice * (1 - this.config.trailingStopLossPercent);
                    this.trailingStopLossActive = true;
                    this.sendMessage(`Active Trailing Stop Loss at ${this.trailingStopLossPrice.toFixed(2)} ${(this.config.trailingStopLossPercent * 100).toFixed(3)}%`);
                    // this.results.writeCsv(this.resultsFileName, this.headerResult, `Active Trailing Stop Loss at ${this.trailingStopLossPrice.toFixed(2)} ${(this.config.trailingStopLossPercent * 100).toFixed(3)}%`);
                }
                this.trailingStopLossActive = true;
                if (this.trailingStopLossActive) {
                    let newStopLossPrice = closePrice * (1 - this.config.trailingStopLossPercent);
                    if (this.trailingStopLossPrice !== null && newStopLossPrice > this.trailingStopLossPrice) {
                        this.trailingStopLossPrice = newStopLossPrice;
                        // console.log(`Change Trailing Stop Loss Price to ${this.trailingStopLossPrice.toFixed(2)} ${(((this.trailingStopLossPrice / this.buyPrice) - 1) * 100).toFixed(3)}% `);
                        this.results.writeCsv(this.resultsFileName, this.headerResult, `${formatAllDate(date)} Actual Price ${closePrice} Change Trailing Stop Loss Price to ${this.trailingStopLossPrice.toFixed(2)} ${(((this.trailingStopLossPrice / this.buyPrice) - 1) * 100).toFixed(3)}% `);
                    }
                    this.stopLossPrice = this.trailingStopLossPrice; // Update stop loss price to trailing stop loss price
                }
                minimumProfitPrice = this.buyPrice * (1 + this.config.minimumProfitPercent);
                minimumLossPrice = this.buyPrice * (1 - this.config.minimumProfitPercent);
                minimumCriteria = closePrice > minimumProfitPrice || closePrice < minimumLossPrice;

            } else {
                console.error('Buy price is null, cannot calculate P/L or stop loss.');
                return;
            }
            indicators += `Minimum P/L.......: ${closePrice} < ${minimumLossPrice} || ${closePrice} > ${minimumProfitPrice} ${minimumCriteria ? 'OK' : 'NOT'}\n`;
            // Check for sell signal
            console.log(`[${actualDateString}] Kline Price $${this.buyPrice.toFixed(2)} PL ${(pl * 100).toFixed(2)}% StopLoss ${this.stopLossPrice.toFixed(2)} (${((this.stopLossPrice / this.buyPrice - 1) * 100).toFixed(2)}%)`);
            if (this.intention === 'SELL' && minimumCriteria) {
                this.sendMessage(`SELL signal detected at ${closePrice.toFixed(2)} with P/L ${(pl * 100).toFixed(2)}%`);
                this.closeOperation(closePrice, opSellReason, date, indicators);
                // this.sendMessage(message);
            }
            else if (closePrice < this.stopLossPrice && this.stopLossPrice > 0 && minimumCriteria) {
                this.sendMessage(`STOP LOSS triggered at ${this.stopLossPrice.toFixed(2)} with price ${closePrice.toFixed(2)}`);
                this.closeOperation(closePrice, `STOP LOSS ${opSellReason}`, date, indicators);
            }
            else if (this.securityGainActive && closePrice < this.securityPrice) {
                this.sendMessage(`SECURITY GAIN triggered at ${this.securityPrice.toFixed(2)} with price ${closePrice.toFixed(2)}`);
                this.closeOperation(closePrice, `SECURITY GAIN ${opSellReason}`, date, indicators);
            }

            // else if (this.stopGainPrice && closePrice > this.stopGainPrice && minimumCriteria) {
            //     this.closeOperation(closePrice, `STOP GAIN ${opSellReason}`, date, indicators);
            //     this.sendMessage(`STOP GAIN triggered at ${this.stopGainPrice.toFixed(2)} with price ${closePrice.toFixed(2)}`);
            // }

            this.row += `${this.status},${pl ? pl.toFixed(3) : 'N/A'},`;
            this.csv.writeCsv(this.csvFileName, this.header, this.row);

        }
    }

    private openOperation(closePrice: number, criteria: string, actualDate: number, indicators: string): number {
        const operation = new Operation(this.chatId, this.config.symbol, closePrice, actualDate, criteria);
        this.operations.push(operation);
        this.status = 'BOUGHT';
        console.log(`------------------------------------------------------------`);

        this.sendMessage(operation.getBuyMessage(closePrice));
        // this.results.writeCsv(this.resultsFileName, this.headerResult, operation.getBuyMessage(closePrice));
        this.buyPrice = operation.buyPrice; // Set the buy price for future reference
        this.sendMessage(`${indicators}`);
        this.results.writeCsv(this.resultsFileName, this.headerResult, `------------------------------------------------------------`);
        this.results.writeCsv(this.resultsFileName, this.headerResult, operation.getBuyMessage(closePrice));
        this.results.writeCsv(this.resultsFileName, this.headerResult, indicators);
        operation.save();
        return operation.buyPrice; // Return the buy price for further calculations
    }

    private closeOperation(sellPrice: number, criteria: string, actualDate: number, indicators: string): void {
        const operation = this.operations[this.operations.length - 1];
        if (operation) {
            this.lastBuyPrice = operation.buyPrice; // Store the last buy price for future reference

            operation.sell(sellPrice, actualDate, criteria);
            indicators += `Trailing Stop Loss: ${(this.config.trailingStopLossPercent * 100).toFixed(2)}%\n`;
            this.trailingStopLossActive = false; // Reset trailing stop loss after selling
            this.status = 'SOLD';
            this.securityGainActive = false; // Reset security price after selling
            this.sendMessage(operation.toString());
            this.results.writeCsv(this.resultsFileName, this.headerResult, operation.toString());
            this.results.writeCsv(this.resultsFileName, this.headerResult, indicators);
            this.buyPrice = null; // Reset buy price after selling
            const pl = ((operation.sellPrice / operation.buyPrice) - 1) * 100;
            this.totalOperations++;
            this.plTotal *= (operation.sellPrice / operation.buyPrice);
            if (pl > 0) {
                this.gains++;
            }
            operation.save();

            const csvOperation = new CsvWriter('./operations');
            const timeLapse = (operation.sellDate - operation.buyDate) / 1000 / 60; // Convert to seconds
            const timeLapseBuy = (operation.buyDate - this.lastSellDate) / 1000 / 60; // Convert to seconds
            const headerOperation = 'TimeLapse(m)Buy, Buy Date, Sell Date, Time Lapse (m), Buy Price, Sell Price,P/L (%),Total P/L (%),Gains/Lost';
            const row = `${timeLapseBuy},${formatAllDate(operation.buyDate)},${formatAllDate(operation.sellDate)},${timeLapse},${operation.buyPrice.toFixed(2)},${operation.sellPrice.toFixed(2)},${pl.toFixed(3)}%,${((this.plTotal - 1) * 100).toFixed(3)}%,${this.gains}/${this.totalOperations}`;
            csvOperation.writeCsv("op_" + this.csvFileName, headerOperation, row);
            this.lastSellDate = operation.sellDate;

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
        const dayKlines = DataManager.getInstance().getKlines(this.config.symbol, this.config.dayInterval);
        const dayKlinesShort = DataManager.getInstance().getKlines(this.config.symbol, this.config.shortInterval);
        await dayKlines.fetchKlines();

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

};

export { BotStochRSIShortLong, BotStochRSIShortLongConfig };