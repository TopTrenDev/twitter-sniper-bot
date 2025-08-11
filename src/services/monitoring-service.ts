import Pushover from "pushover-notifications";
import { MonitoringConfig, UserConfigWithId, TweetResult } from "../types";
import { TwitterAPI } from "./twitter-api";
import { FileManager } from "./file-manager";
import { SolanaService } from "./solana-service";
import {
  LOOP_TIME_MS,
  PUSHOVER_API_TOKEN,
  PUSHOVER_USER_KEY,
} from "../config/environment";

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

  // Add this method after the constructor
  public resetBaselines(): void {
    console.log("🔄 Resetting all user baselines...");
    this.lastProcessedTweetIds = {};
    console.log(
      "✅ All baselines reset. Next monitoring cycle will set new baselines."
    );
  }

  // Add this method to manually test a specific account
  public testAccount(username: string): void {
    console.log(`🧪 Testing account: @${username}`);

    const config = this.userConfigsWithIds.find((c) => c.username === username);
    if (!config) {
      console.log(`❌ Account @${username} not found in monitoring list`);
      return;
    }

    console.log(`🔍 Testing @${username} with user ID: ${config.userId}`);
    this.checkForNewTweets(config);
  }

  // Add this method to check current monitoring status
  public getMonitoringStatus(): void {
    console.log("\n📊 Current Monitoring Status:");
    console.log(`Active users: ${this.userConfigsWithIds.length}`);
    console.log(`Active pairs: ${this.activePairs.size}`);
    console.log(`Current user index: ${this.currentUserIndex}`);
    console.log("\n📋 User baselines:");
    this.userConfigsWithIds.forEach((config) => {
      const baseline = this.lastProcessedTweetIds[config.username] || "Empty";
      console.log(`  @${config.username}: ${baseline}`);
    });
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
    console.log(
      `📊 Total users to initialize: ${this.monitoringConfig.length}`
    );

    let initializedCount = 0;
    const totalUsers = this.monitoringConfig.length;

    this.monitoringConfig.forEach((config, index) => {
      const caInfo = config.tokenCA ? ` and CA "${config.tokenCA}"` : "";
      const keywordInfo =
        config.keyword.trim() === "" ? "(any tweet)" : `"${config.keyword}"`;
      console.log(
        `\n🎯 Initializing @${config.username} (${index + 1}/${totalUsers})`
      );
      console.log(`   🔍 Keyword: ${keywordInfo}`);
      console.log(`   💰 Buy Amount: ${config.buyAmount} SOL`);
      if (config.tokenCA) {
        console.log(`   🪙 Token CA: ${config.tokenCA}`);
      }

      // Get user ID and set baseline
      console.log(`🔍 Fetching user ID for @${config.username}...`);

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
          console.log(
            `📈 Initialization progress: ${initializedCount}/${totalUsers} users processed (${config.username} failed)`
          );

          if (initializedCount === totalUsers) {
            console.log(
              `\n⚠️ Some users failed to initialize, but proceeding with available users...`
            );
            this.startCyclingMonitoring();
          }
          return;
        }

        console.log(`✅ Got user ID for @${config.username}: ${userId}`);

        if (!userId || userId.trim() === "") {
          console.error(
            `❌ Invalid user ID for @${config.username}: "${userId}"`
          );
          const pairKey = `${config.username}-${config.keyword}`;
          this.activePairs.delete(pairKey);
          initializedCount++;
          if (initializedCount === totalUsers) {
            this.startCyclingMonitoring();
          }
          return;
        }

        // Store config with user ID for cycling
        this.userConfigsWithIds.push({
          ...config,
          userId: userId!,
        });

        // Set initial baseline
        console.log(`📊 Setting baseline for @${config.username}...`);
        this.setInitialBaselineForCycling(userId!, config, () => {
          initializedCount++;
          console.log(
            `📈 Initialization progress: ${initializedCount}/${totalUsers} users ready`
          );
          if (initializedCount === totalUsers) {
            console.log(
              `\n✅ All users initialized successfully! Starting monitoring...`
            );
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
    console.log(
      `🔍 Setting initial baseline for @${config.username} (User ID: ${userId})...`
    );

    TwitterAPI.getUserTweets(userId, (err, tweets) => {
      if (err) {
        console.log(`❌ API Error for @${config.username}: ${err}`);
        // Set empty baseline so we can still monitor
        this.lastProcessedTweetIds[config.username] = "";
        console.log(
          `⚠️ Setting empty baseline for @${config.username} due to API error`
        );
        callback();
        return;
      }

      if (tweets && tweets.length > 0) {
        const latestTweet = tweets[0];
        if (latestTweet && (latestTweet.id_str || latestTweet.id)) {
          const latestTweetId = latestTweet.id_str || latestTweet.id;
          this.lastProcessedTweetIds[config.username] = latestTweetId;
          console.log(
            `📊 Baseline set for @${config.username}: Latest tweet ID = ${latestTweetId} (${tweets.length} tweets available)`
          );
        } else {
          console.log(
            `⚠️ Invalid tweet structure for @${config.username} - setting empty baseline`
          );
          this.lastProcessedTweetIds[config.username] = "";
        }
      } else {
        console.log(
          `⚠️ No tweets found for @${config.username} - setting empty baseline`
        );
        this.lastProcessedTweetIds[config.username] = "";
      }

      // Log the final baseline state
      const baseline = this.lastProcessedTweetIds[config.username];
      console.log(
        `✅ @${config.username} baseline finalized: ${
          baseline || "Empty (will detect first tweet)"
        }`
      );

      callback();
    });
  }

  private startCyclingMonitoring(): void {
    console.log("🚀 Starting cycling monitoring...");
    console.log(
      `📊 Cycling through ${this.userConfigsWithIds.length} users with 0.5s spacing`
    );

    // Log all users being monitored
    console.log("\n📋 Users being monitored:");
    this.userConfigsWithIds.forEach((config, index) => {
      const baseline = this.lastProcessedTweetIds[config.username] || "Empty";
      console.log(
        `  ${index + 1}. @${
          config.username
        } - Baseline: ${baseline} - Keyword: "${config.keyword}"`
      );
    });

    // Start the cycling interval
    this.monitoringInterval = setInterval(() => {
      if (this.userConfigsWithIds.length === 0) {
        console.log("❌ No users to monitor");
        return;
      }

      const currentConfig = this.userConfigsWithIds[this.currentUserIndex];
      if (currentConfig) {
        const baseline =
          this.lastProcessedTweetIds[currentConfig.username] || "Empty";
        console.log(`\n🔄 Cycle Checking @${currentConfig.username}`);
        // console.log(`   📊 Current baseline: ${baseline}`);
        // console.log(`   🔍 Keyword: "${currentConfig.keyword}"`);
        // console.log(`   💰 Buy Amount: ${currentConfig.buyAmount} SOL`);

        // Add a small delay to avoid rate limiting
        setTimeout(() => {
          this.checkForNewTweets(currentConfig);
        }, 200); // 0.2 second between each user to reduce rate limiting
      }

      // Move to next user
      this.currentUserIndex =
        (this.currentUserIndex + 1) % this.userConfigsWithIds.length;

      // Log summary every 10 cycles
      if (this.currentUserIndex === 0) {
        // console.log(
        //   `\n📊 Monitoring Summary: ${this.userConfigsWithIds.length} users active, ${this.activePairs.size} pairs monitoring`
        // );
        // Log current baselines for all users
        // console.log("📋 Current baselines:");
        this.userConfigsWithIds.forEach((config) => {
          const baseline =
            this.lastProcessedTweetIds[config.username] || "Empty";
          // console.log(`  @${config.username}: ${baseline}`);
        });
      }
    }, 200); // 1 second between each user to reduce rate limiting
  }

  private async checkForNewTweets(config: UserConfigWithId): Promise<void> {
    console.log(
      `🔍 Fetching tweets for @${config.username} (User ID: ${config.userId})...`
    );

    TwitterAPI.getUserTweets(config.userId, async (err, tweets) => {
      if (err) {
        console.log(`❌ API Error for @${config.username}: ${err}`);
        return;
      }

      if (!tweets || tweets.length === 0) {
        console.log(`⚠️ No tweets found for @${config.username}`);
        return;
      }

      const currentTweet = tweets[0];

      if (!currentTweet) {
        console.log(`⚠️ Invalid tweet structure for @${config.username}`);
        return;
      }

      const currentTweetId = currentTweet.id_str || currentTweet.id;
      const lastTweetId = this.lastProcessedTweetIds[config.username];

      if (!currentTweetId) {
        console.log(
          `⚠️ No tweet ID found for @${config.username} - tweet structure:`,
          JSON.stringify(currentTweet, null, 2)
        );
        return;
      }

      if (isNaN(parseInt(currentTweetId))) {
        console.log(
          `⚠️ Invalid tweet ID format for @${config.username}: "${currentTweetId}"`
        );
        return;
      }

      // console.log(`📊 @${config.username} - Current Tweet ID: ${currentTweetId}, Last Processed: ${lastTweetId || 'None'}`);

      // Check if this is a truly new tweet (higher ID than baseline)
      if (!lastTweetId || lastTweetId === "") {
        console.log(
          `⚠️ No baseline set for @${config.username}, setting current tweet as baseline`
        );
        this.lastProcessedTweetIds[config.username] = currentTweetId;
        return;
      }

      if (isNaN(parseInt(lastTweetId))) {
        console.log(
          `⚠️ Invalid baseline tweet ID format for @${config.username}: "${lastTweetId}"`
        );
        this.lastProcessedTweetIds[config.username] = currentTweetId;
        return;
      }

      // Convert to numbers for proper comparison (Twitter IDs are chronological)
      const currentIdNum = parseInt(currentTweetId);
      const lastIdNum = parseInt(lastTweetId);

      // console.log(
      //   `🔢 @${
      //     config.username
      //   } - Tweet ID comparison: Current: ${currentIdNum}, Last: ${lastIdNum}, Is newer: ${
      //     currentIdNum > lastIdNum
      //   }`
      // );

      // Check if this is a new tweet (higher ID than baseline)
      if (currentIdNum > lastIdNum) {
        console.log(
          `\n🆕 NEW TWEET DETECTED from @${config.username}! Tweet ID: ${currentTweetId} (Previous: ${lastTweetId})`
        );

        // Update baseline to current tweet
        this.lastProcessedTweetIds[config.username] = currentTweetId;

        // Check if this new tweet matches our criteria
        const text = currentTweet.full_text || currentTweet.text || "";

        if (!text || text.trim() === "") {
          console.log(`⚠️ Empty tweet text for @${config.username}`);
          return;
        }

        console.log(`📱 Tweet text: "${text.substring(0, 100)}..."`);
        console.log(`🔍 Checking keyword: "${config.keyword}"`);

        // If keyword is empty, any tweet should trigger purchase
        // If keyword is not empty, check if tweet contains the keyword
        const hasKeyword =
          config.keyword.trim() === "" ||
          text.toLowerCase().includes(config.keyword.toLowerCase());

        console.log(`🎯 Keyword match: ${hasKeyword ? "YES" : "NO"}`);

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
            console.log(`  Buy Amount: ${config.buyAmount} SOL (from config)`);

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

              await this.sendNotification(
                "🚀 Buy Tx Succeed!",
                `
    Username: @${result.username}
    Keyword: ${result.keyword ? result.keyword : "No keyword"}
    Token CA: ${result.tokenCA}
    Buy Amount: ${result.purchaseAmount} SOL
    Tx Signature: https://solscan.io/tx/${result.buyTxId}
                `
              );

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
      }
      // else if (currentIdNum === lastIdNum) {
      //   console.log(
      //     `⏭️ Same tweet ID for @${config.username} - no new content`
      //   );
      // } else {
      //   console.log(
      //     `⏭️ Skipping tweet from @${config.username} - not newer than baseline (Current: ${currentTweetId}, Baseline: ${lastTweetId})`
      //   );
      // }
    });
  }

  private stopMonitoringPair(config: UserConfigWithId): void {
    const pairKey = `${config.username}-${config.keyword}`;
    this.activePairs.delete(pairKey);

    console.log(
      `⏹️  Stopped monitoring @${config.username} for keyword "${config.keyword}"`
    );

    // Remove from cycling array
    const beforeCount = this.userConfigsWithIds.length;
    this.userConfigsWithIds = this.userConfigsWithIds.filter(
      (userConfig) =>
        !(
          userConfig.username === config.username &&
          userConfig.keyword === config.keyword
        )
    );
    const afterCount = this.userConfigsWithIds.length;

    if (beforeCount !== afterCount) {
      console.log(
        `📊 Removed monitoring pair: ${beforeCount} → ${afterCount} users remaining`
      );
    }

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

  private async sendNotification(title: string, message: string) {
    const response = await fetch("https://api.pushover.net/1/messages.json", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        token: PUSHOVER_API_TOKEN,
        user: PUSHOVER_USER_KEY,
        title: title,
        message: message,
      }),
    });

    if (!response.ok) {
      console.error("Pushover send failed:", await response.text());
    } else {
      console.log("Notification sent!");
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
