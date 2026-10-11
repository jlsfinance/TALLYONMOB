const logger = require('../utils/logger');
const { createCorrelationId } = require('../utils/telemetry');

const errorHandler = (err, req, res, next) => {
    const correlationId = req.correlationId || createCorrelationId();
    const errorCode = /^[A-Z][A-Z0-9_.:-]{2,100}$/.test(err.code || '') ? err.code : 'INTERNAL_ERROR';
    res.locals.errorCode = errorCode;
    logger.error('request_failed', {
        correlationId,
        errorCode,
        method: req.method,
        path: req.path,
        status: err.status || 500,
        retryable: Boolean(err.retryable),
    });

    const status = err.status || 500;
    const message = status >= 500 ? 'Internal Server Error' : (err.userMessage || errorCode);

    res.status(status).json({
        success: false,
        status,
        error: errorCode,
        correlationId,
        message,
    });
};

module.exports = errorHandler;
