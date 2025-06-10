import ChatManager from "./ChatManager";
import DataManager from './DataManager';
import Indicators from "./Indicators";
import Klines from "./Klines";
import Operation from "./Operation";
import type { Interval, Status } from "./types";

export default class BotSMASupportResistance {

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
    private distanceSupport: number;
    private distanceResistance: number;
    private window: number;
    private result = 1;
    private qtyOperations = 0;
    private gains = 0;
    private botName: string;
    private configBot: string;

    /**
     * 
     * @param chatId O número do chat do Telegram onde o bot enviará mensagens
     * @param symbol O símbolo do ativo a ser monitorado (ex: 'BTCUSDT')
     * @param interval O intervalo de tempo para as Klines (ex: '1m', '5m', '1h', etc.)
     * @param shortSMA O período da SMA curta (ex: 15 para SMA de 15 períodos)
     * @param longSMA O período da SMA longa (ex: 50 para SMA de 50 períodos)
     * @param stopLossPercent O percentual de Stop Loss (ex: 0.98 para 2% de perda)
     * @param trailingStopLossPercent O percentual de Trailing Stop Loss (ex: 0.995 para 0.5% de trailing stop)
     * @param trailingStopLossActivePercent O percentual que ativa o Trailing Stop Loss (ex: 1.007 para 0.7% acima do preço de compra)
     * @param distanceResistance O percentual mínimo de distância do preço atual para a resistência (ex: 0.99 para 1% abaixo da resistência) acima disso não compra (Evitar comprar Topo)
     * @param distanceSupport O percentual mínimo de distância do preço atual para o suporte (ex: 1.005 para 0.5% acima do suporte) abaixo disso não compra (Evitar comprar Fundo)
     * @param window 
     */
    constructor(
        chatId: number,
        symbol: string,
        interval: Interval,
        shortSMA: number,
        longSMA: number,
        stopLossPercent = 0.98, // Configuração de Stop Loss
        trailingStopLossPercent = 0.995, // Configuração de Trailing Stop Loss
        trailingStopLossActivePercent = 1.007, // Ativa o Trailing Stop Loss quando o preço sobe acima deste percentual do preço de compra
        distanceResistance = 0.99, // Distância mínima do preço atual para a resistência (resistance * distanceResistance) acima disso não compra
        distanceSupport = 1.005, // Distancia mínima do preço de suporte (support * distanceSupport) abaixo disso não compra
        window = 300 // janela de cálculo para suporte e resistência

    ) {

        this.botName = 'BotSMASupportResistance';
        this.chatId = chatId;
        this.symbol = symbol;
        this.interval = interval;
        this.shortSMA = shortSMA;
        this.longSMA = longSMA;
        this.crossShortLong = true; // shortSMA > longSMA;
        this.stopLossPercent = stopLossPercent;
        this.trailingStopLossPercent = trailingStopLossPercent;
        this.trailingStopLossActivePercent = trailingStopLossActivePercent;
        this.distanceResistance = distanceResistance;
        this.distanceSupport = distanceSupport;
        this.window = window;
        // Inicializa os indicadores e o gerenciador de dados
        this.indicators = new Indicators();
        this.dataManager = DataManager.getInstance();
        const klines = new Klines(this.symbol, this.interval, 1000);
        this.dataManager.setKlines(klines);
        this.configBot = `
        <code>BOT NAME............: ${this.botName}</code>
        <code>CHAT ID.............: ${this.chatId}</code>
        <code>SYMBOL..............: ${this.symbol}</code>
        <code>INTERVAL............: ${this.interval}</code>
        <code>SHORT SMA...........: ${this.shortSMA}</code>
        <code>LONG SMA............: ${this.longSMA}</code>
        <code>ULTRA SMA...........: 500</code>
        <code>STOP LOSS...........: ${this.stopLossPercent}</code>
        <code>TRAILING SL.........: HIGH PRICE &lt; ${this.trailingStopLossPercent.toFixed(3)}</code>
        <code>TRAILING ACTIVATION.: GAIN ${this.trailingStopLossActivePercent.toFixed(3)}</code>
        <code>DISTANCE RESISTANCE.: BUY IF PRICE &lt; ${this.distanceResistance.toFixed(3)}</code>
        <code>DISTANCE SUPPORT....: BUY IF PRICE &gt; ${this.distanceSupport.toFixed(3)}</code>
        <code>WINDOW RES/SUP......: ${this.window} X ${this.interval}</code>`;

    }

    private closeOperation(sellPrice: number, sellDate: number, sellCriteria: string) {
        if (this.operation) {
            this.operation.sell(sellPrice, sellDate, sellCriteria);
            this.status = "SOLD";
            this.operation.save();
            const pl = sellPrice / this.operation.buyPrice;
            if (pl > 1) {
                this.gains++;
            }
            this.result *= pl;

            const message = `BOTSMASUPRES.:\n${this.operation.toString()}`;

            this.operation = null;
            this.trailingStopLossPrice = 0;
            this.trailingStopLossActive = false;
            this.qtyOperations++;

            const resultMessage = `
            RESULT.......: ${this.result.toFixed(4)}%
            OPERATIONS...: ${this.gains}/${this.qtyOperations} ${this.gains / this.qtyOperations * 100}%`;
            this.chatManager.sendFormattedMessage(this.chatId, message + resultMessage);
        }
    }


    public async start() {
        this.chatManager = await ChatManager.getInstance();
        this.chatManager.sendMessage(this.chatId, `Starting ${this.botName} with the following configuration:\n${this.configBot}`);
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
            const ultaSMA = this.indicators.getSMA(this.symbol, this.interval, 500);
            const support = this.indicators.getSupport(this.symbol, this.interval, this.window);
            const resistance = this.indicators.getResistance(this.symbol, this.interval, this.window);
            const distPriceSupport = support !== null ? lastPrice > support * this.distanceSupport : false;
            const distPriceResistance = resistance !== null ? lastPrice < resistance * this.distanceResistance : false;
            const signalBought = distPriceSupport && distPriceResistance;
            const msg = `
            BOT NAME.....: ${this.botName}
            STATUS.......: ${this.status}
            SYMBOL.......: ${this.symbol}
            INTERVAL.....: ${this.interval}
            CROSS SMA/LMA: ${shortSMA.toFixed(3)} &gt; ${longSMA.toFixed(3)} (${this.crossShortLong ? 'UP' : 'DOWN'})
            USMA.........: ${ultaSMA.toFixed(3)} 
            LAST PRICE...: ${lastPrice.toFixed(2)} &gt; USMA ${ultaSMA.toFixed(3)} ${lastPrice > ultaSMA ? 'OK' : 'NOK'}
            SUPPORT......: ${support ? support.toFixed(2) : 'N/A'} &gt; ${distPriceSupport ? 'OK' : 'NOK'}
            RESISTANCE...: ${resistance ? resistance.toFixed(2) : 'N/A'} &lt; ${distPriceResistance ? 'OK' : 'NOK'}
            DISTANCE R/S.: ${(support !== null && resistance !== null) ? (resistance / support).toFixed(4) : 'N/A'}
`;
            console.log(`BotSMASupportResistance ${msg}`);
            if (this.status === "SOLD") {
                // Compra apenas no cruzamento de baixo para cima
                console.log(msg);
                if (this.crossShortLong === false && shortSMA > longSMA && ultaSMA < lastPrice && signalBought) {
                    console.log('BUY');
                    this.crossShortLong = true;
                    this.operation = new Operation(this.chatId, this.symbol, lastPrice, Date.now(), 'SMA CROSS');
                    await this.operation.save();
                    this.chatManager.sendFormattedMessage(this.chatId, msg);
                    this.chatManager.sendFormattedMessage(this.chatId, `BOTSMASUPRES.:\n${this.operation.getMessage(lastPrice)}`);
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
                    this.chatManager.sendFormattedMessage(this.chatId, msg);
                    this.closeOperation(lastPrice, Date.now(), 'SMA CROSS');
                    return;
                }
                // Stop Loss
                if (lastPrice < stopLossPrice) {
                    console.log('STOP LOSS');
                    this.chatManager.sendFormattedMessage(this.chatId, msg);
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
                    this.chatManager.sendFormattedMessage(this.chatId, msg);
                    return;
                }
            }
            // Atualiza o estado do cruzamento para o próximo ciclo
            this.crossShortLong = shortSMA > longSMA;
        }, 10000);
    }
}