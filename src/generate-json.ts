import { parseMonitoringConfig } from "./services/config-parser";
import { JsonGenerator } from "./services/json-generator";

console.log("🚀 Generating JSON configuration files from Excel...");

// Parse monitoring configuration
const monitoringConfig = parseMonitoringConfig();

if (monitoringConfig.length === 0) {
  console.log("❌ No monitoring configuration found.");
  console.log("💡 Please ensure you have a valid monitoring-config.xlsx file.");
  process.exit(1);
}

console.log(`📊 Found ${monitoringConfig.length} user configurations`);

// Generate JSON files
JsonGenerator.generateJson(monitoringConfig);
JsonGenerator.generateCompactJson(monitoringConfig);

console.log("✅ JSON generation completed!");
console.log(`📁 Files saved in: ${JsonGenerator.getJsonFilePath()}`); 