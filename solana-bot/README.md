# 🚀 Solana Token Analyzer Bot

A production-ready Solana token monitoring bot that scans [DexScreener](https://dexscreener.com) for high-potential tokens and sends real-time [Telegram](https://telegram.org) alerts when it detects volume spikes, pump patterns, and early-stage gems.

---

## ✨ Features

| Feature | Details |
|---|---|
| **DexScreener Integration** | Polls Solana token pairs in real time |
| **4 Pattern Detectors** | Volume Spike, Pump Pattern, Early Gem, Momentum Breakout |
| **Composite Signal Score** | Each alert rated 0–100 for confidence |
| **Telegram Alerts** | Instant mobile notifications with price, volume, links |
| **Signal Deduplication** | Configurable cooldown prevents repeat alerts |
| **SQLite History** | Full signal log stored locally for review |
| **Backtesting Mode** | Dry-run without sending Telegram messages |
| **Zero extra SDK deps** | Telegram calls made directly via axios |

---

## 🔍 Pattern Detection

### 1. Volume Spike
Triggers when the 1-hour volume is **5× or more** above the rolling hourly average (derived from the 24-hour volume). Score increases proportionally with spike magnitude.

### 2. Pump Pattern
Detects rising price **combined** with a high buy/sell ratio over the last hour — the hallmark of accumulation before a move.

### 3. Early Gem
Identifies tokens with a **high volume-to-market-cap ratio** (≥ 0.5) and a young pair age (< 24h earns bonus points). High activity relative to small float = price-discovery phase.

### 4. Momentum Breakout
Checks that the **5-minute price change is accelerating** beyond the normalised 1-hour and 6-hour trends, indicating a breakout is in progress right now.

---

## 📱 Telegram Alert Example

```
🚀🔥 SOLANA SIGNAL DETECTED 🚀🔥

Token: MoonToken (MOON)
Contract: AaBbCc...1234

📊 Price: $0.00004532
📈 Change: 1h 🟢 +42.10% | 24h 🟢 +15.30%
💧 Liquidity: $85.23K
📉 Market Cap: $320.45K
⚡ Volume 1h: $512.80K
⚡ Volume 24h: $1.23M

🎯 Signal Strength: 87/100
🔎 Patterns:
  • VOLUME SPIKE: Volume spike 8.40x above 24h hourly average
  • EARLY GEM: Vol/MCap ratio 1.60, age 3h

🔗 Links:
  • DexScreener Chart
  • Birdeye
  • Solscan

#VOLUMESPIKE #EARLYGEM #Solana
```

---

## 🛠 Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- A [Telegram bot token](https://t.me/BotFather) from @BotFather
- Your Telegram chat ID (send `/start` to [@userinfobot](https://t.me/userinfobot))

---

## ⚡ Quick Start

### 1. Install dependencies

```bash
cd solana-bot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```dotenv
TELEGRAM_BOT_TOKEN=123456:ABC-your-token-here
TELEGRAM_CHAT_ID=987654321
```

All other settings have sensible defaults — see [Configuration](#configuration) below.

### 3. Build and run

```bash
# Build TypeScript → JavaScript
npm run build

# Start the bot
npm start
```

Or run directly with ts-node (development):

```bash
npm run dev
```

---

## ⚙️ Configuration

All settings are controlled via environment variables (`.env` file).

| Variable | Default | Description |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | *(required)* | Bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | *(required)* | Your Telegram chat/channel ID |
| `SCAN_INTERVAL_MS` | `120000` (2 min) | How often to scan (min 60,000 ms) |
| `MIN_VOLUME_USD` | `50000` | Minimum 1h volume in USD |
| `MAX_MARKET_CAP_USD` | `5000000` | Maximum market cap in USD |
| `MIN_LIQUIDITY_USD` | `25000` | Minimum liquidity in USD |
| `VOLUME_SPIKE_MULTIPLIER` | `5` | Required volume spike ratio (e.g. 5×) |
| `MIN_PRICE_CHANGE_PERCENT` | `10` | Minimum 1h price change % for pump detection |
| `MIN_SIGNAL_SCORE` | `60` | Minimum composite score to send an alert |
| `DB_PATH` | `./data/signals.db` | SQLite database file path |
| `SIGNAL_COOLDOWN_MS` | `3600000` (1 hr) | Re-alert cooldown per token |
| `BACKTEST_MODE` | `false` | Dry-run (logs signals without sending Telegram alerts) |

---

## 🧪 Backtesting Mode

Run the bot with `BACKTEST_MODE=true` to test your configuration without sending any Telegram messages:

```bash
BACKTEST_MODE=true npm start
```

Signals will be logged to the console and saved to the database, so you can review which tokens would have triggered alerts.

---

## 🗄 Signal History

Signals are stored in a local SQLite database (`./data/signals.db` by default). The schema is:

```sql
CREATE TABLE signals (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pairAddress  TEXT    NOT NULL,
  tokenAddress TEXT    NOT NULL,
  tokenSymbol  TEXT    NOT NULL,
  signalTypes  TEXT    NOT NULL,  -- JSON array
  score        REAL    NOT NULL,
  priceUsd     TEXT    NOT NULL,
  volumeH1     REAL    NOT NULL,
  marketCap    REAL    NOT NULL,
  createdAt    INTEGER NOT NULL   -- Unix ms timestamp
);
```

You can query it with any SQLite client:

```bash
sqlite3 data/signals.db "SELECT tokenSymbol, score, datetime(createdAt/1000,'unixepoch') FROM signals ORDER BY createdAt DESC LIMIT 20;"
```

---

## 🏗 Project Structure

```
solana-bot/
├── src/
│   ├── index.ts        # Entry point & graceful shutdown
│   ├── bot.ts          # Main scan loop orchestrator
│   ├── config.ts       # Environment variable loading & validation
│   ├── types.ts        # Shared TypeScript type definitions
│   ├── dexscreener.ts  # DexScreener API client
│   ├── analyzer.ts     # Pattern detection algorithms
│   ├── telegram.ts     # Telegram HTTP notifier
│   └── database.ts     # SQLite signal persistence
├── dist/               # Compiled JavaScript (generated by tsc)
├── data/               # SQLite database (generated at runtime)
├── .env.example        # Environment variable template
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## 🚀 Production Deployment

### Using PM2 (recommended)

```bash
npm install -g pm2
npm run build
pm2 start dist/index.js --name solana-bot
pm2 save
pm2 startup
```

### Using Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY dist/ dist/
CMD ["node", "dist/index.js"]
```

### Environment variables in production

Never commit `.env` to version control. Use your host's secret manager or a `.env` file outside the repository.

---

## ⚠️ Disclaimer

This bot is for **informational and educational purposes only**. Cryptocurrency trading involves significant financial risk. Always do your own research (DYOR) before making any investment decisions. The developers are not responsible for any losses incurred through use of this software.

---

## 📄 License

MIT
