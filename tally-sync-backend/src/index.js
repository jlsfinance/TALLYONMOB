const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
require('dotenv').config({ override: true });
const { requestContext, snapshot } = require('./utils/telemetry');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5000;
const { getReadiness } = require('./services/readinessService');

// Middleware
app.use(helmet());
app.use(cors()); // Allow all origins for dev
app.use(requestContext);
// Compress large sync responses while leaving tiny health responses untouched.
app.use(compression({ threshold: '1kb' }));
app.use(express.json({ limit: '50mb' })); // Large payload for Tally data
app.use(morgan(':method :status :response-time ms correlation=:req[x-correlation-id]'));

// Import Routes
const syncRoutes = require('./routes/syncRoutes');
const dataRoutes = require('./routes/dataRoutes');
const telegramRoutes = require('./routes/telegramRoutes');
const contactRoutes = require('./routes/contactRoutes');
const reminderRoutes = require('./routes/reminderRoutes');
const aiRoutes = require('./routes/aiRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const teamRoutes = require('./routes/teamRoutes');
const backupRoutes = require('./routes/backupRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const telegramService = require('./services/telegramService');
const recurringRoutes = require('./routes/recurring');
const portalRoutes = require('./routes/portal');
const reportRoutes = require('./routes/reports');
const appwriteMockRoute = require('./routes/appwriteMockRoute');
const adminRoutes = require('./routes/adminRoutes');
const invoiceExtractRoutes = require('./routes/invoiceExtract');
const { validateSyncCredential } = require('./middleware/auth');

// Use Routes
app.use('/api/v1/sync', validateSyncCredential, syncRoutes);
app.use('/api/v1/data', dataRoutes);
app.use('/api/v1/telegram', telegramRoutes);
app.use('/api/v1/contact', contactRoutes);
app.use('/api/v1/reminders', reminderRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/team', teamRoutes);
app.use('/api/v1/backup', backupRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/recurring', recurringRoutes);
app.use('/api/v1/portal', portalRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/invoice', invoiceExtractRoutes);
app.use('/api/mock/supa', appwriteMockRoute);

// Health Check
app.get('/', (req, res) => {
    res.send({ status: 'Online', service: 'Tally Sync Backend', version: process.env.APP_VERSION || 'unknown', correlationId: req.correlationId });
});

app.get('/health/readiness', async (req, res) => {
    const readiness = await getReadiness();
    const httpStatus = readiness.status === 'healthy' ? 200 : 503;
    res.status(httpStatus).json({
        ...readiness,
        version: process.env.APP_VERSION || 'unknown',
        correlationId: req.correlationId,
    });
});

app.get('/metrics', (req, res) => {
    const configuredKey = process.env.METRICS_ACCESS_KEY;
    if (process.env.NODE_ENV === 'production' && (!configuredKey || req.get('x-metrics-key') !== configuredKey)) {
        return res.status(404).json({ success: false, error: 'NOT_FOUND', correlationId: req.correlationId });
    }
    return res.status(200).json(snapshot());
});

app.use(errorHandler);

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Endpoints:`);
    console.log(`- POST /api/v1/sync (Sync Tally Data)`);
    console.log(`- GET  /api/v1/data (Web Dashboard)`);

    // Telegram bot runner
    // - Enable polling with TELEGRAM_POLLING_ENABLED=true (default: true when token exists)
    // - Disable in environments where webhook handles updates
    const hasTelegramToken = Boolean(process.env.TELEGRAM_BOT_TOKEN);
    const pollingEnabled = (process.env.TELEGRAM_POLLING_ENABLED || 'true').toLowerCase() === 'true';

    if (hasTelegramToken && pollingEnabled) {
        telegramService.startPolling();
        console.log('Telegram polling enabled');
    } else if (hasTelegramToken && !pollingEnabled) {
        console.log('Telegram polling disabled (expecting webhook mode)');
    } else {
        console.log('Telegram bot token not configured; bot is inactive');
    }
});
