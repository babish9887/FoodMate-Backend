const rates = new Map();

/**
 * In-memory rate-limiting middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 15 mins)
 * @param {number} options.max - Max attempts per IP within window (default: 15)
 */
function createRateLimiter(options = { windowMs: 15 * 60 * 1000, max: 15 }) {
  const windowMs = options.windowMs || 15 * 60 * 1000;
  const max = options.max || 15;

  return (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    const key = `${req.baseUrl || ''}${req.path}:${ip}`;

    let record = rates.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
    } else {
      record.count += 1;
    }

    rates.set(key, record);

    // Housekeeping: purge old entries if map gets large
    if (rates.size > 2000) {
      for (const [k, v] of rates.entries()) {
        if (now > v.resetTime) rates.delete(k);
      }
    }

    if (record.count > max) {
      return res.status(429).json({
        success: false,
        message: "Too many attempts from this IP. Please try again after 15 minutes.",
      });
    }

    next();
  };
}

module.exports = { createRateLimiter };
