const crypto = require('crypto');

const counters = new Map();
const durations = new Map();

function increment(name, value = 1) {
  counters.set(name, (counters.get(name) || 0) + value);
}

function observe(name, durationMs) {
  const entry = durations.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
  entry.count += 1;
  entry.totalMs += Math.max(0, Number(durationMs) || 0);
  entry.maxMs = Math.max(entry.maxMs, Number(durationMs) || 0);
  durations.set(name, entry);
}

function createCorrelationId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(value)
    ? value
    : crypto.randomUUID();
}

function recordRequest({ operation, durationMs, statusCode, outcome, errorCode, retryCount = 0 }) {
  const safeOperation = String(operation || 'unknown').replace(/[^A-Za-z0-9_.:/-]/g, '_').slice(0, 100);
  observe(safeOperation, durationMs);
  increment(`http.${statusCode >= 500 ? 'server_error' : statusCode >= 400 ? 'client_error' : 'success'}`);
  increment(`operation.${safeOperation}.${outcome || (statusCode >= 400 ? 'failure' : 'success')}`);
  if (errorCode) increment(`error.${String(errorCode).replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100)}`);
  if (retryCount > 0) increment('retry.requested', retryCount);
}

function snapshot() {
  const metrics = {};
  for (const [name, value] of counters) metrics[name] = value;
  const timings = {};
  for (const [name, value] of durations) {
    timings[name] = {
      count: value.count,
      totalMs: Math.round(value.totalMs),
      maxMs: Math.round(value.maxMs),
      averageMs: Math.round(value.totalMs / Math.max(1, value.count)),
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    appVersion: process.env.APP_VERSION || process.env.npm_package_version || 'unknown',
    counters: metrics,
    timings,
  };
}

function requestContext(req, res, next) {
  const correlationId = createCorrelationId(req.get('x-correlation-id'));
  req.correlationId = correlationId;
  req.startedAt = process.hrtime.bigint();
  res.setHeader('x-correlation-id', correlationId);
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - req.startedAt) / 1e6;
    recordRequest({
      operation: `${req.method} ${req.baseUrl || ''}${req.path}`,
      durationMs,
      statusCode: res.statusCode,
      outcome: res.statusCode >= 400 ? 'failure' : 'success',
      errorCode: res.locals.errorCode,
    });
  });
  next();
}

module.exports = { createCorrelationId, increment, observe, recordRequest, requestContext, snapshot };
