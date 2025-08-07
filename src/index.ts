import * as fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const https = require("https");

const RAPID_API_KEY = process.env.RAPID_API_KEYS;
const username = process.env.USER_NAME; // Fixed: was USER_ID
const RAPID_HOST_NAME = process.env.RAPID_HOST_NAME;
const keyword = process.env.KEYWORD; // Fixed: use environment variable

// Cache file for storing username to userID mappings
const CACHE_FILE = "user_cache.json";

// Global variables for real-time monitoring
let lastProcessedTweetId = null;
let isMonitoring = false;
let monitoringInterval = null;

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

// Real-time monitoring function
function startRealTimeMonitoring(userId) {
  if (isMonitoring) {
    console.log("🔄 Already monitoring, stopping previous session...");
    stopRealTimeMonitoring();
  }

  console.log("🚀 Starting real-time monitoring...");
  console.log(`🎯 Monitoring @${username} for tweets with keyword "${keyword}"`);
  console.log("⏰ Checking for new tweets every 2 seconds...");
  
  isMonitoring = true;
  
  // Set initial baseline - get the latest tweet ID as starting point
  setInitialBaseline(userId);
  
  // Set up continuous monitoring
  monitoringInterval = setInterval(() => {
    checkForNewTweets(userId);
  }, 2000); // Check every 2 seconds
}

// Set initial baseline
function setInitialBaseline(userId) {
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
          console.log(`❌ API Error: ${json.message}`);
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
          lastProcessedTweetId = latestTweetId;
          console.log(`📊 Baseline set: Latest tweet ID = ${latestTweetId}`);
          console.log(`⏳ Waiting for new tweets...`);
        }
      } catch (err) {
        console.error("Error setting baseline:", err);
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
  isMonitoring = false;
  console.log("⏹️  Monitoring stopped");
}

// Check for new tweets
function checkForNewTweets(userId) {
  const options = {
    method: "GET",
    hostname: RAPID_HOST_NAME,
    path: `/user-tweets?user=${userId}&count=1`, // Get latest 1 tweet
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
        console.log(`🔍 Checking for new tweets...`);

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

        // Check if this is a truly new tweet (not the baseline tweet)
        if (lastProcessedTweetId && currentTweetId !== lastProcessedTweetId) {
          console.log(`\n🆕 NEW TWEET DETECTED! Tweet ID: ${currentTweetId}`);
          
          // Update baseline to current tweet
          lastProcessedTweetId = currentTweetId;
          
          // Check if this new tweet matches our criteria
          const text = currentTweet.full_text || currentTweet.text || "";
          const hasKeyword = text.toLowerCase().includes(keyword.toLowerCase());
          const hasTokenCA = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/.test(text);
          
          if (hasKeyword && hasTokenCA) {
            console.log(`🎯 MATCH FOUND! Tweet contains keyword "${keyword}" AND token CA!`);
            
            const tokenCA = extractTokenCA(text);
            
            const result = {
              username: username,
              keyword: keyword,
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
            
            // Stop monitoring after finding a match
            console.log(`\n✅ Target found! Stopping monitoring...`);
            stopRealTimeMonitoring();
            process.exit(0); // Exit the program
          } else {
            console.log(`❌ Tweet doesn't match criteria (keyword: ${hasKeyword}, token CA: ${hasTokenCA})`);
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

// 🔁 Execute monitoring
getUserId(username, (err, userId) => {
  if (err) {
    console.error("❌ Failed to get user ID:", err);
    return;
  }
  console.log(`✅ Got user ID for @${username}: ${userId}`);
  startRealTimeMonitoring(userId);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  stopRealTimeMonitoring();
  process.exit(0);
});

function filterTweets(tweets, keyword) {
  // Regex for any token mint address (32-44 characters) without requiring "CA:" prefix
  const tokenMintRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
  // You can adjust the regex for Ethereum or other blockchains

  return tweets.filter((tweet) => {
    const text = tweet.full_text || tweet.text || "";
    const hasKeyword = text.toLowerCase().includes(keyword.toLowerCase());
    const hasTokenMint = tokenMintRegex.test(text);
    return hasKeyword && hasTokenMint;
  });
}

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