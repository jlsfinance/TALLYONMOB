const express = require('express');
const router = express.Router();
const { users, supabase } = require('../config/supabase');

const DEFAULT_TRIAL_DAYS = 14;

function getDateAfterDays(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString();
}

async function loadAllUsers() {
    try {
        const result = await users.list();
        return result.users || [];
    } catch (e) {
        return [];
    }
}

router.post('/license', async (req, res) => {
    try {
        const { action, target_email, days } = req.body || {};

        if (!action) {
            return res.status(400).json({ status: 'error', message: 'action is required' });
        }

        if (action === 'list_all') {
            const userList = await loadAllUsers();
            const licenses = userList.map((u) => {
                const prefs = u.prefs || {};
                return {
                    id: u.$id,
                    user_id: u.$id,
                    email: u.email,
                    plan: prefs.plan || 'trial',
                    status: prefs.status || 'active',
                    trial_end: prefs.trial_end || getDateAfterDays(DEFAULT_TRIAL_DAYS),
                    subscription_end: prefs.subscription_end || null,
                    tally_serial: prefs.tally_serial || null,
                    last_login: u.accessedAt || u.$updatedAt || u.$createdAt
                };
            });

            return res.json({ status: 'ok', licenses });
        }

        if (!target_email) {
            return res.status(400).json({ status: 'error', message: 'target_email is required' });
        }

        const userList = await loadAllUsers();
        const target = userList.find((u) => String(u.email).toLowerCase() === String(target_email).toLowerCase());
        if (!target) {
            return res.status(404).json({ status: 'error', message: 'User not found' });
        }

        const currentPrefs = target.prefs || {};
        const nextPrefs = { ...currentPrefs };

        if (action === 'block_user') {
            nextPrefs.status = 'blocked';
        } else if (action === 'activate_user') {
            nextPrefs.status = 'active';
        } else if (action === 'extend_trial') {
            const extendBy = Number(days || 7);
            const base = currentPrefs.trial_end ? new Date(currentPrefs.trial_end) : new Date();
            if (Number.isNaN(base.getTime()) || base < new Date()) {
                nextPrefs.trial_end = getDateAfterDays(extendBy);
            } else {
                base.setDate(base.getDate() + extendBy);
                nextPrefs.trial_end = base.toISOString();
            }
            nextPrefs.plan = currentPrefs.plan || 'trial';
            nextPrefs.status = 'active';
        } else {
            return res.status(400).json({ status: 'error', message: 'Unsupported action' });
        }

        await users.updatePrefs(target.$id, nextPrefs);

        return res.json({ status: 'ok', message: 'Admin action applied' });
    } catch (error) {
        return res.status(500).json({ status: 'error', message: error.message });
    }
});

module.exports = router;
