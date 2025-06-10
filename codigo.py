from datetime import datetime, timedelta # Import timedelta explicitly


# --- Backtesting Parameters ---
initial_balance = 100.0  # Initial capital in USD
stop_loss_pct = 0.01    # 0.5% Stop Loss
profit_target_pct = 0.05 # 0.5% Profit Target for some exits
rsi_period = 7          # RSI period
ma_period = 500         # Moving Average period
fast_period = 11
slow_period = 9
supertrend_atr_period = 10 # Supertrend ATR period
supertrend_multiplier = 3 # Supertrend multiplier
sell_price_hold_hours = 8



def calculate_supertrend(data, atr_period=10, multiplier=3):
    """Calculates the Supertrend indicator."""
    high = data['High']
    low = data['Low']
    close = data['Close']

    # Calculate Average True Range (ATR) - Make sure ATR calculation is robust to NaNs/shifts
    tr1 = high - low
    tr2 = abs(high - close.shift(1)) # Use shift(1) explicitly for clarity and safety
    tr3 = abs(low - close.shift(1))
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    # Use .iloc to get the current row's ATR for the EWM calculation if needed,
    # but EWM itself handles previous values. The main point is handling shifts.
    atr = tr.ewm(alpha=1/atr_period, adjust=False).mean()

    # Calculate Upper and Lower Bands
    basic_upper_band = (high + low) / 2 + multiplier * atr
    basic_lower_band = (high + low) / 2 - multiplier * atr

    # Calculate Final Upper and Lower Bands
    final_upper_band = basic_upper_band.copy()
    final_lower_band = basic_lower_band.copy()

    # Use .iloc for loop-based access
    for i in range(1, len(data)):
        if close.iloc[i] > final_upper_band.iloc[i-1]:
            final_upper_band.iloc[i] = basic_upper_band.iloc[i]
        else:
            final_upper_band.iloc[i] = min(basic_upper_band.iloc[i], final_upper_band.iloc[i-1])

        if close.iloc[i] < final_lower_band.iloc[i-1]:
            final_lower_band.iloc[i] = basic_lower_band.iloc[i]
        else:
            final_lower_band.iloc[i] = max(basic_lower_band.iloc[i], final_lower_band.iloc[i-1])

    # Determine Supertrend Direction and Value
    # Create Series with default values if needed, or fill during the loop
    supertrend = pd.Series(index=data.index, dtype=float) # Specify dtype
    trend_direction = pd.Series(index=data.index, dtype=int) # Specify dtype

    for i in range(len(data)):
        if i == 0:
            trend_direction.iloc[i] = 1 # Assume uptrend initially
            supertrend.iloc[i] = final_lower_band.iloc[i]
        elif close.iloc[i] > supertrend.iloc[i-1]:
            trend_direction.iloc[i] = 1
            supertrend.iloc[i] = final_lower_band.iloc[i]
        elif close.iloc[i] < supertrend.iloc[i-1]:
             trend_direction.iloc[i] = -1
             supertrend.iloc[i] = final_upper_band.iloc[i]
        else: # Handle case where close is exactly on the supertrend line
             trend_direction.iloc[i] = trend_direction.iloc[i-1]
             supertrend.iloc[i] = supertrend.iloc[i-1]

        # Adjust Supertrend based on trend direction
        if trend_direction.iloc[i] == 1 and final_lower_band.iloc[i] < supertrend.iloc[i-1]:
             supertrend.iloc[i] = supertrend.iloc[i-1]
        elif trend_direction.iloc[i] == -1 and final_upper_band.iloc[i] > supertrend.iloc[i-1]:
             supertrend.iloc[i] = supertrend.iloc[i-1]

    return supertrend, trend_direction # Return both value and direction

# Calculate RSI (Manual Calculation)
def calculate_rsi(data, period):
    delta = data['Close'].diff()
    gain = delta.where(delta > 0, 0)
    loss = -delta.where(delta < 0, 0)

    avg_gain = gain.ewm(span=period, adjust=False).mean()
    avg_loss = loss.ewm(span=period, adjust=False).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

# Calculate Moving Average
df['MA100'] = df['Close'].rolling(window=ma_period).mean()
df['MFFAST'] = df['Close'].ewm(span=fast_period, adjust=False).mean()
df['MFSLOW'] = df['Close'].ewm(span=slow_period, adjust=False).mean()

# Calculate Supertrend and Direction
df['Supertrend'], df['Supertrend_Direction'] = calculate_supertrend(df.copy(), atr_period=supertrend_atr_period, multiplier=supertrend_multiplier)

# Calculate RSI
df['RSI'] = calculate_rsi(df.copy(), period=rsi_period)

# --- Backtesting Logic ---
trades = []
in_position = False
entry_price = 0.0
exit_price = 0.0
exit_time = None
entry_balance = initial_balance
stop_loss_price = 0.0
profit_target_price = 0.0 # Not strictly needed for this exit, but good to have

# Drop NaN values created by indicators
df.dropna(inplace=True)
df.reset_index(drop=True, inplace=True)


for i in tqdm(range(len(df)), desc="Running Backtest"):
    current_price = df['Close'].iloc[i]
    rsi_value = df['RSI'].iloc[i]
    supertrend_direction = df['Supertrend_Direction'].iloc[i]
    ma100_value = df['MA100'].iloc[i]
    current_time = df['Close time'].iloc[i]
    fastSlow = df['MFFAST'].iloc[i] > df['MFSLOW'].iloc[i]

    # Corrected access to timedelta
    if exit_time is None or current_time > exit_time + timedelta(hours=sell_price_hold_hours) :
        exit_time = None

    if exit_time is None or exit_price > current_price:
      buy_condition = True
    else:
      buy_condition = False

    if not in_position:
        # Buy Condition: RSI < 30 AND Supertrend is Buy (1) AND Price is above MA100
        if rsi_value < 30 and supertrend_direction == 1 and current_price > ma100_value and fastSlow and buy_condition:
            in_position = True
            entry_price = current_price
            entry_time = current_time
            stop_loss_price = entry_price * (1 - stop_loss_pct)
            # Note: Profit target is not set as a fixed price trigger in the conditions,
            # but the 0.5% PL is checked dynamically.
            print(f"[{current_time}] BUY at {entry_price:.4f}")

    elif in_position:
        # Calculate current P/L percentage
        current_pl_pct = (current_price - entry_price) / entry_price

        # Exit Conditions:
        # 1. RSI > 70 AND PL > 0.5%
        if rsi_value > 70 and current_pl_pct >= profit_target_pct:
            exit_price = current_price
            exit_time = current_time
            in_position = False
            trade_pl_pct = (exit_price - entry_price) / entry_price
            trade_pl_value = (exit_price - entry_price) * (entry_balance / entry_price)
            final_balance = entry_balance + trade_pl_value
            trade_result = 'Win' if trade_pl_value > 0 else 'Loss'
            trades.append({
                'Entry Time': entry_time,
                'Entry Price': entry_price,
                'Exit Time': exit_time,
                'Exit Price': exit_price,
                'P/L (%)': trade_pl_pct * 100,
                'P/L ($)': trade_pl_value,
                'Result': trade_result,
                'Exit Reason': 'RSI > 70 and PL > 0.5%'
            })
            entry_balance = final_balance # Update balance for the next trade
            print(f"[{current_time}] SELL at {exit_price:.4f} (RSI > 70 and PL > 0.5%) - P/L: {trade_pl_pct*100:.2f}%")


        # 2. Supertrend is Sell (-1) AND PL > 0.5%
        elif supertrend_direction == -1 and current_pl_pct >= profit_target_pct:
            exit_price = current_price
            exit_time = current_time
            in_position = False
            trade_pl_pct = (exit_price - entry_price) / entry_price
            trade_pl_value = (exit_price - entry_price) * (entry_balance / entry_price)
            final_balance = entry_balance + trade_pl_value
            trade_result = 'Win' if trade_pl_value > 0 else 'Loss'
            trades.append({
                'Entry Time': entry_time,
                'Entry Price': entry_price,
                'Exit Time': exit_time,
                'Exit Price': exit_price,
                'P/L (%)': trade_pl_pct * 100,
                'P/L ($)': trade_pl_value,
                'Result': trade_result,
                'Exit Reason': 'Supertrend Sell and PL > 0.5%'
            })
            entry_balance = final_balance # Update balance for the next trade
            print(f"[{current_time}] SELL at {exit_price:.4f} (Supertrend Sell and PL > 0.5%) - P/L: {trade_pl_pct*100:.2f}%")


        # 3. Stop Loss hit
        elif current_price <= stop_loss_price:
            exit_price = stop_loss_price # Exit at stop loss price
            exit_time = current_time
            in_position = False
            trade_pl_pct = (exit_price - entry_price) / entry_price
            trade_pl_value = (exit_price - entry_price) * (entry_balance / entry_price)
            final_balance = entry_balance + trade_pl_value
            trade_result = 'Win' if trade_pl_value > 0 else 'Loss'
            trades.append({
                'Entry Time': entry_time,
                'Entry Price': entry_price,
                'Exit Time': exit_time,
                'Exit Price': exit_price,
                'P/L (%)': trade_pl_pct * 100,
                'P/L ($)': trade_pl_value,
                'Result': trade_result,
                'Exit Reason': 'Stop Loss'
            })
            entry_balance = final_balance # Update balance for the next trade
            print(f"[{current_time}] SELL at {exit_price:.4f} (Stop Loss) - P/L: {trade_pl_pct*100:.2f}%")


# If the last trade is still open at the end of the data
if in_position:
    current_price = df['Close'].iloc[-1]
    current_time = df['Close time'].iloc[-1]
    exit_price = current_price # Exit at the last price
    exit_time = current_time
    trade_pl_pct = (exit_price - entry_price) / entry_price
    trade_pl_value = (exit_price - entry_price) * (entry_balance / entry_price)
    final_balance = entry_balance + trade_pl_value
    trade_result = 'Win' if trade_pl_value > 0 else 'Loss'
    trades.append({
        'Entry Time': entry_time,
        'Entry Price': entry_price,
        'Exit Time': exit_time,
        'Exit Price': exit_price,
        'P/L (%)': trade_pl_pct * 100,
        'P/L ($)': trade_pl_value,
        'Result': trade_result,
        'Exit Reason': 'End of Data'
    })
    entry_balance = final_balance # Update balance

# --- Backtest Summary ---
print("\n--- Backtest Summary ---")

if not trades:
    print("No trades were executed.")
    print(f"Final Balance: US$ {initial_balance:.2f}")
else:
    trades_df = pd.DataFrame(trades)

    total_trades = len(trades_df)
    winning_trades = trades_df[trades_df['Result'] == 'Win']
    num_winning_trades = len(winning_trades)
    win_rate = (num_winning_trades / total_trades) * 100 if total_trades > 0 else 0

    total_pl_value = trades_df['P/L ($)'].sum()
    final_account_value = initial_balance + total_pl_value

    print(f"Total Trades: {total_trades}")
    print(f"Winning Trades: {num_winning_trades}")
    print(f"Win Rate: {win_rate:.2f}%")
    print(f"Total Profit/Loss: US$ {total_pl_value:.2f}")
    print(f"Starting Balance: US$ {initial_balance:.2f}")
    print(f"Final Balance: US$ {final_account_value:.2f}")

    print("\n--- Trades Details ---")
    print(trades_df.to_string()) # Use to_string to display all rows if needed