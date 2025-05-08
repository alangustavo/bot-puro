# Crypto Trading Bot for Binance

This project aims to develop a cryptocurrency trading bot for Binance, controlled via Telegram. The bot leverages **Clean Code principles**, **Test-Driven Development (TDD)**, **DRY**, and other best practices to ensure maintainability and reliability.

## Features

### Market Data Streams

- Subscribe to multiple Binance streams to receive real-time market data.

### Trading Strategies

- Execute buy and sell strategies for a predefined list of cryptocurrencies based on market data.

### Telegram Integration

- **Notifications**: Notify the user of trade actions (e.g., bought/sold).
- **User Interaction**:
  - Request information about the current operation (e.g., profit or loss status).
  - View the results of all trades.
- **Configuration**:
  - Set trading parameters such as:
    - Stop-loss percentages.
    - Activate trailing stop.
    - Minimum loss thresholds (to avoid frequent trades).
    - Other customizable attributes.

## Goals

- Automate cryptocurrency trading with customizable strategies.
- Provide real-time updates and interaction through Telegram.
- Ensure code quality and maintainability using **Clean Code principles** and **TDD**.

## How to Run

1. Clone the repository:
   ```bash
   git clone https://github.com/your-repo/crypto-trading-bot.git
   cd crypto-trading-bot
   ```
