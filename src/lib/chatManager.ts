import { Telegraf } from 'telegraf';
import type { Context } from 'telegraf';
import dotenv from 'dotenv';
import { Markup } from 'telegraf';
import Client from './Client';
import Database from './Database';

dotenv.config();

class ChatManager {
    private static instance: ChatManager;
    private bot: Telegraf;
    private clients: Map<number, Client> = new Map();
    private awaitingApiKeyInput: Set<number> = new Set();

    private constructor() {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) {
            throw new Error('TELEGRAM_BOT_TOKEN is not defined');
        }
        this.bot = new Telegraf(token);

        this.setupErrorHandling();
        this.initialize();
    }


    public sendAdminMessage(message: string) {
        const adminChatId = Number(process.env.TELEGRAM_CHAT_ID);
        if (!adminChatId) {
            console.error('ADMIN_CHAT_ID is not defined');
            return;
        }
        this.sendMessage(adminChatId, message);
    }

    public async getAllClients(): Promise<void> {
        const db = await Database.getInstance(); // Aguarda a instância do banco de dados
        const rows = await db.all('SELECT * FROM clients') as { chatId: number, name: string, email: string, binanceApiKey: string, binanceApiSecret: string, active: boolean; }[];
        this.clients = new Map(rows.map(row => [row.chatId, new Client(row.chatId, row.name, row.email, row.binanceApiKey, row.binanceApiSecret, row.active)]));
    }

    public getClient(chatId: number): Client | undefined {
        return this.clients.get(chatId);
    }


    public static async getInstance(): Promise<ChatManager> {
        if (!ChatManager.instance) {
            ChatManager.instance = new ChatManager();
            await ChatManager.instance.getAllClients();

        }
        return ChatManager.instance;
    }

    public start() {
        this.bot.launch();

        this.sendStartMessageToAllClients();
    }

    private setupErrorHandling() {
        this.bot.catch((err) => {
            console.error('Bot error:', err);
            this.restartBot();
        });
    }

    private restartBot() {
        console.log('Restarting bot...');
        this.bot.stop();
        this.start();
    }

    public sendMessage(chatId: number, message: string) {
        this.bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' }).catch((err) => {
            console.error('Failed to send message:', err);
        });
    }

    private async initialize(): Promise<void> {
        this.bot.start(this.handleStartCommand.bind(this));
        this.bot.on('message', this.handleMessage.bind(this));
        this.bot.action('config_user', (ctx) => {
            const client = this.clients.get(ctx.chat?.id || 0);
            if (client) {
                client.sendUserData();
            }
        });
        this.bot.action('config_binance', (ctx) => {
            const configBinanceMessage = `
            <code>Configurar Binance:</code>
            <code>API Key:</code> <b>${this.clients.get(ctx.chat?.id || 0)?.binanceApiKey}</b>
            <code>API Secret:</code> <b>${this.clients.get(ctx.chat?.id || 0)?.binanceApiSecret}</b>
            <code>Para alterar os dados, utilize os comandos:</code>
            <code><b>/a</b></code> {API KEY}
            <code><b>/s</b></code> {API SECRET}
            <code>Exemplo:</code>\n
            /a 1234567890
            `;

            ctx.reply(configBinanceMessage, { parse_mode: 'HTML' });
        });
        this.bot.action('activate_bot', (ctx) => {
            ctx.reply('Ativar Bot');
            const client = this.clients.get(ctx.chat?.id || 0);
            if (client) {
                this.sendAdminMessage(`
                    Cliente Solicita Ativaçao do Bot:
                    NOME.: ${client.name}
                    EMAIL.: ${client.email}
                    `);
            }
        });
        this.bot.action('deactivate_bot', (ctx) => {
            ctx.reply('Desativar Bot');
        });

        await this.saveAdmin();
        this.sendAdminMessage('Bot Iniciado');
    }

    private handleStartCommand(ctx: Context): void {
        console.log(`Received /start command from user: ${ctx.from?.username}`);
        if (!ctx.chat) {
            console.error('Chat is undefined');
            return;
        }
        if (this.clients.has(ctx.chat.id)) {
            this.sendMessage(ctx.chat.id, 'Você já havia iniciado o bot!');
            return;
        }
        const client = new Client(ctx.chat.id, ctx.from?.username || '');
        client.save();
        this.clients.set(client.chatId, client);
        this.sendMessage(client.chatId, '🤖');
        this.sendMessage(client.chatId, 'Bem Vindo ao BotBinance!');
        this.sendMenu(client.chatId);
    }

    private handleMessage(ctx: Context): void {
        if (ctx.message && 'text' in ctx.message) {
            console.log(`Received message from user: ${ctx.from?.username}: ${ctx.message.text}`);
            const message = ctx.message.text;
            const chatId = ctx.chat?.id;
            if (!chatId) {
                console.error('Chat ID is undefined');
                return;
            }
            if (message === 'menu' || message === '/?' || message === '/menu') {
                this.sendMenu(chatId);
            } else {
                const client = this.clients.get(chatId);
                if (client) {
                    client.handleMessage(message);
                }
            }
        }
    }
    private sendMenu(chatId: number): void {
        const menu = Markup.inlineKeyboard([
            [Markup.button.callback('Configurar Usuario', 'config_user')],
            [Markup.button.callback('Configurar Api Key da Binance', 'config_apikey')],
            [Markup.button.callback('Ativar Bot', 'activate_bot')],
            [Markup.button.callback('Desativar Bot', 'deactivate_bot')]
        ]);
        this.bot.telegram.sendMessage(chatId, 'Menu - Escolha uma opção:', menu);
    }

    private sendStartMessageToAllClients() {
        for (const client of this.clients.values()) {
            this.sendMessage(client.chatId, '🤖');
            this.sendMenu(client.chatId);
        }
    }

    public sendHappyEmojiToClient(chatId: number) {
        this.sendMessage(chatId, '🤑');
    }

    public sendScaryEmojiToClient(chatId: number) {
        this.sendMessage(chatId, '😱');
    }
    public sendSadEmojiToClient(chatId: number) {
        this.sendMessage(chatId, '😭');
    }

    public async saveAdmin(): Promise<void> {
        const client = new Client(Number(process.env.TELEGRAM_CHAT_ID) || 0, 'Admin', '', process.env.BINANCE_API_KEY || '', process.env.BINANCE_API_SECRET || '', true);
        client.save();
        this.clients.set(client.chatId, client);
    }

    public async sendFormattedMessage(chatId: number, message: string): Promise<void> {
        await this.bot.telegram.sendMessage(chatId, `<pre>${message}</pre>`, { parse_mode: 'HTML' });
    }
}

export default ChatManager;
