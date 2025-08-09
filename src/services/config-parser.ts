import { MonitoringConfig } from "../types";
import { DEFAULT_BUY_AMOUNT } from "../config/environment";

export function parseMonitoringConfig(): MonitoringConfig[] {
  const config: MonitoringConfig[] = [];

  let index = 1;
  console.log("🔍 Parsing monitoring configuration...");

  while (true) {
    const userKey = `MONITOR_USER${index}`;
    const keywordKey = `MONITOR_KEYWORD${index}`;
    const caKey = `MONITOR_CA${index}`;
    const buyAmountKey = `MONITOR_BUY_AMOUNT${index}`;

    const username = process.env[userKey];
    const keyword = process.env[keywordKey];
    const tokenCA = process.env[caKey];
    const buyAmount = process.env[buyAmountKey];

    if (!username) {
      break;
    }

    // Allow empty keywords (empty string is valid)
    if (keyword === undefined) {
      console.log(`  ⏹️  Stopping at index ${index} - keyword undefined`);
      break;
    }

    // Parse buy amount with fallback to default
    let parsedBuyAmount = DEFAULT_BUY_AMOUNT;
    if (buyAmount) {
      const parsed = parseFloat(buyAmount);
      if (!isNaN(parsed) && parsed > 0) {
        parsedBuyAmount = parsed;
      } else {
        console.log(
          `  ⚠️  Invalid buy amount for config ${index}: "${buyAmount}", using default: ${parsedBuyAmount} SOL`
        );
      }
    } else {
      console.log(
        `  ℹ️  No buy amount specified for config ${index}, using default: ${parsedBuyAmount} SOL`
      );
    }

    console.log(
      `  ✅ Found config ${index}: @${username} - keyword: "${keyword}" - CA: ${
        tokenCA || "none"
      } - Buy Amount: ${parsedBuyAmount} SOL`
    );

    config.push({
      username: username.trim(),
      keyword: keyword.trim(),
      tokenCA: tokenCA ? tokenCA.trim() : null,
      buyAmount: parsedBuyAmount,
    });

    index++;
  }

  console.log(`📊 Total configurations found: ${config.length}`);
  return config;
}
