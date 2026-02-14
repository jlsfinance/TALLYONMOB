const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet());
app.use(cors()); // Allow all origins for dev
app.use(express.json({ limit: '50mb' })); // Large payload for Tally data
app.use(morgan('dev'));

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

// Use Routes
app.use('/api/v1/sync', syncRoutes);
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

// Health Check
app.get('/', (req, res) => {
    res.send({ status: 'Online', service: 'Tally Sync Backend' });
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Endpoints:`);
    console.log(`- POST /api/v1/sync (Sync Tally Data)`);
    console.log(`- GET  /api/v1/data (Web Dashboard)`);

    // Start Telegram Polling for local dev (MIGRATED TO SUPABASE EDGE FUNCTIONS)
    // telegramService.startPolling();
});
