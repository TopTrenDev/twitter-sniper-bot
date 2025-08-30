import { MonitoringConfig, GroupedMonitoringConfig } from "../types";
import { DEFAULT_BUY_AMOUNT } from "../config/environment";
import { ExcelImporter } from "./excel-importer";

export function parseMonitoringConfig(): GroupedMonitoringConfig[] {
  console.log("🔍 Parsing monitoring configuration...");

  // First, try to import from Excel
  const excelConfigs = ExcelImporter.importFromExcel();
  
  if (excelConfigs.length > 0) {
    console.log(`📊 Using Excel configuration with ${excelConfigs.length} user groups`);
    return excelConfigs;
  }

  // Fallback to environment variables
  console.log("📄 Excel file not found, falling back to environment variables");
  const envConfigs = parseEnvironmentConfig();
  
  if (envConfigs.length > 0) {
    return envConfigs;
  }

  // No configurations found - provide guidance
  console.log("\n❌ No monitoring configuration found!");
  console.log("🔧 Choose one of these setup methods:");
  console.log("");
  console.log("📊 Method 1: Excel Configuration (Recommended)");
  console.log("   1. Run: npm run generate-template");
  console.log("   2. Edit monitoring-config-template.xlsx");
  console.log("   3. Save as monitoring-config.xlsx");
  console.log("   4. Run: npm start");
  console.log("");
  console.log("⚙️ Method 2: Environment Variables");
  console.log("   Add to your .env file:");
  console.log("   MONITOR_USER1=elonmusk");
  console.log("   MONITOR_KEYWORD1=coin");
  console.log("   MONITOR_CA1=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  console.log("   MONITOR_BUY_AMOUNT1=0.0002");
  console.log("");
  
  // Auto-generate template if it doesn't exist
  if (!ExcelImporter.hasExcelFile() && !ExcelImporter.hasTemplate()) {
    console.log("🚀 Auto-generating Excel template for you...");
    try {
      ExcelImporter.createTemplate();
      console.log("✅ Template created! Edit monitoring-config-template.xlsx and save as monitoring-config.xlsx");
    } catch (error) {
      console.error("❌ Failed to create template:", error);
    }
  }
  
  return [];
}

/**
 * Parse environment variables and convert to grouped configuration format
 */
function parseEnvironmentConfig(): GroupedMonitoringConfig[] {
  const userGroups = new Map<string, Map<string, Map<string, { buyAmount: number; count: number }>>>();
  let index = 1;

  console.log("🔍 Parsing environment variable configuration...");

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

    // Group by username and keyword
    const cleanUsername = username.trim();
    const cleanKeyword = keyword.trim();
    const cleanTokenCA = tokenCA ? tokenCA.trim() : null;
    const tokenKey = cleanTokenCA || 'null';

    // Initialize user group if not exists
    if (!userGroups.has(cleanUsername)) {
      userGroups.set(cleanUsername, new Map());
    }
    const userGroup = userGroups.get(cleanUsername)!;

    // Initialize keyword group if not exists
    if (!userGroup.has(cleanKeyword)) {
      userGroup.set(cleanKeyword, new Map());
    }
    const keywordGroup = userGroup.get(cleanKeyword)!;

    // Add or update token configuration
    if (keywordGroup.has(tokenKey)) {
      const existing = keywordGroup.get(tokenKey)!;
      existing.count++;
      // Use the highest buy amount if different
      if (parsedBuyAmount > existing.buyAmount) {
        existing.buyAmount = parsedBuyAmount;
      }
    } else {
      keywordGroup.set(tokenKey, { buyAmount: parsedBuyAmount, count: 1 });
    }

    console.log(
      `  ✅ Found config ${index}: @${cleanUsername} - keyword: "${cleanKeyword}" - CA: ${
        cleanTokenCA || "none"
      } - Buy Amount: ${parsedBuyAmount} SOL`
    );

    index++;
  }

  // Convert grouped data to final structure
  const groupedConfigs: GroupedMonitoringConfig[] = [];
  
  for (const [username, keywordGroups] of userGroups) {
    const keywords: any[] = [];
    
    for (const [keyword, tokenGroups] of keywordGroups) {
      const tokens: any[] = [];
      
      for (const [tokenKey, config] of tokenGroups) {
        const tokenCA = tokenKey === 'null' ? null : tokenKey;
        tokens.push({
          tokenCA,
          buyAmount: config.buyAmount,
          count: config.count
        });
      }
      
      keywords.push({ keyword, tokens });
    }
    
    groupedConfigs.push({ username, keywords });
  }

  console.log(`📊 Total user groups found: ${groupedConfigs.length}`);
  return groupedConfigs;
}

/**
 * Legacy function for backward compatibility - returns flat array
 */
export function parseMonitoringConfigLegacy(): MonitoringConfig[] {
  const groupedConfigs = parseMonitoringConfig();
  const legacyConfigs: MonitoringConfig[] = [];
  
  for (const userConfig of groupedConfigs) {
    for (const keywordConfig of userConfig.keywords) {
      for (const tokenConfig of keywordConfig.tokens) {
        // Create one entry per token count
        for (let i = 0; i < tokenConfig.count; i++) {
          legacyConfigs.push({
            username: userConfig.username,
            keyword: keywordConfig.keyword,
            tokenCA: tokenConfig.tokenCA,
            buyAmount: tokenConfig.buyAmount
          });
        }
      }
    }
  }
  
  return legacyConfigs;
}
