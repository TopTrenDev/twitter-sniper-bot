import dotenv from "dotenv";

dotenv.config();

// RapidAPI Configuration
export const RAPID_API_KEY = process.env.RAPID_API_KEYS;
export const RAPID_HOST_NAME = process.env.RAPID_HOST_NAME;

// Jupiter and Solana configuration
export const QUICKNODE_RPC = process.env.QUICKNODE_RPC_URL;
export const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
export const JUPITER_API_BASE = process.env.JUPITER_API_BASE;
export const SLIPPAGE_BPS = process.env.SLIPPAGE_TOLERANCE || "100";

// Astralane configuration
export const ASTRALANE_URL = process.env.ASTRALANE_URL;
export const ASTRALANE_API_KEY = process.env.ASTRALANE_API_KEY;

// Monitoring configuration
export const LOOP_TIME_MINUTES = parseInt(process.env.LOOP_TIME || "0");
export const LOOP_TIME_MS = LOOP_TIME_MINUTES * 60 * 1000;

// Constants
export const INPUT_MINT = "So11111111111111111111111111111111111111112"; // wSOL
export const MIN_TIP_AMOUNT = 100_000; // lamports
export const DEFAULT_BUY_AMOUNT = 0.0001; // SOL

// File paths
export const CACHE_FILE = "user_id.json";
export const RESULTS_FILE = "detect_tweet_results.json";
export const TRANSACTIONS_FILE = "buy_transactions.json";

// Validation functions
export function validateSolanaConfig() {
  if (!QUICKNODE_RPC) {
    console.warn(
      "⚠️ QUICKNODE_RPC_URL not set - trading functionality will be disabled"
    );
    return false;
  }
  if (!WALLET_PRIVATE_KEY) {
    console.warn(
      "⚠️ WALLET_PRIVATE_KEY not set - trading functionality will be disabled"
    );
    return false;
  }
  return true;
}

export function validateAstralaneConfig() {
  if (!ASTRALANE_URL || !ASTRALANE_API_KEY) {
    console.log(
      "ℹ️ Astralane not configured - will use regular RPC for transaction confirmation"
    );
    return false;
  }
  console.log("✅ Astralane configured for fast transaction confirmation");
  return true;
}
