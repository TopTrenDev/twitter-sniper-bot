# 🚀 Twitter Keyword-Triggered Token Buyer Bot

## 📊 Configuration Options

You can configure monitoring settings using either:
1. **Excel File (Recommended)** - Easy to manage multiple users
2. **Environment Variables** - Traditional method

### 1️⃣ Install Dependencies

```
npm install
```

At the moment, npm is already installed, so don't worry about it.

### 2️⃣ Configuration Method A: Excel File (Recommended)

**Step 1:** Generate the Excel template:
```
npm run generate-template
```

This will create `monitoring-config-template.xlsx` with sample data.

**Step 2:** Edit the template:
- Open `monitoring-config-template.xlsx` in Excel or Google Sheets
- Modify the rows with your desired configurations:
  - **username**: Twitter username to monitor (without @)
  - **keyword**: Keyword to search for in tweets
  - **tokenCA**: Token contract address (leave empty if not specific)
  - **buyAmount**: Amount in SOL to purchase (e.g., 0.0001)
- Add more rows to monitor additional users
- Save the file as `monitoring-config.xlsx`

**Example Excel Data:**
| username | keyword | tokenCA | buyAmount |
|----------|---------|---------|-----------|
| elonmusk | coin | EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v | 0.0002 |
| elonmusk | solana | EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v | 0.0001 |
| vitalikbuterin | launch |  | 0.0005 |

### 2️⃣ Configuration Method B: Environment Variables

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

If you want to trigger more accounts, you can add the user, keyword, token CA, and buy amount in the .env file as shown above, increasing the index number accordingly.

### 3️⃣ Required Environment Variables (Both Methods)

Even when using Excel, you still need these in your .env file:

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
SLIPPAGE_TOLERANCE = 100
LOOP_TIME = 100
```

### 4️⃣ Run the Bot

```
npm start
```

### 5️⃣ Stop the Bot

In the terminal, pressing `Ctrl + C` will instantly stop the bot.

## 💡 Advantages of Excel Configuration

- ✅ **Easy to manage** multiple users and keywords
- ✅ **Visual editing** in Excel/Google Sheets
- ✅ **Quick modifications** without editing environment files
- ✅ **Add/remove users** easily
- ✅ **Backup and share** configurations
- ✅ **No manual indexing** required

## 🛠️ Available Commands

- `npm start` - Start the monitoring bot
- `npm run dev` - Start with hot reload for development
- `npm run generate-template` - Generate Excel configuration template
- `npm run build` - Build TypeScript to JavaScript
- `npm run clean` - Clean build directory

## 📲 Example Pushover Notification

You can receive notifications through your Pushover app.

```
🚀 Trade Executed!
Account: @elonmusk
Keyword: launch
Token: $YOURTOKEN_CA
Amount: 1.5 SOL
Transaction: https://solscan.io/tx/xxxxxxxx
```
