import {
  validateSolanaConfig,
  validateAstralaneConfig,
} from "./config/environment";
import { parseMonitoringConfig } from "./services/config-parser";
import { MonitoringService } from "./services/monitoring-service";
import { JsonGenerator } from "./services/json-generator";

// Validate configurations
validateSolanaConfig();
validateAstralaneConfig();

// Parse monitoring configuration
const monitoringConfig = parseMonitoringConfig();

if (monitoringConfig.length === 0) {
  console.log("❌ No monitoring configuration found. Exiting...");
  process.exit(1);
}

// Generate JSON configuration files
console.log("📄 Generating JSON configuration files...");
JsonGenerator.generateJson(monitoringConfig);
JsonGenerator.generateCompactJson(monitoringConfig);

// Create and start monitoring service
const monitoringService = new MonitoringService(monitoringConfig);

// Start monitoring
monitoringService.start();

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n🛑 Shutting down gracefully...");
  monitoringService.stop();
  process.exit(0);
});
