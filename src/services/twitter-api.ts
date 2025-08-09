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
    callback: (error: string | null, tweets: any[] | null) => void
  ): void {
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
      let data = "";
      res.on("data", (chunk: string) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);

          if (json.message) {
            callback(json.message, null);
            return;
          }

          const entries =
            json.result?.timeline?.instructions?.[2]?.entries || [];
          const tweets = entries
            .map(
              (entry: any) =>
                entry.content?.itemContent?.tweet_results?.result?.legacy
            )
            .filter(Boolean);

          callback(null, tweets);
        } catch (err) {
          callback("Failed to parse JSON: " + err, null);
        }
      });
    });

    req.on("error", (err: any) => callback("Request error: " + err, null));
    req.end();
  }
}
