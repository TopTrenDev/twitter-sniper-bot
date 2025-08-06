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

// Step 2: Get tweets from user ID
function getUserTweets(userId) {
  const options = {
    method: "GET",
    hostname: RAPID_HOST_NAME,
    path: `/user-tweets?user=${userId}&count=10`,
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

        if (!tweets || !Array.isArray(tweets)) {
          console.log("❌ No tweets found in response");
          return;
        }

        // Debug: Check each filter separately
        const keywordOnly = tweets.filter((tweet) =>
          (tweet.full_text || tweet.text || "")
            .toLowerCase()
            .includes(keyword.toLowerCase())
        );

        const caRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
        const caOnly = tweets.filter((tweet) =>
          caRegex.test(tweet.full_text || tweet.text || "")
        );

        // Check for any token mint address (32-44 characters)
        const tokenMintRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
        const tokenMintOnly = tweets.filter((tweet) =>
          tokenMintRegex.test(tweet.full_text || tweet.text || "")
        );

        console.log(`\n🔍 DEBUG INFO:`);
        console.log(`Total tweets fetched: ${tweets.length}`);
        console.log(`Tweets with keyword "${keyword}": ${keywordOnly.length}`);
        console.log(`Tweets with token CA: ${caOnly.length}`);
        console.log(`Tweets with token mint address: ${tokenMintOnly.length}`);

        // Show some examples
        if (keywordOnly.length > 0) {
          console.log(`\n📝 Example tweets with keyword:`);
          keywordOnly.slice(0, 2).forEach((tweet, i) => {
            const text = tweet.full_text || tweet.text || "";
            console.log(`  ${i + 1}: "${text.substring(0, 100)}..."`);
          });
        }

        if (tokenMintOnly.length > 0) {
          console.log(`\n💰 Example tweets with token mint address:`);
          tokenMintOnly.slice(0, 2).forEach((tweet, i) => {
            const text = tweet.full_text || tweet.text || "";
            console.log(`  ${i + 1}: "${text.substring(0, 100)}..."`);
          });
        }

        const filtered = filterTweets(tweets, keyword);

        // Console log only the matching tweets
        if (filtered.length > 0) {
          console.log(
            `\n🎯 Found ${filtered.length} tweets with keyword "${keyword}" AND token CA:`
          );
          filtered.forEach((tweet, i) => {
            const text = tweet.full_text || tweet.text || "";
            console.log(`\nTweet ${i + 1}: "${text}"`);
          });
        } else {
          console.log(
            `\n❌ No tweets found with keyword "${keyword}" AND token CA.`
          );
        }

        // Save only the matching tweets to file
        if (filtered.length > 0) {
          // Create structured results with username, keyword, and token CA
          const structuredResults = filtered.map((tweet, i) => {
            const text = tweet.full_text || tweet.text || "";
            const tokenCA = extractTokenCA(text);
            
            return {
              username: username,
              keyword: keyword,
              tokenCA: tokenCA,
              tweetText: text,
              tweetId: tweet.id_str || tweet.id,
              timestamp: new Date().toISOString()
            };
          });

          // Save detailed results to JSON file
          fs.writeFileSync(
            "filtered_results.json",
            JSON.stringify(structuredResults, null, 2)
          );
          
          console.log(`✅ Found ${filtered.length} matching tweets`);
          console.log(`📄 Results saved to filtered_results.json`);
          
          // Log the structured results
          structuredResults.forEach((result, i) => {
            console.log(`\n🎯 Result ${i + 1}:`);
            console.log(`  Username: @${result.username}`);
            console.log(`  Keyword: "${result.keyword}"`);
            console.log(`  Token CA: ${result.tokenCA}`);
            console.log(`  Tweet: "${result.tweetText.substring(0, 100)}..."`);
          });
        } else {
          const noResults = {
            username: username,
            keyword: keyword,
            timestamp: new Date().toISOString(),
            message: `No tweets found with keyword "${keyword}" AND token CA.`
          };
          
          fs.writeFileSync(
            "filtered_results.json",
            JSON.stringify([noResults], null, 2)
          );
          
          console.log(`❌ No tweets found with keyword "${keyword}" AND token CA.`);
        }
      } catch (err) {
        console.error("Error parsing tweets JSON:", err);
      }
    });
  });

  req.on("error", (err) => console.error("Request error:", err));
  req.end();
}

// 🔁 Execute both
getUserId(username, (err, userId) => {
  if (err) {
    console.error("❌ Failed to get user ID:", err);
    return;
  }
  console.log(`✅ Got user ID for @${username}: ${userId}`);
  getUserTweets(userId);
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