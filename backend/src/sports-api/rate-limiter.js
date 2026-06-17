/** Fila global com intervalo mínimo e teto por minuto (TheSportsDB free ~30/min). */
export class RateLimiter {
  constructor({ minIntervalMs = 500, maxPerMinute = 28 } = {}) {
    this.minIntervalMs = minIntervalMs;
    this.maxPerMinute = maxPerMinute;
    this.queue = [];
    this.processing = false;
    this.lastRequestAt = 0;
    this.timestamps = [];
  }

  _pruneTimestamps() {
    const cutoff = Date.now() - 60_000;
    this.timestamps = this.timestamps.filter((t) => t >= cutoff);
  }

  _waitMs() {
    this._pruneTimestamps();
    const sinceLast = Date.now() - this.lastRequestAt;
    const intervalWait = Math.max(0, this.minIntervalMs - sinceLast);
    if (this.timestamps.length >= this.maxPerMinute) {
      const oldest = this.timestamps[0];
      const minuteWait = Math.max(0, oldest + 60_000 - Date.now());
      return Math.max(intervalWait, minuteWait);
    }
    return intervalWait;
  }

  async schedule(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this._process();
    });
  }

  async _process() {
    if (this.processing) return;
    this.processing = true;
    while (this.queue.length) {
      const wait = this._waitMs();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      const job = this.queue.shift();
      if (!job) break;
      this.lastRequestAt = Date.now();
      this.timestamps.push(this.lastRequestAt);
      try {
        job.resolve(await job.fn());
      } catch (err) {
        job.reject(err);
      }
    }
    this.processing = false;
  }

  getStats() {
    this._pruneTimestamps();
    return {
      queueLength: this.queue.length,
      requestsLastMinute: this.timestamps.length,
      maxPerMinute: this.maxPerMinute,
      minIntervalMs: this.minIntervalMs,
    };
  }
}
