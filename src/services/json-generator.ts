import { GroupedMonitoringConfig } from '../types';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export class JsonGenerator {
  private static readonly OUTPUT_DIR = 'output';
  private static readonly FILENAME = 'monitoring-config.json';

  /**
   * Generate a JSON file from grouped monitoring configuration
   */
  static generateJson(config: GroupedMonitoringConfig[]): void {
    try {
      // Create output directory if it doesn't exist
      if (!existsSync(this.OUTPUT_DIR)) {
        mkdirSync(this.OUTPUT_DIR, { recursive: true });
      }

      const outputPath = join(this.OUTPUT_DIR, this.FILENAME);
      
      // Create the JSON structure
      const jsonData = {
        generatedAt: new Date().toISOString(),
        totalUsers: config.length,
        configuration: config,
        summary: this.generateSummary(config)
      };

      // Write to file
      writeFileSync(outputPath, JSON.stringify(jsonData, null, 2), 'utf8');
      
      console.log(`📄 JSON configuration file generated: ${outputPath}`);
      console.log(`📊 Total users: ${config.length}`);
      
      // Log summary
      this.logSummary(config);
      
    } catch (error) {
      console.error('❌ Error generating JSON file:', error);
    }
  }

  /**
   * Generate a summary of the configuration
   */
  private static generateSummary(config: GroupedMonitoringConfig[]): any {
    const summary = {
      totalUsers: config.length,
      totalKeywords: 0,
      totalTokenConfigs: 0,
      totalPotentialBuyAmount: 0,
      users: [] as any[]
    };

    config.forEach(userConfig => {
      let userKeywords = 0;
      let userTokens = 0;
      let userBuyAmount = 0;

      userConfig.keywords.forEach(keywordConfig => {
        userKeywords++;
        keywordConfig.tokens.forEach(tokenConfig => {
          userTokens += tokenConfig.count;
          userBuyAmount += tokenConfig.buyAmount * tokenConfig.count;
        });
      });

      summary.totalKeywords += userKeywords;
      summary.totalTokenConfigs += userTokens;
      summary.totalPotentialBuyAmount += userBuyAmount;

      summary.users.push({
        username: userConfig.username,
        keywords: userKeywords,
        tokens: userTokens,
        totalBuyAmount: userBuyAmount
      });
    });

    return summary;
  }

  /**
   * Log a summary of the configuration
   */
  private static logSummary(config: GroupedMonitoringConfig[]): void {
    console.log('\n📊 Configuration Summary:');
    console.log('==========================');
    
    const summary = this.generateSummary(config);
    
    console.log(`👥 Total Users: ${summary.totalUsers}`);
    console.log(`🔍 Total Keywords: ${summary.totalKeywords}`);
    console.log(`🪙 Total Token Configurations: ${summary.totalTokenConfigs}`);
    console.log(`💰 Total Potential Buy Amount: ${summary.totalPotentialBuyAmount} SOL`);
    
    console.log('\n👤 User Breakdown:');
    summary.users.forEach((user: any) => {
      console.log(`  @${user.username}: ${user.keywords} keywords, ${user.tokens} tokens, ${user.totalBuyAmount} SOL`);
    });
    
    console.log('==========================\n');
  }

  /**
   * Generate a compact JSON file for easy sharing
   */
  static generateCompactJson(config: GroupedMonitoringConfig[]): void {
    try {
      if (!existsSync(this.OUTPUT_DIR)) {
        mkdirSync(this.OUTPUT_DIR, { recursive: true });
      }

      const outputPath = join(this.OUTPUT_DIR, 'monitoring-config-compact.json');
      
      // Create compact structure
      const compactData = config.map(userConfig => ({
        u: userConfig.username, // username
        k: userConfig.keywords.map(keywordConfig => ({
          kw: keywordConfig.keyword, // keyword
          t: keywordConfig.tokens.map(tokenConfig => ({
            ca: tokenConfig.tokenCA, // token contract address
            amt: tokenConfig.buyAmount, // buy amount
            cnt: tokenConfig.count // count
          }))
        }))
      }));

      writeFileSync(outputPath, JSON.stringify(compactData, null, 2), 'utf8');
      
      console.log(`📄 Compact JSON file generated: ${outputPath}`);
      
    } catch (error) {
      console.error('❌ Error generating compact JSON file:', error);
    }
  }

  /**
   * Check if output directory exists
   */
  static hasOutputDir(): boolean {
    return existsSync(this.OUTPUT_DIR);
  }

  /**
   * Get the full path to the generated JSON file
   */
  static getJsonFilePath(): string {
    return join(this.OUTPUT_DIR, this.FILENAME);
  }
} 