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

// Use Routes
app.use('/api/v1/sync', syncRoutes);
app.use('/api/v1/data', dataRoutes);

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
});
