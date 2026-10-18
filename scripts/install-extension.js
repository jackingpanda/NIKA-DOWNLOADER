import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const extensionPath = path.resolve(__dirname, '..', 'src', 'extension');

console.log('='.repeat(65));
console.log('  🌐 NIKA DOWNLOADER WebExtension (Chrome / Edge / Brave / Opera)');
console.log('='.repeat(65));
console.log('\nExtension directory is ready at:');
console.log(`  👉  ${extensionPath}\n`);
console.log('To install into Google Chrome / Microsoft Edge / Brave:');
console.log('1. Open your browser and navigate to:');
console.log('   - Chrome: chrome://extensions');
console.log('   - Edge:   edge://extensions');
console.log('   - Brave:  brave://extensions');
console.log('2. Enable "Developer mode" (toggle in top-right corner).');
console.log('3. Click the "Load unpacked" button.');
console.log(`4. Select this directory:`);
console.log(`   ${extensionPath}`);
console.log('\nDone! The NIKA Downloader extension icon will appear in your browser toolbar.');
console.log('='.repeat(65));
