import * as XLSX from 'xlsx';
import { readFileSync, existsSync } from 'fs';
import { MonitoringConfig, GroupedMonitoringConfig, KeywordConfig, TokenConfig } from '../types';
import { DEFAULT_BUY_AMOUNT } from '../config/environment';

export interface ExcelRowData {
  username?: string | number;
  keyword?: string | number;
  tokenCA?: string | number;
  buyAmount?: string | number;
}

export class ExcelImporter {
  private static readonly EXCEL_FILE_PATH = 'monitoring-config.xlsx';
  private static readonly TEMPLATE_FILE_PATH = 'monitoring-config-template.xlsx';

  /**
   * Create a sample Excel template file
   */
  static createTemplate(): void {
    const templateData = [
      {
        username: 'elonmusk',
        keyword: 'coin',
        tokenCA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        buyAmount: 0.0002
      },
      {
        username: 'elonmusk', 
        keyword: 'solana',
        tokenCA: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        buyAmount: 0.0001
      },
      {
        username: 'vitalikbuterin',
        keyword: 'launch',
        tokenCA: '',
        buyAmount: 0.0005
      }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // username
      { wch: 15 }, // keyword
      { wch: 50 }, // tokenCA
      { wch: 12 }  // buyAmount
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Monitoring Config');

    XLSX.writeFile(workbook, this.TEMPLATE_FILE_PATH);
    console.log(`📄 Excel template created: ${this.TEMPLATE_FILE_PATH}`);
    console.log('📝 Edit this file with your monitoring configurations and save as monitoring-config.xlsx');
  }

  /**
   * Import monitoring configurations from Excel file and group by username
   */
  static importFromExcel(): GroupedMonitoringConfig[] {
    const filePath = this.EXCEL_FILE_PATH;

    if (!existsSync(filePath)) {
      console.log(`📄 Excel file not found: ${filePath}`);
      
      // Check if template exists, if not create it
      if (!existsSync(this.TEMPLATE_FILE_PATH)) {
        console.log('🔄 Creating Excel template...');
        this.createTemplate();
      }
      
      console.log(`💡 Please edit ${this.TEMPLATE_FILE_PATH} and save as ${filePath}`);
      return [];
    }

    try {
      console.log(`📊 Reading Excel file: ${filePath}`);
      
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      
      const rawData: ExcelRowData[] = XLSX.utils.sheet_to_json(worksheet, {
        header: ['username', 'keyword', 'tokenCA', 'buyAmount'],
        range: 1 // Skip header row
      });

      // Group configurations by username
      const groupedConfigs = this.groupConfigurationsByUsername(rawData);
      
      console.log(`📊 Successfully imported and grouped ${groupedConfigs.length} user configurations from Excel`);
      return groupedConfigs;

    } catch (error) {
      console.error('❌ Error reading Excel file:', error);
      console.log('💡 Make sure the Excel file is not open in another application');
      return [];
    }
  }

  /**
   * Group raw Excel data by username, handling repeated keywords and tokens
   */
  private static groupConfigurationsByUsername(rawData: ExcelRowData[]): GroupedMonitoringConfig[] {
    const userGroups = new Map<string, Map<string, Map<string, { buyAmount: number; count: number }>>>();

    rawData.forEach((row, index) => {
      const rowNumber = index + 2; // +2 because we skip header and arrays are 0-indexed
      
      // Skip empty rows
      if (!row.username && !row.keyword && !row.tokenCA && !row.buyAmount) {
        return;
      }

      // Validate required fields
      if (!row.username) {
        console.warn(`⚠️  Row ${rowNumber}: Missing username`);
        return;
      }

      if (row.keyword === undefined || row.keyword === null) {
        console.warn(`⚠️  Row ${rowNumber}: Missing keyword`);
        return;
      }

      // Clean and validate data
      const username = row.username.toString().trim();
      const keyword = row.keyword.toString().trim();
      const tokenCA = row.tokenCA && row.tokenCA.toString().trim() !== '' 
        ? row.tokenCA.toString().trim() 
        : null;

      // Parse buy amount
      let buyAmount = DEFAULT_BUY_AMOUNT;
      if (row.buyAmount !== undefined && row.buyAmount !== null) {
        const parsed = typeof row.buyAmount === 'number' 
          ? row.buyAmount 
          : parseFloat(row.buyAmount.toString());
        
        if (!isNaN(parsed) && parsed > 0) {
          buyAmount = parsed;
        } else {
          console.warn(`⚠️  Row ${rowNumber}: Invalid buy amount "${row.buyAmount}", using default: ${DEFAULT_BUY_AMOUNT} SOL`);
        }
      }

      // Initialize user group if not exists
      if (!userGroups.has(username)) {
        userGroups.set(username, new Map());
      }
      const userGroup = userGroups.get(username)!;

      // Initialize keyword group if not exists
      if (!userGroup.has(keyword)) {
        userGroup.set(keyword, new Map());
      }
      const keywordGroup = userGroup.get(keyword)!;

      // Create token key (use 'null' for empty tokenCA to handle it properly)
      const tokenKey = tokenCA || 'null';

      // Add or update token configuration
      if (keywordGroup.has(tokenKey)) {
        const existing = keywordGroup.get(tokenKey)!;
        existing.count++;
        // Use the highest buy amount if different
        if (buyAmount > existing.buyAmount) {
          existing.buyAmount = buyAmount;
        }
      } else {
        keywordGroup.set(tokenKey, { buyAmount, count: 1 });
      }

      console.log(`✅ Row ${rowNumber}: @${username} - keyword: "${keyword}" - CA: ${tokenCA || 'none'} - Buy Amount: ${buyAmount} SOL`);
    });

    // Convert grouped data to final structure
    const groupedConfigs: GroupedMonitoringConfig[] = [];
    
    for (const [username, keywordGroups] of userGroups) {
      const keywords: KeywordConfig[] = [];
      
      for (const [keyword, tokenGroups] of keywordGroups) {
        const tokens: TokenConfig[] = [];
        
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

    // Log grouped configuration summary
    this.logGroupedConfigurationSummary(groupedConfigs);
    
    return groupedConfigs;
  }

  /**
   * Log a summary of the grouped configuration
   */
  private static logGroupedConfigurationSummary(configs: GroupedMonitoringConfig[]): void {
    console.log('\n📊 Grouped Configuration Summary:');
    console.log('================================');
    
    for (const userConfig of configs) {
      console.log(`\n👤 @${userConfig.username}:`);
      
      for (const keywordConfig of userConfig.keywords) {
        console.log(`  🔍 Keyword: "${keywordConfig.keyword}"`);
        
        for (const tokenConfig of keywordConfig.tokens) {
          const tokenDisplay = tokenConfig.tokenCA || 'No specific token';
          const totalAmount = tokenConfig.buyAmount * tokenConfig.count;
          console.log(`    💰 Token: ${tokenDisplay}`);
          console.log(`    📊 Buy Amount: ${tokenConfig.buyAmount} SOL × ${tokenConfig.count} = ${totalAmount} SOL total`);
        }
      }
    }
    
    console.log('\n================================');
  }

  /**
   * Import legacy format (for backward compatibility)
   */
  static importLegacyFromExcel(): MonitoringConfig[] {
    const groupedConfigs = this.importFromExcel();
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

  /**
   * Check if Excel file exists
   */
  static hasExcelFile(): boolean {
    return existsSync(this.EXCEL_FILE_PATH);
  }

  /**
   * Check if Excel template file exists
   */
  static hasTemplate(): boolean {
    return existsSync(this.TEMPLATE_FILE_PATH);
  }
} 