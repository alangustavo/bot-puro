import ChatManager from './chatManager';
import Database from './database';



class Client {

    chatId: number;
    name: string;
    email: string;
    binanceApiKey: string;
    binanceApiSecret: string;
    active: boolean;

    constructor(chatId: number, name = '', email = '', binanceApiKey = '', binanceApiSecret = '', active = false) {
        this.chatId = chatId;
        this.name = name;
        this.email = email;
        this.binanceApiKey = binanceApiKey;
        this.binanceApiSecret = binanceApiSecret;
        this.active = active;
    }

    private async sendMessage(message: string): Promise<void> {
        const chat = await ChatManager.getInstance();
        if (this.chatId) {
            chat.sendMessage(this.chatId, message);
        }
    }

    public sendUserData(): void {

        const binanceApiKey = this.binanceApiKey ? `***${this.binanceApiKey.slice(-5)}` : '';
        const binanceApiSecret = this.binanceApiSecret ? `***${this.binanceApiSecret.slice(-5)}` : '';
        const message = `
        <code> DADOS:</code>\n
        <code>Nome.......:</code> <b>${this.name}</b>
        <code>Email......:</code> <b>${this.email}</b>
        <code>API Key....:</code> <b>${binanceApiKey}</b>
        <code>API Secret.:</code> <b>${binanceApiSecret}</b>
        <code>Ativo......:</code> <b>${this.active ? 'Sim' : 'Não'}</b>\n
        <code>Para alterar os dados, utilize os comandos:</code>
        <code><b>/u</b></code> {NOME DO USUARIO}
        <code><b>/e</b></code> {EMAIL}
        <code><b>/a</b></code> {API KEY}
        <code><b>/s</b></code> {API SECRET}`;

        this.sendMessage(message);

    }

    public handleMessage(message: string): void {
        if (message.startsWith('/u')) {
            this.name = message.split(' ').slice(1).join(' ');
            console.log(`Client Name: ${this.name}`);
            this.sendUserData();
        }

        if (message.startsWith('/e')) {
            this.email = message.split(' ').slice(1).join(' ');
            console.log(`Client Email: ${this.email}`);
            this.sendUserData();
        }

        if (message.startsWith('/a')) {
            this.binanceApiKey = message.split(' ').slice(1).join(' ');
            this.sendUserData();
        }

        if (message.startsWith('/s')) {
            this.binanceApiSecret = message.split(' ').slice(1).join(' ');
            this.sendUserData();
        }
        this.save();
    }

    public async save(): Promise<void> {
        const db = await Database.getInstance();
        await db.run(
            'INSERT INTO clients (chatId, name, email, binanceApiKey, binanceApiSecret, active) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(chatId) DO UPDATE SET name=excluded.name, email=excluded.email, binanceApiKey=excluded.binanceApiKey, binanceApiSecret=excluded.binanceApiSecret, active=excluded.active',
            [this.chatId, this.name, this.email, this.binanceApiKey, this.binanceApiSecret, this.active]
        );
    }

}

export default Client;