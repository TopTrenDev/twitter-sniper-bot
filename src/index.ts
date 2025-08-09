import {
  validateSolanaConfig,
  validateAstralaneConfig,
} from "./config/environment";
import { parseMonitoringConfig } from "./services/config-parser";
import { MonitoringService } from "./services/monitoring-service";

// Validate configurations
validateSolanaConfig();
validateAstralaneConfig();

// Parse monitoring configuration
const monitoringConfig = parseMonitoringConfig();

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
