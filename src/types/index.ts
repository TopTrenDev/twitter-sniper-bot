export interface MonitoringConfig {
  username: string;
  keyword: string;
  tokenCA: string | null;
  buyAmount: number;
}

// New interface for grouped configurations
export interface GroupedMonitoringConfig {
  username: string;
  userId?: string; // Twitter user ID for caching
  keywords: KeywordConfig[];
}

export interface KeywordConfig {
  keyword: string;
  tokens: TokenConfig[];
}

export interface TokenConfig {
  tokenCA: string | null;
  buyAmount: number;
  count: number; // How many times this token appears for this keyword
}

// Legacy interface for backward compatibility
export interface UserConfigWithId extends MonitoringConfig {
  userId: string;
}

export interface TweetResult {
  username: string;
  keyword: string;
  tokenCA: string | null;
  tweetText: string;
  tweetId: string;
  timestamp: string;
  detectedAt: string;
  purchaseExecuted?: boolean;
  purchaseAmount?: number;
  purchaseTimestamp?: string;
  buyTxId?: string;
  purchaseError?: string;
}

export interface BuyTransaction {
  username: string;
  keyword: string;
  tokenCA: string;
  buyAmount: number;
  txId: string;
  timestamp: string;
}

export interface JupiterQuote {
  outAmount: string;
  [key: string]: any;
}

export interface JupiterSwapInstructions {
  tokenLedgerInstruction?: any;
  computeBudgetInstructions: any[];
  setupInstructions: any[];
  swapInstruction: any;
  cleanupInstruction: any;
  addressLookupTableAddresses: string[];
}

export interface AstralaneResponse {
  result?: string;
  error?: any;
}

export interface PurchaseResult {
  tokenCA: string;
  amountInSOL: number;
  timestamp: string;
  buyTxId: string;
}

export interface CachedUser {
  userId: string;
  timestamp: string;
}

export interface UserCache {
  [username: string]: CachedUser;
}
