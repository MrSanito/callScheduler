// src/middleware/requestLogger.js

/**
 * Global request logging middleware.
 * Logs: timestamp | method | url | status | response time
 */
function requestLogger(req, res, next) {
  const start = Date.now();
  const timestamp = new Date().toISOString();

  // Log incoming request
  console.log(
    `[REQ]  ${timestamp} | ${req.method} ${req.originalUrl} | ip=${req.ip} | body=${JSON.stringify(req.body ?? {})}`
  );

  // Intercept res.json to log response
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    const duration = Date.now() - start;
    console.log(
      `[RES]  ${new Date().toISOString()} | ${req.method} ${req.originalUrl} | status=${res.statusCode} | ${duration}ms`
    );
    return originalJson(body);
  };

  next();
}

export { requestLogger };
