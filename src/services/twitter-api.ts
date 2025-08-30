import { RAPID_API_KEY, RAPID_HOST_NAME } from "../config/environment";
import { FileManager } from "./file-manager";

const https = require("https");

export class TwitterAPI {
  static getUserId(
    username: string,
    callback: (error: string | null, userId: string | null) => void
  ): void {
    // First, check if we have it cached
    const cache = FileManager.loadUserCache();
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

    const req = https.request(options, (res: any) => {
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          const userId = json.result?.data?.user?.result?.rest_id || null;

          if (userId) {
            // Save to cache for future use
            FileManager.saveUserToCache(username, userId);
            callback(null, userId);
          } else {
            callback("No user ID found in response", null);
          }
        } catch (err) {
          callback("Failed to parse JSON: " + err, null);
        }
      });
    });

    req.on("error", (err: any) => callback("Request error: " + err, null));
    req.end();
  }

  static getUserTweets(
    userId: string,
    callback: (error: string | null, tweets: any[] | null) => void,
    retryCount: number = 0
  ): void {
    const maxRetries = 2;
    const retryDelay = 1000; // 1 second

    // console.log(`🔍 [TwitterAPI] Fetching tweets for user ID: ${userId} (attempt ${retryCount + 1}/${maxRetries + 1})`);

    const options = {
      method: "GET",
      hostname: RAPID_HOST_NAME,
      path: `/user-tweets?user=${userId}&count=1`,
      headers: {
        "x-rapidapi-key": RAPID_API_KEY,
        "x-rapidapi-host": RAPID_HOST_NAME,
      },
    };

    const req = https.request(options, (res: any) => {
      // console.log(`🔍 [TwitterAPI] Response status: ${res.statusCode}`);

      // Handle rate limiting
      if (res.statusCode === 429) {
        console.log(
          `⚠️ [TwitterAPI] Rate limited (429). Retrying in ${retryDelay}ms...`
        );
        if (retryCount < maxRetries) {
          setTimeout(() => {
            this.getUserTweets(userId, callback, retryCount + 1);
          }, retryDelay);
          return;
        } else {
          callback("Rate limited after max retries", null);
          return;
        }
      }

      // Handle other HTTP errors
      if (res.statusCode !== 200) {
        console.log(`❌ [TwitterAPI] HTTP Error: ${res.statusCode}`);
        callback(`HTTP Error: ${res.statusCode}`, null);
        return;
      }

      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          // console.log(`🔍 [TwitterAPI] Raw response data length: ${data.length}`);

          const json = JSON.parse(data);

          if (json.message) {
            console.log(`❌ [TwitterAPI] API Error message: ${json.message}`);

            // Handle specific error messages
            if (
              json.message.includes("rate limit") ||
              json.message.includes("too many requests")
            ) {
              if (retryCount < maxRetries) {
                console.log(
                  `⚠️ [TwitterAPI] Rate limit error. Retrying in ${retryDelay}ms...`
                );
                setTimeout(() => {
                  this.getUserTweets(userId, callback, retryCount + 1);
                }, retryDelay);
                return;
              }
            }

            callback(json.message, null);
            return;
          }

          // Try different response structures
          let tweets: any[] = [];

          // Method 1: Standard structure
          const entries1 =
            json.result?.timeline?.instructions?.[2]?.entries || [];
          if (entries1.length > 0) {
            tweets = entries1
              .map(
                (entry: any) =>
                  entry.content?.itemContent?.tweet_results?.result?.legacy
              )
              .filter(Boolean);
          }

          // Method 2: Alternative structure (try different instruction index)
          if (tweets.length === 0) {
            for (let i = 0; i < 5; i++) {
              const entries2 =
                json.result?.timeline?.instructions?.[i]?.entries || [];
              if (entries2.length > 0) {
                tweets = entries2
                  .map(
                    (entry: any) =>
                      entry.content?.itemContent?.tweet_results?.result?.legacy
                  )
                  .filter(Boolean);
                if (tweets.length > 0) {
                  // console.log(`🔍 [TwitterAPI] Found tweets using instruction index ${i}`);
                  break;
                }
              }
            }
          }

          // Method 3: Direct tweet results
          if (tweets.length === 0 && json.result?.tweets) {
            tweets = json.result.tweets
              .map((tweet: any) => tweet.legacy || tweet)
              .filter(Boolean);
            // console.log(`🔍 [TwitterAPI] Found tweets using direct tweet results`);
          }

          // console.log(`🔍 [TwitterAPI] Parsed ${tweets.length} tweets using multiple methods`);

          if (tweets.length === 0) {
            console.log(
              `⚠️ [TwitterAPI] No tweets found. Response structure:`,
              {
                hasResult: !!json.result,
                hasTimeline: !!json.result?.timeline,
                hasInstructions: !!json.result?.timeline?.instructions,
                instructionsLength:
                  json.result?.timeline?.instructions?.length || 0,
                hasTweets: !!json.result?.tweets,
                responseKeys: Object.keys(json.result || {}),
              }
            );
          }

          callback(null, tweets);
        } catch (err) {
          console.log(`❌ [TwitterAPI] JSON parse error: ${err}`);
          callback("Failed to parse JSON: " + err, null);
        }
      });
    });

    req.on("error", (err: any) => {
      console.log(`❌ [TwitterAPI] Request error: ${err}`);

      // Retry on network errors
      if (retryCount < maxRetries) {
        console.log(
          `⚠️ [TwitterAPI] Network error. Retrying in ${retryDelay}ms...`
        );
        setTimeout(() => {
          this.getUserTweets(userId, callback, retryCount + 1);
        }, retryDelay);
        return;
      }

      callback("Request error: " + err, null);
    });

    req.end();
  }
}
