#!/usr/bin/env node

// Debug script to check Swagger generation
import { swaggerSpec } from './dist/config/swagger.js';
import fs from 'fs';

console.log('🔍 Debugging Swagger generation...');

try {
  console.log('📋 Swagger spec paths:', swaggerSpec.apis || 'No APIs found');
  console.log('📊 Number of paths:', Object.keys(swaggerSpec.paths || {}).length);
  
  // Save spec to file for inspection
  fs.writeFileSync('./swagger-debug.json', JSON.stringify(swaggerSpec, null, 2));
  console.log('✅ Swagger spec saved to swagger-debug.json');
  
  if (Object.keys(swaggerSpec.paths || {}).length === 0) {
    console.log('❌ No API paths found! Check file paths and JSDoc comments.');
  } else {
    console.log('✅ Swagger spec generated successfully!');
    console.log('📝 Available paths:');
    Object.keys(swaggerSpec.paths).forEach(path => {
      console.log(`  - ${path}`);
    });
  }
} catch (error) {
  console.error('❌ Error generating Swagger spec:', error.message);
}
