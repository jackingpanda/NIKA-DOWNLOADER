import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Sanitizes a filename for cross-platform filesystem compatibility (especially Windows NTFS/FAT32).
 * Removes illegal characters: < > : " / \ | ? * and control chars (0-31, 127).
 * Removes trailing dots and spaces.
 * Protects against Windows reserved device names (CON, PRN, AUX, NUL, COM1-9, LPT1-9).
 * Caps filename length to safe limits.
 * @param {string} name - Raw filename
 * @returns {string} Safe cross-platform filename
 */
export function sanitizeFilename(name) {
  if (!name || typeof name !== 'string') return 'download.bin';

  // Replace illegal Windows characters with underscore
  let s = name.replace(/[<>:"/\\|?*\x00-\x1F\x7F]/g, '_').trim();

  // Strip trailing dots and spaces (illegal in Windows filenames)
  s = s.replace(/[. ]+$/, '');

  if (!s) return 'download.bin';

  // Separate extension from basename
  const lastDot = s.lastIndexOf('.');
  let ext = '';
  let base = s;
  if (lastDot > 0 && lastDot > s.length - 12) {
    ext = s.slice(lastDot);
    base = s.slice(0, lastDot).trim();
  }

  // Check for reserved Windows filenames
  const reservedRegex = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  if (reservedRegex.test(base)) {
    base = `_${base}`;
  }

  // Cap base length to 200 characters to prevent MAX_PATH overflow
  if (base.length > 200) {
    base = base.slice(0, 200).trim();
  }

  return (base || 'download') + ext;
}

/**
 * Storage manager that handles sparse pre-allocation, concurrent offset writes,
 * and state metadata persistence.
 */
export class ReaStorage {
  /**
   * @param {string} destinationDir - Directory to save files
   * @param {string} filename - Target filename
   * @param {number|null} totalBytes - Expected file size in bytes
   */
  constructor(destinationDir, filename, totalBytes) {
    this.destinationDir = destinationDir;
    this.filename = sanitizeFilename(filename);
    this.totalBytes = totalBytes;
    this.filepath = path.join(destinationDir, this.filename);
    this.metaFilepath = `${this.filepath}.rea-meta`;
    this.fileHandle = null;
    this.isOpen = false;
  }

  /**
   * Initializes target directory, pre-allocates file, and opens handle
   */
  async init() {
    await fs.mkdir(this.destinationDir, { recursive: true });

    // Open file in read/write mode, create if absent
    this.fileHandle = await fs.open(this.filepath, 'w+');
    this.isOpen = true;

    // Fast sparse pre-allocation on NTFS / modern filesystems
    if (this.totalBytes && this.totalBytes > 0) {
      try {
        await this.fileHandle.truncate(this.totalBytes);
      } catch (err) {
        // Truncate fallback: some environments may not support instant resize
      }
    }
  }

  /**
   * Reopens an existing file for resume
   */
  async openForResume() {
    this.fileHandle = await fs.open(this.filepath, 'r+');
    this.isOpen = true;
  }

  /**
   * Writes a chunk buffer directly at the specified absolute byte offset
   * @param {Buffer|Uint8Array} buffer - Data to write
   * @param {number} offset - File position byte offset
   * @returns {Promise<number>} Number of bytes written
   */
  async writeAt(buffer, offset) {
    if (!this.isOpen || !this.fileHandle) {
      throw new Error('Storage is not open for writing');
    }

    const { bytesWritten } = await this.fileHandle.write(buffer, 0, buffer.length, offset);
    return bytesWritten;
  }

  /**
   * Persists resume metadata to disk (.rea-meta)
   * @param {Object} metadata - State dictionary
   */
  async saveMetadata(metadata) {
    const data = JSON.stringify({
      ...metadata,
      savedAt: new Date().toISOString()
    }, null, 2);

    const tempPath = `${this.metaFilepath}.tmp`;
    await fs.writeFile(tempPath, data, 'utf8');
    await fs.rename(tempPath, this.metaFilepath);
  }

  /**
   * Reads existing resume metadata if available
   * @returns {Promise<Object|null>}
   */
  async loadMetadata() {
    try {
      const content = await fs.readFile(this.metaFilepath, 'utf8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Checks whether a resume metadata file exists for this download
   * @returns {Promise<boolean>}
   */
  async hasMetadata() {
    try {
      await fs.access(this.metaFilepath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Flushes buffers to physical disk
   */
  async flush() {
    if (this.isOpen && this.fileHandle) {
      await this.fileHandle.sync();
    }
  }

  /**
   * Finalizes download, flushes disk cache, closes file handle, and cleans up metadata
   */
  async complete() {
    if (this.isOpen && this.fileHandle) {
      await this.flush();
      await this.fileHandle.close();
      this.fileHandle = null;
      this.isOpen = false;
    }

    // Remove metadata file upon clean completion
    try {
      await fs.unlink(this.metaFilepath);
    } catch {}
  }

  /**
   * Closes handle on pause or error without deleting metadata
   */
  async close() {
    if (this.isOpen && this.fileHandle) {
      await this.flush();
      await this.fileHandle.close();
      this.fileHandle = null;
      this.isOpen = false;
    }
  }
}
