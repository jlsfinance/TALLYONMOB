const express = require('express');
const router = express.Router();
const mailService = require('../services/mailService');

router.post('/send', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;

        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Please provide name, email, and message.' });
        }

        await mailService.sendContactMail({ name, email, subject, message });

        res.status(200).json({ message: 'Success! Your message has been sent.' });
    } catch (error) {
        console.error('Contact Form Error:', error);
        res.status(500).json({ error: 'Failed to send message. Please try again later.' });
    }
});

module.exports = router;
