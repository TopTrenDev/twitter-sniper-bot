import * as fs from "fs";
import { TweetResult, BuyTransaction, UserCache, CachedUser } from "../types";
import {
  CACHE_FILE,
  RESULTS_FILE,
  TRANSACTIONS_FILE,
} from "../config/environment";

export class FileManager {
  // User cache operations
  static loadUserCache(): UserCache {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const cacheData = fs.readFileSync(CACHE_FILE, "utf8");
        return JSON.parse(cacheData);
      }
    } catch (error) {
      console.log("⚠️ Cache file corrupted, creating new cache");
    }
    return {};
  }

  static saveUserToCache(username: string, userId: string): void {
    try {
      const cache = this.loadUserCache();
      cache[username] = {
        userId: userId,
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
      console.log(`💾 Cached user ID for @${username}: ${userId}`);
    } catch (error) {
      console.log("⚠️ Failed to save to cache:", error);
    }
  }

  // Results file operations
  static saveResultToFile(result: TweetResult): void {
    try {
      let results: TweetResult[] = [];

      // Load existing results
      if (fs.existsSync(RESULTS_FILE)) {
        const existingData = fs.readFileSync(RESULTS_FILE, "utf8");
        results = JSON.parse(existingData);
      }

      // Add new result
      results.push(result);

      // Save updated results
      fs.writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    } catch (error) {
      console.error("Error saving result:", error);
    }
  }

  // Buy transaction file operations
  static saveBuyTransactionResult(result: TweetResult): void {
    try {
      let transactions: BuyTransaction[] = [];

      // Load existing transactions
      if (fs.existsSync(TRANSACTIONS_FILE)) {
        const existingData = fs.readFileSync(TRANSACTIONS_FILE, "utf8");
        transactions = JSON.parse(existingData);
      }

      // Create transaction record with only the required fields
      const transactionRecord: BuyTransaction = {
        username: result.username,
        keyword: result.keyword,
        tokenCA: result.tokenCA!,
        buyAmount: result.purchaseAmount!,
        txId: result.buyTxId!,
        timestamp: result.purchaseTimestamp || new Date().toISOString(),
      };

      // Add new transaction
      transactions.push(transactionRecord);

      // Save updated transactions
      fs.writeFileSync(
        TRANSACTIONS_FILE,
        JSON.stringify(transactions, null, 2)
      );
      console.log(`💾 Buy transaction saved to ${TRANSACTIONS_FILE}`);
    } catch (error) {
      console.error("Error saving buy transaction:", error);
    }
  }
}
