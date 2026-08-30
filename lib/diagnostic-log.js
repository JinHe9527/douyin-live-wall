'use strict';

const isDev = process.env.NODE_ENV !== 'production';

function formatError(error) {
  if (!error) return 'unknown';
  if (error instanceof Error) return error.message || error.name || 'Error';
  if (typeof error === 'string') return error;
  try { return JSON.stringify(error); } catch (_e) { return String(error); }
}

function logDiagnostic(label, error) {
  const message = formatError(error);
  console.warn(`[diag] ${label}: ${message}`);
  if (isDev && error && error.stack) console.warn(error.stack);
}

function safeRun(promise, label) {
  if (!promise || typeof promise.then !== 'function') return Promise.resolve();
  return promise.then(undefined, (err) => { logDiagnostic(label, err); });
}

function safeFallback(promise, fallback, label) {
  if (!promise || typeof promise.then !== 'function') return Promise.resolve(fallback);
  return promise.then(
    (v) => v,
    (err) => { logDiagnostic(label, err); return fallback; }
  );
}

module.exports = { logDiagnostic, safeRun, safeFallback };
