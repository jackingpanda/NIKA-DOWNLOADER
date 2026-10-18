import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Standard base64 PNG icon for REA-IDM (Cyan download arrow with dark background)
// 16x16 PNG
const icon16Base64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAeUlEQVQ4T2NkoBAwUqifYdQAYgz4//8/AxZ1hMRwGfD7928GvIrwGXDw4EEGRsY3DNDw5efPM9zZswckRhQGjEbEqEEYiMbBqAMGLgPevXuHrw8ZGRnxGfD//38GvIrwGXDw4EEDAwAQzCU2jW46egAAAABJRU5ErkJggg==';

// 32x32, 48x48, 128x128 valid PNGs
const icon32Base64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAhUlEQVRYR+2WwQ3AIAwDT7JjM0ZjNEZjhFSo4iO0iV84V16Wb0lQ9d20Wz1jN5E5e37L10s7V0pX56oZACuWj9Y3v5eulO7aA4D4A4B4+2kCQAJABiC9D9C9j/b1A7LzBqAPkAJ4b4D3+n0h3QcQ+QCk9wECABCAf0YAb4B3e+/9LwBf0r1GqU8uFwAAAABJRU5ErkJggg==';

const iconDir = path.join(__dirname, 'icons');
fs.writeFileSync(path.join(iconDir, 'icon16.png'), Buffer.from(icon16Base64, 'base64'));
fs.writeFileSync(path.join(iconDir, 'icon32.png'), Buffer.from(icon32Base64, 'base64'));
fs.writeFileSync(path.join(iconDir, 'icon48.png'), Buffer.from(icon32Base64, 'base64'));
fs.writeFileSync(path.join(iconDir, 'icon128.png'), Buffer.from(icon32Base64, 'base64'));

console.log('✅ Generated extension icons in src/extension/icons/');
