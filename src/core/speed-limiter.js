/**
 * Token Bucket Bandwidth Limiter
 * Provides throttling for individual segments or global throughput.
 */
export class SpeedLimiter {
  /**
   * @param {number} bytesPerSecond - Speed limit in bytes per second (0 = unlimited)
   */
  constructor(bytesPerSecond = 0) {
    this.bytesPerSecond = bytesPerSecond;
    this.tokens = bytesPerSecond;
    this.lastRefill = Date.now();
    this.refillIntervalMs = 100; // Refill every 100ms for smooth streaming
  }

  /**
   * Updates current speed limit
   * @param {number} bytesPerSecond - 0 means unlimited
   */
  setLimit(bytesPerSecond) {
    this.bytesPerSecond = Math.max(0, bytesPerSecond);
    this.tokens = this.bytesPerSecond;
    this.lastRefill = Date.now();
  }

  /**
   * Refills token bucket based on elapsed time
   * @private
   */
  _refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      const addedTokens = (this.bytesPerSecond * elapsed) / 1000;
      this.tokens = Math.min(this.bytesPerSecond, this.tokens + addedTokens);
      this.lastRefill = now;
    }
  }

  /**
   * Consumes bytes from bucket or delays until enough tokens are available
   * @param {number} bytes - Number of bytes to consume
   * @param {AbortSignal} [signal] - Optional abort signal
   * @returns {Promise<void>}
   */
  async consume(bytes, signal) {
    if (this.bytesPerSecond <= 0) return;

    while (bytes > 0) {
      if (signal?.aborted) return;

      this._refill();

      if (this.tokens >= bytes) {
        this.tokens -= bytes;
        return;
      }

      if (this.tokens > 0) {
        bytes -= this.tokens;
        this.tokens = 0;
      }

      // Calculate delay needed for remaining tokens
      const neededTokens = bytes;
      const waitMs = Math.min(1000, Math.max(10, Math.ceil((neededTokens / this.bytesPerSecond) * 1000)));

      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}
