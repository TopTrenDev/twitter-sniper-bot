import * as fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const https = require("https");

const RAPID_API_KEY = process.env.RAPID_API_KEYS;
const RAPID_HOST_NAME = process.env.RAPID_HOST_NAME;

// Parse monitoring configuration from environment variables
function parseMonitoringConfig() {
  const config = [];
  
  // Read configuration from environment variables
  // Format: MONITOR_USER1=username1, MONITOR_KEYWORD1=keyword1
  //         MONITOR_USER2=username2, MONITOR_KEYWORD2=keyword2, etc.
  
  let index = 1;
  while (true) {
    const userKey = `MONITOR_USER${index}`;
    const keywordKey = `MONITOR_KEYWORD${index}`;
    
    const username = process.env[userKey];
    const keyword = process.env[keywordKey];
    
    if (!username || !keyword) {
      break; // Stop when no more configuration found
    }
    
    config.push({
      username: username.trim(),
      keyword: keyword.trim()
    });
    
    index++;
  }
  
  return config;
}

// Get monitoring configuration
const MONITORING_CONFIG = parseMonitoringConfig();

// Fallback to single user if no multi-user config found
if (MONITORING_CONFIG.length === 0) {
  const username = process.env.USER_NAME;
  const keyword = process.env.KEYWORD;
  
  if (username && keyword) {
    MONITORING_CONFIG.push({
      username: username.trim(),
      keyword: keyword.trim()
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
let activeMonitoringIntervals = {}; // Track individual monitoring intervals for each user-keyword pair
let activePairs = new Set(); // Track which user-keyword pairs are still active

// Function to load cached user IDs
function loadUserCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const cacheData = fs.readFileSync(CACHE_FILE, 'utf8');
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
      timestamp: new Date().toISOString()
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
    console.log(`✅ Found cached user ID for @${username}: ${cachedUser.userId}`);
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
    console.log("💡 Please set up your .env file with monitoring configuration:");
    console.log("   MONITOR_USER1=username1");
    console.log("   MONITOR_KEYWORD1=keyword1");
    console.log("   MONITOR_USER2=username2");
    console.log("   MONITOR_KEYWORD2=keyword2");
    return;
  }

  console.log("🚀 Starting multi-user real-time monitoring...");
  console.log(`📊 Monitoring ${MONITORING_CONFIG.length} user-keyword combinations:`);
  
  MONITORING_CONFIG.forEach((config, index) => {
    console.log(`  ${index + 1}. @${config.username} - keyword: "${config.keyword}"`);
    // Add to active pairs
    const pairKey = `${config.username}-${config.keyword}`;
    activePairs.add(pairKey);
  });
  
  console.log("⏰ Checking for new tweets every 2 seconds...");
  
  isMonitoring = true;
  startTime = new Date(); // Set start time
  if (LOOP_TIME_MS > 0) {
    timeoutTimer = setTimeout(() => {
      console.log(`\n⚠️ Monitoring timeout reached (${LOOP_TIME_MINUTES} minutes). Stopping all monitoring.`);
      stopRealTimeMonitoring();
      process.exit(0); // Exit the program
    }, LOOP_TIME_MS);
  }
  
  // Start monitoring ALL users simultaneously
  MONITORING_CONFIG.forEach((config) => {
    startMonitoringUser(config);
  });
}

// Start monitoring a specific user
function startMonitoringUser(config) {
  console.log(`\n🎯 Starting monitoring for @${config.username} with keyword "${config.keyword}"`);
  
  // Get user ID and start monitoring
  getUserId(config.username, (err, userId) => {
    if (err) {
      console.error(`❌ Failed to get user ID for @${config.username}:`, err);
      // Remove from active pairs if user ID fetch failed
      const pairKey = `${config.username}-${config.keyword}`;
      activePairs.delete(pairKey);
      return;
    }
    
    console.log(`✅ Got user ID for @${config.username}: ${userId}`);
    setInitialBaseline(userId, config);
  });
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
          console.log(`📊 Baseline set for @${config.username}: Latest tweet ID = ${latestTweetId}`);
          console.log(`⏳ Waiting for new tweets from @${config.username}...`);
          
          // Start continuous monitoring for this user
          startContinuousMonitoring(userId, config);
        }
      } catch (err) {
        console.error(`Error setting baseline for @${config.username}:`, err);
      }
    });
  });

  req.on("error", (err) => console.error("Request error:", err));
  req.end();
}

// Start continuous monitoring for a user
function startContinuousMonitoring(userId, config) {
  const pairKey = `${config.username}-${config.keyword}`;
  
  // Set up continuous monitoring for this specific user
  const userInterval = setInterval(() => {
    checkForNewTweets(userId, config, userInterval);
  }, 2000); // Check every 2 seconds
  
  // Store the interval reference
  activeMonitoringIntervals[pairKey] = userInterval;
}

// Stop monitoring for a specific user-keyword pair
function stopMonitoringPair(config) {
  const pairKey = `${config.username}-${config.keyword}`;
  
  if (activeMonitoringIntervals[pairKey]) {
    clearInterval(activeMonitoringIntervals[pairKey]);
    delete activeMonitoringIntervals[pairKey];
    activePairs.delete(pairKey);
    
    console.log(`⏹️ Stopped monitoring @${config.username} for keyword "${config.keyword}"`);
    
    // Check if all pairs are stopped
    if (activePairs.size === 0) {
      console.log(`\n✅ All monitoring pairs completed. Stopping all monitoring.`);
      stopRealTimeMonitoring();
      process.exit(0);
    } else {
      console.log(`📊 ${activePairs.size} pair(s) still monitoring...`);
    }
  }
}

// Check for new tweets
function checkForNewTweets(userId, config, userInterval) {
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

        // Check if this is a truly new tweet (not the baseline tweet)
        if (lastTweetId && currentTweetId !== lastTweetId) {
          console.log(`\n🆕 NEW TWEET DETECTED from @${config.username}! Tweet ID: ${currentTweetId}`);
          
          // Update baseline to current tweet
          lastProcessedTweetIds[config.username] = currentTweetId;
          
          // Check if this new tweet matches our criteria
          const text = currentTweet.full_text || currentTweet.text || "";
          const hasKeyword = text.toLowerCase().includes(config.keyword.toLowerCase());
          const hasTokenCA = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(text);
          
          if (hasKeyword && hasTokenCA) {
            console.log(`🎯 MATCH FOUND! Tweet from @${config.username} contains keyword "${config.keyword}" AND token CA!`);
            
            const tokenCA = extractTokenCA(text);
            
            const result = {
              username: config.username,
              keyword: config.keyword,
              tokenCA: tokenCA,
              tweetText: text,
              tweetId: currentTweetId,
              timestamp: new Date().toISOString(),
              detectedAt: new Date().toISOString()
            };
            
            // Save to results file
            saveResultToFile(result);
            
            // Log the result
            console.log(`\n🚨 TARGET DETECTED!`);
            console.log(`  Username: @${result.username}`);
            console.log(`  Keyword: "${result.keyword}"`);
            console.log(`  Token CA: ${result.tokenCA}`);
            console.log(`  Tweet: "${result.tweetText.substring(0, 100)}..."`);
            console.log(`  Tweet ID: ${result.tweetId}`);
            console.log(`  Detected at: ${result.detectedAt}`);
            
            // Stop monitoring only this specific pair
            console.log(`\n✅ Target found for @${config.username} with keyword "${config.keyword}"! Stopping this pair only.`);
            stopMonitoringPair(config);
          } else {
            console.log(`❌ Tweet from @${config.username} doesn't match criteria (keyword: ${hasKeyword}, token CA: ${hasTokenCA})`);
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
  
  // Stop all active monitoring intervals
  Object.keys(activeMonitoringIntervals).forEach(pairKey => {
    clearInterval(activeMonitoringIntervals[pairKey]);
  });
  activeMonitoringIntervals = {};
  activePairs.clear();
  
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
      const existingData = fs.readFileSync(resultsFile, 'utf8');
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
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  stopRealTimeMonitoring();
  process.exit(0);
});

// Function to extract token CA from tweet text
function extractTokenCA(text) {
  // Try different patterns to find token CA
  const patterns = [
    /\bca[:;]?\s*([1-9A-HJ-NP-Za-km-z]{32,44})\b/i,  // ca: followed by address
    /\bCA[:;]?\s*([1-9A-HJ-NP-Za-km-z]{32,44})\b/i,  // CA: followed by address
    /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/               // Just the address
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1] || match[0]; // Return captured group or full match
    }
  }
  
  return null;
}