/**
 * Team Routes - Multi-user management endpoints
 */

const express = require('express');
const router = express.Router();
const { supabase } = require('../config/supabase');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { ROLES } = require('../config/constants');

// GET /team/:companyId - Get team members
router.get('/:companyId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('company_users')
            .select('*, users(email, full_name, avatar_url)')
            .eq('company_id', req.params.companyId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        logger.error('GET /team Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /team/invite - Invite a team member
router.post('/invite', async (req, res) => {
    try {
        const { companyId, email, role, invitedBy } = req.body;

        if (!companyId || !email || !role) {
            return res.status(400).json({ success: false, error: 'companyId, email, and role required' });
        }

        if (!Object.values(ROLES).includes(role)) {
            return res.status(400).json({ success: false, error: `Invalid role. Must be: ${Object.values(ROLES).join(', ')}` });
        }

        // Check if user exists
        const { data: existingUser } = await supabase
            .from('users')
            .select('id')
            .eq('email', email)
            .single();

        if (!existingUser) {
            // Store invitation for when user signs up
            await supabase.from('team_invitations').insert({
                id: crypto.randomUUID(),
                company_id: companyId,
                email,
                role,
                invited_by: invitedBy,
                status: 'pending',
                created_at: new Date().toISOString()
            });

            return res.json({
                success: true,
                message: `Invitation sent to ${email}. They will get access when they sign up.`,
                status: 'invited'
            });
        }

        // User exists - add to company
        const { error } = await supabase.from('company_users').upsert({
            company_id: companyId,
            user_id: existingUser.id,
            role,
            created_at: new Date().toISOString()
        }, { onConflict: 'company_id,user_id' });

        if (error) throw error;

        res.json({
            success: true,
            message: `${email} added as ${role} successfully.`,
            status: 'added'
        });
    } catch (error) {
        logger.error('POST /team/invite Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// PUT /team/role - Update team member role
router.put('/role', async (req, res) => {
    try {
        const { companyId, userId, role } = req.body;

        if (!companyId || !userId || !role) {
            return res.status(400).json({ success: false, error: 'companyId, userId, and role required' });
        }

        const { error } = await supabase
            .from('company_users')
            .update({ role })
            .eq('company_id', companyId)
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true, message: 'Role updated successfully' });
    } catch (error) {
        logger.error('PUT /team/role Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE /team/remove - Remove team member
router.delete('/remove', async (req, res) => {
    try {
        const { companyId, userId } = req.body;

        if (!companyId || !userId) {
            return res.status(400).json({ success: false, error: 'companyId and userId required' });
        }

        const { error } = await supabase
            .from('company_users')
            .delete()
            .eq('company_id', companyId)
            .eq('user_id', userId);

        if (error) throw error;
        res.json({ success: true, message: 'Team member removed' });
    } catch (error) {
        logger.error('DELETE /team/remove Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET /team/invitations/:companyId - Get pending invitations
router.get('/invitations/:companyId', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('team_invitations')
            .select('*')
            .eq('company_id', req.params.companyId)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, data: data || [] });
    } catch (error) {
        logger.error('GET /team/invitations Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
