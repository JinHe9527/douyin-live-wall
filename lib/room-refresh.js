'use strict';

(function exposeRoomRefresh(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RoomRefresh = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRoomRefreshModule() {
  async function runRoomRefresh(items, refresh, options = {}) {
    const list = Array.from(items || []);
    const requestedConcurrency = Number(options.concurrency);
    const concurrency = Number.isInteger(requestedConcurrency) && requestedConcurrency > 0
      ? requestedConcurrency
      : 3;
    const results = new Array(list.length);
    let cursor = 0;

    async function runWorker() {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = { ok: true, value: await refresh(list[index], index) };
        } catch (error) {
          results[index] = { ok: false, error };
        }
      }
    }

    const workerCount = Math.min(concurrency, list.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return results;
  }

  return { runRoomRefresh };
});
