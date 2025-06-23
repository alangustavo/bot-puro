import ChatManager from './ChatManager';
import type Operation from './Operation';
import he from 'he';
import type { Signal, Status } from './types';
import Database from './Database';

abstract class BotConfig {
    public abstract toString(): string;
}

abstract class Bot {

    protected startDate: number;
    protected operantions: Operation[] = [];
    protected chatId: number;
    protected telegram: ChatManager | undefined;
    protected status: Status;
    protected checkInterval: number = 10; // Default to 10 seconds
    public backTest = false;

    /**
     * Abstract class for trading bots.
     * @param chatId Telegram chat ID to send messages
     * @param checkInterval Check interval in seconds (default is 10 seconds)
     */
    constructor(chatId: number, checkInterval = 10) {
        this.status = 'SOLD'; // @todo check database for previous status
        this.checkInterval = checkInterval;
        this.chatId = chatId;
        this.startDate = Date.now();
    }

    /**
     * Analyzes the market and generates trading signals.
     */
    protected abstract analyzeMarket(): Promise<void>;

    /**
     * Configures the Klines for the bot.
     * This method should be implemented by subclasses to set up the Klines data and fetch data
     */
    protected abstract configKlines(): Promise<void>;

    public async start(): Promise<void> {
        this.telegram = await ChatManager.getInstance();
        await this.configKlines();
        setInterval(() => {
            this.analyzeMarket();
        }, 1000 * this.checkInterval); // Check every 10 seconds
    }


    protected abstract getBotName(): string;

    protected abstract getBotConfig(): string;

    // Torna escapeHtml protected para uso nas subclasses
    protected escapeHtml(text: string): string {
        return he.encode(text);
    }

    protected log(message: string): void {
        if (!this.backTest)
            console.log(`${message}`);
    }

    protected async sendMessage(message: string): Promise<void> {
        if (this.chatId == 999999) {
            console.log(`${message}`);
            return;
        }
        if (!this.telegram) {
            this.telegram = await ChatManager.getInstance();
        }
        if (this.telegram) {
            const safeMessage = `<pre>${this.escapeHtml(message)}</pre>`;
            await this.telegram.sendFormattedMessage(this.chatId, safeMessage);
        } else {
            console.error('Telegram instance is not initialized.');
        }
    }
}

export { Bot, BotConfig };