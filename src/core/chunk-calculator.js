/**
 * Minimum byte size for an individual chunk (512 KiB)
 * Avoids creating excessive connections for tiny files.
 */
export const MIN_CHUNK_SIZE = 512 * 1024;

/**
 * Calculates initial chunk segments for a multi-part download
 * @param {number} totalBytes - Total file size in bytes
 * @param {number} [maxConnections=8] - Target number of simultaneous connections (1-32)
 * @returns {Array<Object>} List of chunk descriptor objects
 */
export function calculateChunks(totalBytes, maxConnections = 8) {
  if (!totalBytes || totalBytes <= 0) {
    return [{
      id: 0,
      startByte: 0,
      endByte: null,
      totalBytes: null,
      downloadedBytes: 0,
      currentOffset: 0,
      status: 'pending'
    }];
  }

  // Determine optimal connection count based on file size
  let connections = Math.min(Math.max(1, maxConnections), 32);
  const possibleChunks = Math.floor(totalBytes / MIN_CHUNK_SIZE);
  if (possibleChunks < connections) {
    connections = Math.max(1, possibleChunks);
  }

  const baseChunkSize = Math.floor(totalBytes / connections);
  const remainder = totalBytes % connections;
  const chunks = [];

  let currentStart = 0;
  for (let i = 0; i < connections; i++) {
    const size = baseChunkSize + (i === connections - 1 ? remainder : 0);
    const end = currentStart + size - 1;

    chunks.push({
      id: i,
      startByte: currentStart,
      endByte: end,
      totalBytes: size,
      downloadedBytes: 0,
      currentOffset: currentStart,
      status: 'pending'
    });

    currentStart = end + 1;
  }

  return chunks;
}

/**
 * Dynamically splits an active chunk's remaining un-downloaded portion into two chunks.
 * Used when worker threads finish early to help slow connections.
 * @param {Object} chunk - The slow/active chunk
 * @param {number} newChunkId - ID to assign to the newly created chunk
 * @returns {Object|null} The newly created child chunk, or null if chunk is too small to split
 */
export function dynamicSplitChunk(chunk, newChunkId) {
  if (!chunk || chunk.status !== 'downloading') return null;

  const remaining = chunk.endByte - chunk.currentOffset + 1;
  if (remaining < MIN_CHUNK_SIZE * 2) {
    return null; // Not enough remaining bytes to justify a split
  }

  const half = Math.floor(remaining / 2);
  const originalEnd = chunk.endByte;
  
  // Adjust original chunk end byte
  chunk.endByte = chunk.currentOffset + half - 1;
  chunk.totalBytes = chunk.endByte - chunk.startByte + 1;

  // Create new child chunk for the second half
  const newChunk = {
    id: newChunkId,
    startByte: chunk.endByte + 1,
    endByte: originalEnd,
    totalBytes: originalEnd - (chunk.endByte + 1) + 1,
    downloadedBytes: 0,
    currentOffset: chunk.endByte + 1,
    status: 'pending'
  };

  return newChunk;
}
