#!/usr/bin/env node

import { ExcelImporter } from './services/excel-importer';

console.log('🔧 Excel Template Generator');
console.log('============================');

try {
  ExcelImporter.createTemplate();
  console.log('\n✅ Template generation completed!');
  console.log('📝 Edit monitoring-config-template.xlsx and save as monitoring-config.xlsx');
  console.log('🚀 Then run: npm start');
} catch (error) {
  console.error('❌ Error generating template:', error);
  process.exit(1);
} 