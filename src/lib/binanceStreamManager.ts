import WebSocket from 'ws';
import { createEvent } from './EventFactory';
import ChatManager from './ChatManager';

export default class BinanceStreamManager {
    private static instance: BinanceStreamManager;
    private ws!: WebSocket;
    private url: string;
    private subscriptions: Set<string> = new Set();
    private pendingSubscriptions: Set<string> = new Set();
    private reconnectInterval: number;
    private lastMessageTimestamp: number;
    private isReconnecting = false;

    private constructor() {
        if (!process.env.BINANCE_STREAM_URL) {
            console.error('BINANCE_STREAM_URL is not defined. Using default URL: wss://stream.binance.com:9443/ws');
        }
        this.url = process.env.BINANCE_STREAM_URL || 'wss://stream.binance.com:9443/ws';
        this.reconnectInterval = Number(process.env.BINANCE_STREAM_RECONNECT_INTERVAL) || 5000;
        this.lastMessageTimestamp = Date.now();
        this.connect();
    }

    public static getInstance(): BinanceStreamManager {
        if (!BinanceStreamManager.instance) {
            BinanceStreamManager.instance = new BinanceStreamManager();
        }
        return BinanceStreamManager.instance;
    }

    private connect(): void {
        try {
            this.ws = new WebSocket(this.url);
            this.ws.on('open', () => this.handleOpen());
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('ping', (data) => this.handlePing(data));
            this.ws.on('close', (code, reason) => this.handleClose(code, reason));
            this.ws.on('error', (error) => this.handleError(error));

            // Verifica se há inatividade por mais de 1 minuto
            setInterval(() => {
                if (!this.isReconnecting && Date.now() - this.lastMessageTimestamp > 60000) {
                    console.warn('No messages received for over 1 minute. Reconnecting...');
                    this.reconnect();
                }
            }, this.reconnectInterval);
        } catch (error) {
            console.error('Error during WebSocket connection:', error);
            this.reconnect();
        }
    }

    private handleOpen(): void {
        console.log('WebSocket connection opened.');
        this.isReconnecting = false; // Reconexão concluída
        this.lastMessageTimestamp = Date.now(); // Atualiza o timestamp
        this.resubscribeAll();
        this.processPendingSubscriptions();
    }

    private async handleMessage(data: WebSocket.Data): Promise<void> {
        // console.log('Message received:', data.toString());
        try {
            const parsedData = JSON.parse(data.toString());
            createEvent(parsedData); // Chama a função createEvent com o conteúdo da mensagem
        } catch (error) {
            const chatManager = await ChatManager.getInstance();
            if (error instanceof Error) {
                chatManager.sendAdminMessage(`handleMessage: Failed to parse WebSocket message: ${error.message}`);
            } else {
                chatManager.sendAdminMessage('handleMessage: Failed to parse WebSocket message: Unknown error');
            }
            console.error('Failed to parse WebSocket message as EventData:', error);
        }
        this.lastMessageTimestamp = Date.now();
    }

    private handlePing(data: Buffer): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            console.log('Ping received. Sending pong...');
            this.ws.pong(data);
            this.lastMessageTimestamp = Date.now();
        } else {
            console.warn('Ping received, but WebSocket is not open.');
        }
    }

    private async handleClose(code: number, reason: string | Buffer): Promise<void> {
        const reasonString = reason instanceof Buffer ? reason.toString() : reason;
        console.log(`WebSocket connection closed. Code: ${code}, Reason: ${reasonString}`);
        const chatManager = await ChatManager.getInstance();
        chatManager.sendAdminMessage(`handleClose: WebSocket connection closed. Code: ${code}, Reason: ${reasonString}`);
        this.reconnect();
    }

    private async handleError(error: Error): Promise<void> {
        console.error('WebSocket error:', error);
        const chatManager = await ChatManager.getInstance();
        chatManager.sendAdminMessage(`handleError: WebSocket connection closed. Code: ${error.name}, Reason: ${error.message}`);
        this.reconnect();
    }

    private async reconnect(): Promise<void> {
        const chatManager = await ChatManager.getInstance();
        await chatManager.sendAdminMessage(`reconnect: WebSocket connection closed. Code: ${this.ws.readyState}, Reason: ${this.ws.CLOSED}`);
        if (this.isReconnecting && this.ws.readyState !== WebSocket.CLOSED) {
            console.log('Already reconnecting. Skipping additional reconnect attempt.');
            return;
        }

        this.isReconnecting = true;
        console.log(`Reconnecting in ${this.reconnectInterval / 1000} seconds...`);

        setTimeout(() => {
            try {
                this.connect();
            } catch (error) {
                console.error('Failed to reconnect:', error);
                this.isReconnecting = false; // Permitir novas tentativas de reconexão
            }
        }, this.reconnectInterval);
    }

    private resubscribeAll(): void {
        console.log('Resubscribing to all streams...');
        for (const stream of this.subscriptions) {
            this.subscribe(stream);
        }
    }

    private processPendingSubscriptions(): void {
        console.log('Processing pending subscriptions...');
        for (const stream of this.pendingSubscriptions) {
            this.subscribe(stream);
        }
        this.pendingSubscriptions.clear();
    }

    public subscribe(stream: string): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            const request = {
                method: 'SUBSCRIBE',
                params: [stream],
                id: Date.now(),
            };
            this.ws.send(JSON.stringify(request));
            console.log(`Subscribed to stream: ${stream}`);
            this.subscriptions.add(stream);
        } else {
            console.warn(`WebSocket not open. Adding stream to pending subscriptions: ${stream}`);
            this.pendingSubscriptions.add(stream);
        }
    }

    public unsubscribe(stream: string): void {
        if (this.ws.readyState === WebSocket.OPEN) {
            const request = {
                method: 'UNSUBSCRIBE',
                params: [stream],
                id: Date.now(),
            };
            this.ws.send(JSON.stringify(request));
            console.log(`Unsubscribed from stream: ${stream}`);
            this.subscriptions.delete(stream);
        } else {
            console.warn(`WebSocket not open. Cannot unsubscribe from stream: ${stream}`);
        }
    }
}