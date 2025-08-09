import { MonitoringConfig, UserConfigWithId, TweetResult } from "../types";
import { TwitterAPI } from "./twitter-api";
import { FileManager } from "./file-manager";
import { SolanaService } from "./solana-service";
import { LOOP_TIME_MS } from "../config/environment";

export class MonitoringService {
  private lastProcessedTweetIds: { [username: string]: string } = {};
  private isMonitoring = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private timeoutTimer: NodeJS.Timeout | null = null;
  private activePairs = new Set<string>();
  private userConfigsWithIds: UserConfigWithId[] = [];
  private currentUserIndex = 0;
  private solanaService: SolanaService | null = null;

  constructor(private monitoringConfig: MonitoringConfig[]) {
    // Initialize Solana service if credentials are available
    const {
      QUICKNODE_RPC,
      WALLET_PRIVATE_KEY,
    } = require("../config/environment");
    if (QUICKNODE_RPC && WALLET_PRIVATE_KEY) {
      this.solanaService = new SolanaService(QUICKNODE_RPC, WALLET_PRIVATE_KEY);
    }
  }

  start(): void {
    if (this.isMonitoring) {
      console.log("🔄 Already monitoring, stopping previous session...");
      this.stop();
    }

    if (this.monitoringConfig.length === 0) {
      console.error("❌ No monitoring configuration found!");
      console.log(
        "💡 Please set up your .env file with monitoring configuration:"
      );
      return;
    }

    console.log("🚀 Starting multi-user real-time monitoring...");
    console.log(
      `📊 Monitoring ${this.monitoringConfig.length} user-keyword combinations:`
    );

    this.monitoringConfig.forEach((config, index) => {
      const caInfo = config.tokenCA ? ` - CA: ${config.tokenCA}` : "";
      const keywordInfo =
        config.keyword.trim() === "" ? "(any tweet)" : `"${config.keyword}"`;
      console.log(
        `  ${index + 1}. @${
          config.username
        } - keyword: ${keywordInfo}${caInfo} - Buy Amount: ${
          config.buyAmount
        } SOL`
      );
      // Add to active pairs
      const pairKey = `${config.username}-${config.keyword}`;
      this.activePairs.add(pairKey);
    });

    console.log(
      "⏰ Cycling through users with 0.5s spacing between each request..."
    );

    this.isMonitoring = true;
    if (LOOP_TIME_MS > 0) {
      this.timeoutTimer = setTimeout(() => {
        console.log(
          `\n⚠️ Monitoring timeout reached. Stopping all monitoring.`
        );
        this.stop();
        process.exit(0);
      }, LOOP_TIME_MS);
    }

    // Initialize all users first
    this.initializeAllUsers();
  }

  private initializeAllUsers(): void {
    console.log("🔄 Initializing all users...");

    let initializedCount = 0;
    const totalUsers = this.monitoringConfig.length;

    this.monitoringConfig.forEach((config) => {
      const caInfo = config.tokenCA ? ` and CA "${config.tokenCA}"` : "";
      const keywordInfo =
        config.keyword.trim() === "" ? "(any tweet)" : `"${config.keyword}"`;
      console.log(
        `\n🎯 Initializing @${config.username} with keyword ${keywordInfo}${caInfo} - Buy Amount: ${config.buyAmount} SOL`
      );

      // Get user ID and set baseline
      TwitterAPI.getUserId(config.username, (err, userId) => {
        if (err) {
          console.error(
            `❌ Failed to get user ID for @${config.username}:`,
            err
          );
          // Remove from active pairs if user ID fetch failed
          const pairKey = `${config.username}-${config.keyword}`;
          this.activePairs.delete(pairKey);
          initializedCount++;

          if (initializedCount === totalUsers) {
            this.startCyclingMonitoring();
          }
          return;
        }

        console.log(`✅ Got user ID for @${config.username}: ${userId}`);

        // Store config with user ID for cycling
        this.userConfigsWithIds.push({
          ...config,
          userId: userId!,
        });

        // Set initial baseline
        this.setInitialBaselineForCycling(userId!, config, () => {
          initializedCount++;
          if (initializedCount === totalUsers) {
            this.startCyclingMonitoring();
          }
        });
      });
    });
  }

  private setInitialBaselineForCycling(
    userId: string,
    config: MonitoringConfig,
    callback: () => void
  ): void {
    TwitterAPI.getUserTweets(userId, (err, tweets) => {
      if (err) {
        console.log(`❌ API Error for @${config.username}: ${err}`);
        callback();
        return;
      }

      if (tweets && tweets.length > 0) {
        const latestTweetId = tweets[0].id_str || tweets[0].id;
        this.lastProcessedTweetIds[config.username] = latestTweetId;
        console.log(
          `📊 Baseline set for @${config.username}: Latest tweet ID = ${latestTweetId}`
        );
      }
      callback();
    });
  }

  private startCyclingMonitoring(): void {
    console.log("🚀 Starting cycling monitoring...");
    console.log(
      `📊 Cycling through ${this.userConfigsWithIds.length} users with 0.5s spacing`
    );

    // Start the cycling interval
    this.monitoringInterval = setInterval(() => {
      console.log(
        `🔄 Cycling to next user... ${
          this.userConfigsWithIds[this.currentUserIndex].username
        }`
      );

      if (this.userConfigsWithIds.length === 0) {
        console.log("❌ No users to monitor");
        return;
      }

      const currentConfig = this.userConfigsWithIds[this.currentUserIndex];
      if (currentConfig) {
        this.checkForNewTweets(currentConfig);
      }

      // Move to next user
      this.currentUserIndex =
        (this.currentUserIndex + 1) % this.userConfigsWithIds.length;
    }, 500); // 0.5 seconds between each user
  }

  private async checkForNewTweets(config: UserConfigWithId): Promise<void> {
    TwitterAPI.getUserTweets(config.userId, async (err, tweets) => {
      if (err) {
        console.log(`❌ API Error: ${err}`);
        return;
      }

      if (!tweets || tweets.length === 0) {
        return;
      }

      const currentTweet = tweets[0];
      const currentTweetId = currentTweet.id_str || currentTweet.id;
      const lastTweetId = this.lastProcessedTweetIds[config.username];

      // Check if this is a truly new tweet (higher ID than baseline)
      if (lastTweetId && currentTweetId !== lastTweetId) {
        // Convert to numbers for proper comparison (Twitter IDs are chronological)
        const currentIdNum = parseInt(currentTweetId);
        const lastIdNum = parseInt(lastTweetId);

        // Only process if current tweet is newer (higher ID)
        if (currentIdNum > lastIdNum) {
          console.log(
            `\n🆕 NEW TWEET DETECTED from @${config.username}! Tweet ID: ${currentTweetId} (Previous: ${lastTweetId})`
          );

          // Update baseline to current tweet
          this.lastProcessedTweetIds[config.username] = currentTweetId;

          // Check if this new tweet matches our criteria
          const text = currentTweet.full_text || currentTweet.text || "";

          // If keyword is empty, any tweet should trigger purchase
          // If keyword is not empty, check if tweet contains the keyword
          const hasKeyword =
            config.keyword.trim() === "" ||
            text.toLowerCase().includes(config.keyword.toLowerCase());

          if (hasKeyword) {
            const matchReason =
              config.keyword.trim() === ""
                ? "any tweet (no keyword filter)"
                : `contains keyword "${config.keyword}"`;
            console.log(
              `🎯 MATCH FOUND! Tweet from @${config.username} ${matchReason}!`
            );

            const result: TweetResult = {
              username: config.username,
              keyword: config.keyword,
              tokenCA: config.tokenCA || null,
              tweetText: text,
              tweetId: currentTweetId,
              timestamp: new Date().toISOString(),
              detectedAt: new Date().toISOString(),
            };

            // Save to results file
            FileManager.saveResultToFile(result);

            // Log the result
            console.log(`\n🚨 TARGET DETECTED!`);
            console.log(`  Username: @${result.username}`);
            console.log(`  Keyword: "${result.keyword}"`);
            if (result.tokenCA) {
              console.log(`  Token CA: ${result.tokenCA}`);
            }
            console.log(`  Tweet: "${result.tweetText.substring(0, 100)}..."`);
            console.log(`  Tweet ID: ${result.tweetId}`);
            console.log(`  Detected at: ${result.detectedAt}`);

            // Execute token purchase if CA is available and trading is enabled
            if (result.tokenCA && this.solanaService) {
              console.log(`\n💰 EXECUTING TOKEN PURCHASE!`);
              console.log(`  Token CA: ${result.tokenCA}`);
              console.log(
                `  Buy Amount: ${config.buyAmount} SOL (from config)`
              );

              const purchaseResult =
                await this.solanaService.executeTokenPurchase(
                  result.tokenCA,
                  config.buyAmount
                );

              if (purchaseResult && purchaseResult.buyTxId) {
                console.log(`✅ Token purchase completed successfully!`);

                // Update result with purchase info
                result.purchaseExecuted = true;
                result.purchaseAmount = config.buyAmount;
                result.purchaseTimestamp = new Date().toISOString();
                result.buyTxId = purchaseResult.buyTxId;

                // Save updated result to detection file
                FileManager.saveResultToFile(result);

                // Save buy transaction to separate file
                FileManager.saveBuyTransactionResult(result);
              } else {
                console.log(`❌ Token purchase failed!`);
                result.purchaseExecuted = false;
                result.purchaseError = "Purchase execution failed";
                FileManager.saveResultToFile(result);
              }
            } else if (!result.tokenCA) {
              console.log(
                `⚠️ No token CA provided for this match - skipping purchase`
              );
            } else {
              console.log(`⚠️ Trading not enabled - skipping purchase`);
            }

            // Stop monitoring only this specific pair
            const stopReason =
              config.keyword.trim() === ""
                ? "any tweet detected"
                : `keyword "${config.keyword}" found`;
            console.log(
              `\n✅ Target found for @${config.username} (${stopReason})! Stopping this pair only.`
            );
            this.stopMonitoringPair(config);
          } else {
            console.log(
              `❌ Tweet from @${config.username} doesn't match criteria (keyword filter: "${config.keyword}")`
            );
          }
        } else {
          console.log(
            `⏭️ Skipping tweet from @${config.username} - not newer than baseline (Current: ${currentTweetId}, Baseline: ${lastTweetId})`
          );
        }
      }
    });
  }

  private stopMonitoringPair(config: UserConfigWithId): void {
    const pairKey = `${config.username}-${config.keyword}`;
    this.activePairs.delete(pairKey);

    console.log(
      `⏹️  Stopped monitoring @${config.username} for keyword "${config.keyword}"`
    );

    // Remove from cycling array
    this.userConfigsWithIds = this.userConfigsWithIds.filter(
      (userConfig) =>
        !(
          userConfig.username === config.username &&
          userConfig.keyword === config.keyword
        )
    );

    // Check if all pairs are stopped
    if (this.activePairs.size === 0) {
      console.log(
        `\n✅ All monitoring pairs completed. Stopping all monitoring.`
      );
      this.stop();
      process.exit(0);
    } else {
      console.log(`📊 ${this.activePairs.size} pair(s) still monitoring...`);
    }
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    // Clear all active pairs and user configs
    this.activePairs.clear();
    this.userConfigsWithIds = [];
    this.currentUserIndex = 0;

    if (this.timeoutTimer) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
    this.isMonitoring = false;
    console.log("⏹️  All monitoring stopped");
  }
}
