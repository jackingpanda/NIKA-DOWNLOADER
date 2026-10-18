import fs from 'node:fs/promises';
import path from 'node:path';

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
    this.filename = filename;
    this.totalBytes = totalBytes;
    this.filepath = path.join(destinationDir, filename);
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
