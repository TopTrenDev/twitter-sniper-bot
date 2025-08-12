# 🚀 Twitter Keyword-Triggered Token Buyer Bot

## 📌 Overview

This project is an **automated Solana trading bot** that listens to a specific Twitter account in real-time, detects **predefined keywords** in new tweets, and instantly **buys a target token** using Jupiter swap — with **MEV protection** and **push notifications**.

It’s built for **speed, reliability, and security**, combining Twitter-based alpha detection with fast execution on Solana.

---

## ⚙️ Workflow

1. **🔍 Monitor Tweets** – The bot uses the **Twitter API** to listen to a chosen Twitter account in real-time.
2. **📝 Keyword Detection** – When a tweet contains one of your predefined keywords, the bot springs into action.
3. **💸 Execute Token Swap** – It sends a swap transaction via **Jupiter API**, instantly buying your preconfigured token.
4. **🛡 MEV Protection** – All trades are routed through **Astralane API** to avoid frontrunning and speed up confirmation.
5. **📲 Notification** – **Pushover** sends an instant alert to your phone or desktop with trade details.
6. **📜 Logging** – All detected tweets and executed trades are saved locally for auditing.

---

## 🚀 Getting Started

### 1️⃣ Clone Repository

```
git clone https://github.com/toptrendev/twitter-sniper-bot.git
cd twitter-sniper-bot
```

### 2️⃣ Install Dependencies

```
npm install
```

### 3️⃣ Configure Environment Variables

Create a .env file:

```
WALLET_PRIVATE_KEY =

QUICKNODE_RPC_URL =
JUPITER_API_BASE =

RAPID_HOST_NAME =
RAPID_API_KEYS =

ASTRALANE_URL =
ASTRALANE_API_KEY =

PUSHOVER_API_TOKEN =
PUSHOVER_USER_KEY =

MONITOR_USER1 = 'elonmusk'
MONITOR_KEYWORD1 = 'coin'
MONITOR_CA1 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
MONITOR_BUY_AMOUNT1 = 0.0002

MONITOR_USER2 = 'elonmusk'
MONITOR_KEYWORD2 = 'solana'
MONITOR_CA2 = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
MONITOR_BUY_AMOUNT2 = 0.0001

SLIPPAGE_TOLERANCE = 100    # 1%

LOOP_TIME = 100
```

### 4️⃣ Run the Bot

```
npm start
```

---

## 📲 Example Pushover Notification

```
🚀 Trade Executed!
Account: @elonmusk
Keyword: launch
Token: $YOURTOKEN_CA
Amount: 1.5 SOL
Transaction: https://solscan.io/tx/xxxxxxxx
```

## 📬 **Let’s Connect & Build Together**

<p align="center">
  <a href="https://x.com/toptrendev" target="_blank">
    <img src="https://img.shields.io/badge/Twitter-%23000000.svg?&style=for-the-badge&logo=X&logoColor=white" />
  </a>
  <a href="https://discord.com/users/648385188774019072" target="_blank">
    <img src="https://img.shields.io/badge/Discord-%235865F2.svg?&style=for-the-badge&logo=discord&logoColor=white" />
  </a>
  <a href="https://t.me/toptrendev_641" target="_blank">
    <img src="https://img.shields.io/badge/Telegram-%230088cc.svg?&style=for-the-badge&logo=telegram&logoColor=white" />
  </a>
</p>

<p align="center">
  💬 Open for collaborations, discussions, and cool blockchain ideas! 
</p>
