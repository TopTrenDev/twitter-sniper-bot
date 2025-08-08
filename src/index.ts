import * as fs from "fs";
import dotenv from "dotenv";
import {
  Connection,
  Transaction,
  VersionedTransaction,
  Keypair,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import fetch from "node-fetch";
import bs58 from "bs58";

dotenv.config();

const https = require("https");

const RAPID_API_KEY = process.env.RAPID_API_KEYS;
const RAPID_HOST_NAME = process.env.RAPID_HOST_NAME;

// Jupiter and Solana configuration
const QUICKNODE_RPC = process.env.QUICKNODE_RPC_URL;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;

// Validate Solana environment variables
if (!QUICKNODE_RPC) {
  console.warn(
    "⚠️ QUICKNODE_RPC_URL not set - trading functionality will be disabled"
  );
}
if (!WALLET_PRIVATE_KEY) {
  console.warn(
    "⚠️ WALLET_PRIVATE_KEY not set - trading functionality will be disabled"
  );
}

// Initialize Solana connection and wallet if credentials are available
let connection: Connection | null = null;
let buyer: Keypair | null = null;

if (QUICKNODE_RPC && WALLET_PRIVATE_KEY) {
  try {
    connection = new Connection(QUICKNODE_RPC, "confirmed");
    buyer = Keypair.fromSecretKey(bs58.decode(WALLET_PRIVATE_KEY));
    console.log("✅ Solana connection and wallet initialized for trading");
  } catch (error) {
    console.error("❌ Failed to initialize Solana connection:", error);
  }
}

// Jupiter API configuration
const JUPITER_API_BASE = process.env.JUPITER_API_BASE;
const inputMint = "So11111111111111111111111111111111111111112"; // wSOL
const slippageBps = 100; // 1%

// Jupiter trading functions
async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: string,
  slippageBps: number
) {
  console.log("🔄 Getting Jupiter quote...");
  console.log(
    `Input: ${amount} lamports of ${inputMint} (${parseInt(amount) / 1e9} SOL)`
  );
  console.log(`Output: ${outputMint}`);
  console.log(`Slippage: ${slippageBps} bps`);

  // Validate amount parameter
  const amountInt = parseInt(amount);
  if (isNaN(amountInt) || amountInt <= 0) {
    throw new Error(
      `Invalid amount parameter: ${amount}. Must be a positive integer.`
    );
  }

  try {
    const url = `${JUPITER_API_BASE}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountInt}&slippageBps=${slippageBps}`;

    const response = await fetch(url, {
      // @ts-ignore - timeout is supported in node-fetch
      timeout: 30000,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Jupiter API error:", errorText);
      throw new Error(
        `Jupiter API failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;
    console.log("✅ Quote received successfully");
    console.log(`Quote: ${data.outAmount} output tokens`);
    return data;
  } catch (error: any) {
    console.error("❌ Quote error:", error.message);
    throw error;
  }
}

async function buildJupiterSwapTransaction(quote: any, userPublicKey: string) {
  console.log("🔨 Building Jupiter swap transaction...");

  try {
    const url = `${JUPITER_API_BASE}/swap`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey,
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: 1000,
      }),
      // @ts-ignore - timeout is supported in node-fetch
      timeout: 30000,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Jupiter API swap error:", errorText);
      throw new Error(
        `Jupiter API swap failed: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as any;
    console.log("✅ Swap transaction built successfully");
    return data.swapTransaction;
  } catch (error: any) {
    console.error("❌ Swap transaction build error:", error.message);
    throw error;
  }
}

async function executeTokenPurchase(tokenCA: string, amountInSOL: number) {
  if (!connection || !buyer) {
    console.error("❌ Trading not enabled - missing Solana credentials");
    return false;
  }

  // Validate amount
  if (isNaN(amountInSOL) || amountInSOL <= 0) {
    console.error(
      `❌ Invalid amount: ${amountInSOL} SOL. Must be a positive number.`
    );
    return false;
  }

  try {
    console.log(`🚀 Executing token purchase for CA: ${tokenCA}`);
    console.log(`💰 Amount: ${amountInSOL} SOL`);

    const amountIn = Math.floor(amountInSOL * 1e9).toString(); // Convert SOL to lamports and ensure it's an integer

    // Test RPC connection first
    console.log("🔍 Testing RPC connection...");
    const slot = await connection.getSlot();
    console.log("✅ RPC connection working, current slot:", slot);

    // Get Jupiter quote
    const quote = await getJupiterQuote(
      inputMint,
      tokenCA,
      amountIn,
      slippageBps
    );

    // Check if we have a valid quote
    if (!quote || !quote.outAmount) {
      console.error("❌ No valid quote received");
      return false;
    }

    console.log(`✅ Quote received: ${quote.outAmount} output tokens`);

    // Build swap transaction
    const swapTransaction = await buildJupiterSwapTransaction(
      quote,
      buyer.publicKey.toBase58()
    );

    // Send transaction using QuickNode RPC
    console.log("📡 Sending transaction...");

    // Try to deserialize as versioned transaction first, then legacy
    let tx;
    let isVersioned = false;
    try {
      tx = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, "base64")
      );
      console.log("✅ Using versioned transaction");
      isVersioned = true;
    } catch (versionedError) {
      console.log("📝 Falling back to legacy transaction");
      tx = Transaction.from(Buffer.from(swapTransaction, "base64"));
    }

    // Sign the transaction
    if (isVersioned) {
      (tx as VersionedTransaction).sign([buyer]);
    } else {
      (tx as Transaction).sign(buyer);
    }

    const txid = await sendAndConfirmRawTransaction(
      connection,
      Buffer.from(
        isVersioned
          ? (tx as VersionedTransaction).serialize()
          : (tx as Transaction).serialize()
      )
    );

    console.log("🎉 Token purchase executed successfully!");
    console.log("📋 Transaction ID:", txid);
    return true;
  } catch (error) {
    console.error("❌ Error during token purchase:", error);
    return false;
  }
}

// Parse monitoring configuration from environment variables
function parseMonitoringConfig() {
  const config = [];

  // Read configuration from environment variables
  // Format: MONITOR_USER1=username1, MONITOR_KEYWORD1=keyword1, MONITOR_CA1=token_ca_address
  //         MONITOR_USER2=username2, MONITOR_KEYWORD2=keyword2, MONITOR_CA2=token_ca_address, etc.

  let index = 1;
  console.log("🔍 Parsing monitoring configuration...");
  while (true) {
    const userKey = `MONITOR_USER${index}`;
    const keywordKey = `MONITOR_KEYWORD${index}`;
    const caKey = `MONITOR_CA${index}`;

    const username = process.env[userKey];
    const keyword = process.env[keywordKey];
    const tokenCA = process.env[caKey];

    if (!username) {
      break; // Stop when no more configuration found
    }

    // Allow empty keywords (empty string is valid)
    if (keyword === undefined) {
      console.log(`  ⏹️  Stopping at index ${index} - keyword undefined`);
      break; // Stop when no more configuration found
    }

    console.log(
      `  ✅ Found config ${index}: @${username} - keyword: "${keyword}" - CA: ${
        tokenCA || "none"
      }`
    );

    config.push({
      username: username.trim(),
      keyword: keyword.trim(),
      tokenCA: tokenCA ? tokenCA.trim() : null,
    });

    index++;
  }

  console.log(`📊 Total configurations found: ${config.length}`);
  return config;
}

// Get monitoring configuration
const MONITORING_CONFIG = parseMonitoringConfig();

// Fallback to single user if no multi-user config found
if (MONITORING_CONFIG.length === 0) {
  const username = process.env.USER_NAME;
  const keyword = process.env.KEYWORD;
  const tokenCA = process.env.TOKEN_CA;

  if (username && keyword !== undefined) {
    MONITORING_CONFIG.push({
      username: username.trim(),
      keyword: keyword.trim(),
      tokenCA: tokenCA ? tokenCA.trim() : null,
    });
  }
}

// Parse loop time from environment (in minutes)
const LOOP_TIME_MINUTES = parseInt(process.env.LOOP_TIME) || 0; // 0 means no timeout
const LOOP_TIME_MS = LOOP_TIME_MINUTES * 60 * 1000; // Convert to milliseconds

// Cache file for storing username to userID mappings
const CACHE_FILE = "user_cache.json";

// Global variables for real-time monitoring
let lastProcessedTweetIds = {}; // Track last tweet ID for each user
let isMonitoring = false;
let monitoringInterval = null;
let timeoutTimer = null; // Timer for loop timeout
let startTime = null; // Track when monitoring started
let activePairs = new Set(); // Track which user-keyword pairs are still active
let userConfigsWithIds = []; // Store user configs with their IDs for cycling
let currentUserIndex = 0; // Current user index in the cycle

// Function to load cached user IDs
function loadUserCache() {
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

// Function to save user ID to cache
function saveUserToCache(username, userId) {
  try {
    const cache = loadUserCache();
    cache[username] = {
      userId: userId,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
    console.log(`💾 Cached user ID for @${username}: ${userId}`);
  } catch (error) {
    console.log("⚠️ Failed to save to cache:", error.message);
  }
}

// Function to get user ID (from cache or API)
function getUserId(username, callback) {
  // First, check if we have it cached
  const cache = loadUserCache();
  const cachedUser = cache[username];

  if (cachedUser && cachedUser.userId) {
    console.log(
      `✅ Found cached user ID for @${username}: ${cachedUser.userId}`
    );
    console.log(`📅 Cached on: ${cachedUser.timestamp}`);
    callback(null, cachedUser.userId);
    return;
  }

  // If not cached, fetch from API
  console.log(`🔍 Fetching user ID for @${username}...`);

  const options = {
    method: "GET",
    hostname: RAPID_HOST_NAME,
    path: `/user?username=${username}`,
    headers: {
      "x-rapidapi-key": RAPID_API_KEY,
      "x-rapidapi-host": RAPID_HOST_NAME,
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try {
        const json = JSON.parse(data);
        const userId = json.result?.data?.user?.result?.rest_id || null;

        if (userId) {
          // Save to cache for future use
          saveUserToCache(username, userId);
          callback(null, userId);
        } else {
          callback("No user ID found in response");
        }
      } catch (err) {
        callback("Failed to parse JSON: " + err);
      }
    });
  });

  req.on("error", (err) => callback("Request error: " + err));
  req.end();
}

// Real-time monitoring function for multiple users
function startMultiUserMonitoring() {
  if (isMonitoring) {
    console.log("🔄 Already monitoring, stopping previous session...");
    stopRealTimeMonitoring();
  }

  if (MONITORING_CONFIG.length === 0) {
    console.error("❌ No monitoring configuration found!");
    console.log(
      "💡 Please set up your .env file with monitoring configuration:"
    );
    console.log("   MONITOR_USER1=username1");
    console.log("   MONITOR_KEYWORD1=keyword1");
    console.log("   MONITOR_USER2=username2");
    console.log("   MONITOR_KEYWORD2=keyword2");
    return;
  }

  console.log("🚀 Starting multi-user real-time monitoring...");
  console.log(
    `📊 Monitoring ${MONITORING_CONFIG.length} user-keyword combinations:`
  );

  MONITORING_CONFIG.forEach((config, index) => {
    const caInfo = config.tokenCA ? ` - CA: ${config.tokenCA}` : "";
    const keywordInfo =
      config.keyword.trim() === "" ? "(any tweet)" : `"${config.keyword}"`;
    console.log(
      `  ${index + 1}. @${config.username} - keyword: ${keywordInfo}${caInfo}`
    );
    // Add to active pairs
    const pairKey = `${config.username}-${config.keyword}`;
    activePairs.add(pairKey);
  });

  console.log(
    "⏰ Cycling through users with 0.5s spacing between each request..."
  );

  isMonitoring = true;
  startTime = new Date(); // Set start time
  if (LOOP_TIME_MS > 0) {
    timeoutTimer = setTimeout(() => {
      console.log(
        `\n⚠️ Monitoring timeout reached (${LOOP_TIME_MINUTES} minutes). Stopping all monitoring.`
      );
      stopRealTimeMonitoring();
      process.exit(0); // Exit the program
    }, LOOP_TIME_MS);
  }

  // Initialize all users first (get their IDs and set baselines)
  initializeAllUsers();
}

// Initialize all users and start cycling monitoring
function initializeAllUsers() {
  console.log("🔄 Initializing all users...");

  let initializedCount = 0;
  const totalUsers = MONITORING_CONFIG.length;

  MONITORING_CONFIG.forEach((config) => {
    const caInfo = config.tokenCA ? ` and CA "${config.tokenCA}"` : "";
    const keywordInfo =
      config.keyword.trim() === "" ? "(any tweet)" : `"${config.keyword}"`;
    console.log(
      `\n🎯 Initializing @${config.username} with keyword ${keywordInfo}${caInfo}`
    );

    // Get user ID and set baseline
    getUserId(config.username, (err, userId) => {
      if (err) {
        console.error(`❌ Failed to get user ID for @${config.username}:`, err);
        // Remove from active pairs if user ID fetch failed
        const pairKey = `${config.username}-${config.keyword}`;
        activePairs.delete(pairKey);
        initializedCount++;

        if (initializedCount === totalUsers) {
          startCyclingMonitoring();
        }
        return;
      }

      console.log(`✅ Got user ID for @${config.username}: ${userId}`);

      // Store config with user ID for cycling
      userConfigsWithIds.push({
        ...config,
        userId: userId,
      });

      // Set initial baseline
      setInitialBaselineForCycling(userId, config, () => {
        initializedCount++;
        if (initializedCount === totalUsers) {
          startCyclingMonitoring();
        }
      });
    });
  });
}

// Set initial baseline for cycling approach
function setInitialBaselineForCycling(userId, config, callback) {
  const options = {
    method: "GET",
    hostname: RAPID_HOST_NAME,
    path: `/user-tweets?user=${userId}&count=1`,
    headers: {
      "x-rapidapi-key": RAPID_API_KEY,
      "x-rapidapi-host": RAPID_HOST_NAME,
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try {
        const json = JSON.parse(data);

        if (json.message) {
          console.log(`❌ API Error for @${config.username}: ${json.message}`);
          callback();
          return;
        }

        const entries = json.result?.timeline?.instructions?.[2]?.entries || [];
        const tweets = entries
          .map(
            (entry) => entry.content?.itemContent?.tweet_results?.result?.legacy
          )
          .filter(Boolean);

        if (tweets.length > 0) {
          const latestTweetId = tweets[0].id_str || tweets[0].id;
          lastProcessedTweetIds[config.username] = latestTweetId;
          console.log(
            `📊 Baseline set for @${config.username}: Latest tweet ID = ${latestTweetId}`
          );
        }
        callback();
      } catch (err) {
        console.error(`Error setting baseline for @${config.username}:`, err);
        callback();
      }
    });
  });

  req.on("error", (err) => {
    console.error("Request error:", err);
    callback();
  });
  req.end();
}

// Start cycling monitoring
function startCyclingMonitoring() {
  console.log("🚀 Starting cycling monitoring...");
  console.log(
    `📊 Cycling through ${userConfigsWithIds.length} users with 0.5s spacing`
  );

  // Start the cycling interval
  monitoringInterval = setInterval(() => {
    if (userConfigsWithIds.length === 0) {
      console.log("❌ No users to monitor");
      return;
    }

    const currentConfig = userConfigsWithIds[currentUserIndex];
    if (currentConfig) {
      checkForNewTweets(currentConfig.userId, currentConfig);
    }

    // Move to next user
    currentUserIndex = (currentUserIndex + 1) % userConfigsWithIds.length;
  }, 500); // 0.5 seconds between each user
}

// Set initial baseline
function setInitialBaseline(userId, config) {
  const options = {
    method: "GET",
    hostname: RAPID_HOST_NAME,
    path: `/user-tweets?user=${userId}&count=1`,
    headers: {
      "x-rapidapi-key": RAPID_API_KEY,
      "x-rapidapi-host": RAPID_HOST_NAME,
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try {
        const json = JSON.parse(data);

        if (json.message) {
          console.log(`❌ API Error for @${config.username}: ${json.message}`);
          return;
        }

        const entries = json.result?.timeline?.instructions?.[2]?.entries || [];
        const tweets = entries
          .map(
            (entry) => entry.content?.itemContent?.tweet_results?.result?.legacy
          )
          .filter(Boolean);

        if (tweets.length > 0) {
          const latestTweetId = tweets[0].id_str || tweets[0].id;
          lastProcessedTweetIds[config.username] = latestTweetId;
          console.log(
            `📊 Baseline set for @${config.username}: Latest tweet ID = ${latestTweetId}`
          );
          console.log(`⏳ Waiting for new tweets from @${config.username}...`);

          // User is now ready for cycling monitoring
          console.log(`⏳ @${config.username} ready for cycling monitoring...`);
        }
      } catch (err) {
        console.error(`Error setting baseline for @${config.username}:`, err);
      }
    });
  });

  req.on("error", (err) => console.error("Request error:", err));
  req.end();
}

// Stop monitoring for a specific user-keyword pair
function stopMonitoringPair(config) {
  const pairKey = `${config.username}-${config.keyword}`;
  activePairs.delete(pairKey);

  console.log(
    `⏹️  Stopped monitoring @${config.username} for keyword "${config.keyword}"`
  );

  // Remove from cycling array
  userConfigsWithIds = userConfigsWithIds.filter(
    (userConfig) =>
      !(
        userConfig.username === config.username &&
        userConfig.keyword === config.keyword
      )
  );

  // Check if all pairs are stopped
  if (activePairs.size === 0) {
    console.log(
      `\n✅ All monitoring pairs completed. Stopping all monitoring.`
    );
    stopRealTimeMonitoring();
    process.exit(0);
  } else {
    console.log(`📊 ${activePairs.size} pair(s) still monitoring...`);
  }
}

// Check for new tweets
async function checkForNewTweets(userId, config) {
  const options = {
    method: "GET",
    hostname: RAPID_HOST_NAME,
    path: `/user-tweets?user=${userId}&count=1`,
    headers: {
      "x-rapidapi-key": RAPID_API_KEY,
      "x-rapidapi-host": RAPID_HOST_NAME,
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", async () => {
      try {
        console.log(`🔍 Checking for new tweets from @${config.username}...`);

        const json = JSON.parse(data);

        // Check for API errors first
        if (json.message) {
          console.log(`❌ API Error: ${json.message}`);
          return;
        }

        const entries = json.result?.timeline?.instructions?.[2]?.entries || [];

        // Map to get tweet objects with text
        const tweets = entries
          .map(
            (entry) => entry.content?.itemContent?.tweet_results?.result?.legacy
          )
          .filter(Boolean);

        if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
          return;
        }

        const currentTweet = tweets[0];
        const currentTweetId = currentTweet.id_str || currentTweet.id;
        const lastTweetId = lastProcessedTweetIds[config.username];

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
            lastProcessedTweetIds[config.username] = currentTweetId;

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
              const result: any = {
                username: config.username,
                keyword: config.keyword,
                tokenCA: config.tokenCA || null,
                tweetText: text,
                tweetId: currentTweetId,
                timestamp: new Date().toISOString(),
                detectedAt: new Date().toISOString(),
              };

              // Save to results file
              saveResultToFile(result);

              // Log the result
              console.log(`\n🚨 TARGET DETECTED!`);
              console.log(`  Username: @${result.username}`);
              console.log(`  Keyword: "${result.keyword}"`);
              if (result.tokenCA) {
                console.log(`  Token CA: ${result.tokenCA}`);
              }
              console.log(
                `  Tweet: "${result.tweetText.substring(0, 100)}..."`
              );
              console.log(`  Tweet ID: ${result.tweetId}`);
              console.log(`  Detected at: ${result.detectedAt}`);

              // Execute token purchase if CA is available and trading is enabled
              if (result.tokenCA && connection && buyer) {
                console.log(`\n💰 EXECUTING TOKEN PURCHASE!`);
                console.log(`  Token CA: ${result.tokenCA}`);

                // Get buy amount from environment or use default
                let buyAmount = parseFloat(process.env.BUY_AMOUNT || "0.0001");

                // Validate buy amount
                if (isNaN(buyAmount) || buyAmount <= 0) {
                  console.error(
                    "❌ Invalid BUY_AMOUNT in environment variables. Using default: 0.0001 SOL"
                  );
                  buyAmount = 0.0001;
                }

                const purchaseSuccess = await executeTokenPurchase(
                  result.tokenCA,
                  buyAmount
                );

                if (purchaseSuccess) {
                  console.log(`✅ Token purchase completed successfully!`);

                  // Update result with purchase info
                  result.purchaseExecuted = true;
                  result.purchaseAmount = buyAmount;
                  result.purchaseTimestamp = new Date().toISOString();

                  // Save updated result
                  saveResultToFile(result);
                } else {
                  console.log(`❌ Token purchase failed!`);
                  result.purchaseExecuted = false;
                  result.purchaseError = "Purchase execution failed";
                  saveResultToFile(result);
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
              stopMonitoringPair(config);
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
      } catch (err) {
        console.error("Error checking for new tweets:", err);
      }
    });
  });

  req.on("error", (err) => console.error("Request error:", err));
  req.end();
}

// Stop monitoring
function stopRealTimeMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
  }

  // Clear all active pairs and user configs
  activePairs.clear();
  userConfigsWithIds = [];
  currentUserIndex = 0;

  if (timeoutTimer) {
    clearTimeout(timeoutTimer);
    timeoutTimer = null;
  }
  isMonitoring = false;
  console.log("⏹️  All monitoring stopped");
}

// Save result to file
function saveResultToFile(result) {
  try {
    let results = [];
    const resultsFile = "real_time_results.json";

    // Load existing results
    if (fs.existsSync(resultsFile)) {
      const existingData = fs.readFileSync(resultsFile, "utf8");
      results = JSON.parse(existingData);
    }

    // Add new result
    results.push(result);

    // Save updated results
    fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  } catch (error) {
    console.error("Error saving result:", error);
  }
}

// 🔁 Execute multi-user monitoring
startMultiUserMonitoring();

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  stopRealTimeMonitoring();
  process.exit(0);
});
