import * as fs from "fs";
import dotenv from "dotenv";

dotenv.config();

const https = require("https");

const RAPID_API_KEY = process.env.RAPID_API_KEYS;
const username = process.env.USER_ID;

// Step 1: Get user ID from username
function getUserId(username, callback) {
  const options = {
    method: "GET",
    hostname: "twitter241.p.rapidapi.com",
    path: `/user?username=${username}`,
    headers: {
      "x-rapidapi-key": RAPID_API_KEY,
      "x-rapidapi-host": "twitter241.p.rapidapi.com",
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try {
        const json = JSON.parse(data);
        fs.writeFileSync(
          "full_user_response.txt",
          JSON.stringify(json, null, 2)
        );
        console.log("🔍 FULL USER RESPONSE saved to full_user_response.txt");

        const userId = json.result?.data?.user?.result?.rest_id || null;

        if (userId) {
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
    hostname: "twitter241.p.rapidapi.com",
    path: `/user-tweets?user=${userId}&count=10`,
    headers: {
      "x-rapidapi-key": RAPID_API_KEY,
      "x-rapidapi-host": "twitter241.p.rapidapi.com",
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => (data += chunk));
    res.on("end", () => {
      try {
        const json = JSON.parse(data);
        fs.writeFileSync("tweets.txt", JSON.stringify(json, null, 2));
        console.log("✅ TWEETS saved to tweets.txt");

        // Debug: Check the structure of the response
        console.log("🔍 API Response Structure:");
        console.log("json.result:", json.result ? "exists" : "null");
        console.log(
          "json.result.timeline:",
          json.result?.timeline ? "exists" : "null"
        );
        console.log(
          "json.result.timeline.instructions:",
          json.result?.timeline?.instructions
            ? `array with ${json.result?.timeline?.instructions?.length} items`
            : "null"
        );

        if (json.result?.timeline?.instructions) {
          json.result.timeline.instructions.forEach((instruction, index) => {
            console.log(
              `Instruction ${index}:`,
              instruction.type || "unknown type"
            );
            if (instruction.entries) {
              console.log(`  - Has ${instruction.entries.length} entries`);
            }
          });
        }

        const entries = json.result?.timeline?.instructions?.[2]?.entries || [];
        console.log("🚀 ~ getUserTweets ~ entries:", entries);

        // Map to get tweet objects with text
        const tweets = entries
          .map(
            (entry) => entry.content?.itemContent?.tweet_results?.result?.legacy
          )
          .filter(Boolean);
        console.log("🚀 ~ getUserTweets ~ tweets:", tweets);

        // Filter tweets to find ones with both keyword AND token CA
        const keyword = "Development".trim(); // or get from user input

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

        // // Also check for "CA:" pattern specifically
        // const caWithPrefixRegex = /CA:\s*([1-9A-HJ-NP-Za-km-z]{32,44})/i;
        // const caWithPrefixOnly = tweets.filter((tweet) =>
        //   caWithPrefixRegex.test(tweet.full_text || tweet.text || "")
        // );

        // Check for any token mint address (32-44 characters)
        const tokenMintRegex = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
        const tokenMintOnly = tweets.filter((tweet) =>
          tokenMintRegex.test(tweet.full_text || tweet.text || "")
        );

        console.log(`\n🔍 DEBUG INFO:`);
        console.log(`Total tweets fetched: ${tweets.length}`);
        console.log(`Tweets with keyword "${keyword}": ${keywordOnly.length}`);
        console.log(`Tweets with token CA: ${caOnly.length}`);
        // console.log(`Tweets with "CA:" pattern: ${caWithPrefixOnly.length}`);
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
          const filteredTweetTexts = filtered.map((tweet, i) => {
            const text = tweet.full_text || tweet.text || "";
            return `Filtered Tweet ${i + 1}: "${text}"`;
          });

          fs.writeFileSync(
            "filtered_tweets.txt",
            [
              `Found ${filtered.length} tweets with keyword "${keyword}" AND token CA:`,
              "",
              ...filteredTweetTexts,
            ].join("\n")
          );
          console.log(
            `\n✅ Saved ${filtered.length} matching tweets to filtered_tweets.txt`
          );
        } else {
          fs.writeFileSync(
            "filtered_tweets.txt",
            `No tweets found with keyword "${keyword}" AND token CA.`
          );
          console.log(`\n✅ Saved result to filtered_tweets.txt`);
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
