/**
 * SaaS Licensing Service
 * Handles trial validation, license management, coupons, subscriptions
 */
import { supabase } from './insforge';

// ============================================================
// TYPES
// ============================================================

export interface LicensePlan {
    id: string;
    name: string;
    slug: string;
    duration_days: number;
    price: number;
    gst_percent: number;
    features: string[];
    is_trial: boolean;
    is_active: boolean;
}

export interface UserLicense {
    id: string;
    user_id: string;
    license_key: string;
    plan_id: string;
    status: 'active' | 'expired' | 'blocked' | 'suspended';
    activation_date: string;
    expiry_date: string;
    tally_serial?: string;
    company_gst?: string;
    company_pan?: string;
    auto_renew: boolean;
    plan?: LicensePlan;
}

export interface TrialCheckResult {
    eligible: boolean;
    reason: string;
    existing_trial_end?: string;
}

export interface LicenseValidation {
    valid: boolean;
    status: string;
    plan_name: string;
    expiry_date: string;
    days_left: number;
}

export interface Coupon {
    id: string;
    code: string;
    description?: string;
    discount_type: 'flat' | 'percentage';
    discount_value: number;
    max_discount?: number;
    min_order: number;
    usage_limit?: number;
    used_count: number;
    per_user_limit: number;
    expiry_date?: string;
    is_active: boolean;
}

export interface Payment {
    id: string;
    user_id: string;
    license_id?: string;
    plan_id?: string;
    amount: number;
    gst_amount: number;
    discount_amount: number;
    total_amount: number;
    status: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
    invoice_number?: string;
    paid_at?: string;
    created_at: string;
}

export interface ActivityLog {
    id: string;
    user_id?: string;
    actor_email?: string;
    actor_role?: string;
    action: string;
    entity_type?: string;
    entity_id?: string;
    entity_name?: string;
    details: any;
    ip_address?: string;
    created_at: string;
}

export interface SalesLead {
    id: string;
    name: string;
    email?: string;
    mobile?: string;
    company_name?: string;
    tally_serial?: string;
    status: 'prospect' | 'interested' | 'demo_given' | 'converted' | 'renewed' | 'lost';
    assigned_to?: string;
    notes?: string;
    next_followup?: string;
    created_at: string;
}

// ============================================================
// TRIAL MANAGEMENT
// ============================================================

export const trialService = {
    /**
     * Check if user/device/company is eligible for trial
     * TAMPER-PROOF: checks email, mobile, device, tally serial, GST
     */
    async checkEligibility(params: {
        email?: string;
        mobile?: string;
        device_id?: string;
        tally_serial?: string;
        company_gst?: string;
    }): Promise<TrialCheckResult> {
        try {
            const { data, error } = await supabase.rpc('check_trial_eligibility', {
                p_email: params.email || null,
                p_mobile: params.mobile || null,
                p_device_id: params.device_id || null,
                p_tally_serial: params.tally_serial || null,
                p_company_gst: params.company_gst || null,
            });

            if (error) throw error;
            return data?.[0] || { eligible: false, reason: 'Check failed' };
        } catch (err: any) {
            console.error('Trial eligibility check failed:', err);
            return { eligible: false, reason: 'Unable to verify trial eligibility' };
        }
    },

    /**
     * Activate trial — creates trial_history + user_license
     */
    async activate(params: {
        user_id: string;
        email: string;
        mobile?: string;
        device_id?: string;
        device_fingerprint?: string;
        tally_serial?: string;
        company_gst?: string;
        company_pan?: string;
        company_name?: string;
        ip_address?: string;
    }): Promise<{ success: boolean; license?: UserLicense; error?: string }> {
        // First check eligibility
        const check = await this.checkEligibility(params);
        if (!check.eligible) {
            return { success: false, error: check.reason };
        }

        // Get trial plan
        const { data: plan } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('slug', 'trial')
            .single();

        if (!plan) return { success: false, error: 'Trial plan not found' };

        const trialStart = new Date();
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + plan.duration_days);

        // Generate license key
        const { data: keyData } = await supabase.rpc('generate_license_key', { plan_slug: 'trial' });
        const licenseKey = keyData || `TOM-${new Date().getFullYear()}-TRIAL-XXXX`;

        // Create trial history
        const { error: trialErr } = await supabase.from('trial_history').insert({
            user_id: params.user_id,
            email: params.email,
            mobile: params.mobile,
            device_id: params.device_id,
            device_fingerprint: params.device_fingerprint,
            tally_serial: params.tally_serial,
            company_gst: params.company_gst,
            company_pan: params.company_pan,
            company_name: params.company_name,
            ip_address: params.ip_address,
            trial_start: trialStart.toISOString(),
            trial_end: trialEnd.toISOString(),
            trial_used: true,
        });

        if (trialErr) {
            console.error('Trial history insert failed:', trialErr);
        }

        // Create license
        const { data: license, error: licErr } = await supabase.from('user_licenses').insert({
            user_id: params.user_id,
            license_key: licenseKey,
            plan_id: plan.id,
            status: 'active',
            activation_date: trialStart.toISOString(),
            expiry_date: trialEnd.toISOString(),
            activated_from_ip: params.ip_address,
            device_fingerprint: params.device_fingerprint,
            tally_serial: params.tally_serial,
            company_gst: params.company_gst,
            company_pan: params.company_pan,
        }).select().single();

        if (licErr) return { success: false, error: licErr.message };

        // Log activity
        await this.logActivity(params.user_id, 'trial_activated', 'license', license.id, licenseKey, {
            plan: 'trial',
            duration: plan.duration_days,
            expiry: trialEnd.toISOString(),
        });

        return { success: true, license };
    },
};

// ============================================================
// LICENSE VALIDATION
// ============================================================

export const licenseService = {
    /**
     * Validate license on login
     */
    async validate(userId: string): Promise<LicenseValidation> {
        try {
            const { data, error } = await supabase.rpc('validate_user_license', {
                p_user_id: userId,
            });

            if (error) throw error;
            return data?.[0] || { valid: false, status: 'error', plan_name: 'Unknown', expiry_date: '', days_left: 0 };
        } catch (err: any) {
            console.error('License validation failed:', err);
            return { valid: false, status: 'error', plan_name: 'Unknown', expiry_date: '', days_left: 0 };
        }
    },

    /**
     * Get current active license for user
     */
    async getActiveLicense(userId: string): Promise<UserLicense | null> {
        const { data } = await supabase
            .from('user_licenses')
            .select('*, plan:subscription_plans(*)')
            .eq('user_id', userId)
            .in('status', ['active', 'suspended'])
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        return data;
    },

    /**
     * Check if feature is allowed based on license
     */
    async hasFeature(userId: string, feature: string): Promise<boolean> {
        const license = await this.getActiveLicense(userId);
        if (!license || license.status !== 'active') return false;

        const { data: plan } = await supabase
            .from('subscription_plans')
            .select('features')
            .eq('id', license.plan_id)
            .single();

        return plan?.features?.includes(feature) || false;
    },

    /**
     * Generate new license key
     */
    async createLicense(params: {
        user_id: string;
        plan_id: string;
        tally_serial?: string;
        company_gst?: string;
        company_pan?: string;
        duration_days?: number;
    }): Promise<{ success: boolean; license?: UserLicense; error?: string }> {
        // Get plan
        const { data: plan } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', params.plan_id)
            .single();

        if (!plan) return { success: false, error: 'Plan not found' };

        const duration = params.duration_days || plan.duration_days;
        const { data: keyData } = await supabase.rpc('generate_license_key', { plan_slug: plan.slug });
        const licenseKey = keyData || `TOM-${new Date().getFullYear()}-XXXX-XXXX`;

        const now = new Date();
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + duration);

        const { data: license, error } = await supabase.from('user_licenses').insert({
            user_id: params.user_id,
            license_key: licenseKey,
            plan_id: params.plan_id,
            status: 'active',
            activation_date: now.toISOString(),
            expiry_date: expiry.toISOString(),
            tally_serial: params.tally_serial,
            company_gst: params.company_gst,
            company_pan: params.company_pan,
        }).select().single();

        if (error) return { success: false, error: error.message };

        await this.logActivity(params.user_id, 'license_created', 'license', license.id, licenseKey, {
            plan: plan.name,
            duration,
        });

        return { success: true, license };
    },
};

// ============================================================
// COUPON SERVICE
// ============================================================

export const couponService = {
    /**
     * Validate and apply coupon
     */
    async validate(code: string, userId: string, planId: string, amount: number): Promise<{
        valid: boolean;
        discount: number;
        final_amount: number;
        error?: string;
    }> {
        const { data: coupon } = await supabase
            .from('coupons')
            .select('*')
            .eq('code', code.toUpperCase())
            .eq('is_active', true)
            .single();

        if (!coupon) return { valid: false, discount: 0, final_amount: amount, error: 'Invalid coupon code' };

        // Check expiry
        if (coupon.expiry_date && new Date(coupon.expiry_date) < new Date()) {
            return { valid: false, discount: 0, final_amount: amount, error: 'Coupon has expired' };
        }

        // Check usage limit
        if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
            return { valid: false, discount: 0, final_amount: amount, error: 'Coupon usage limit reached' };
        }

        // Check per-user limit
        const { count } = await supabase
            .from('coupon_usage')
            .select('*', { count: 'exact', head: true })
            .eq('coupon_id', coupon.id)
            .eq('user_id', userId);

        if (count && count >= coupon.per_user_limit) {
            return { valid: false, discount: 0, final_amount: amount, error: 'You have already used this coupon' };
        }

        // Check min order
        if (amount < coupon.min_order) {
            return { valid: false, discount: 0, final_amount: amount, error: `Minimum order amount: ₹${coupon.min_order}` };
        }

        // Calculate discount
        let discount = 0;
        if (coupon.discount_type === 'flat') {
            discount = coupon.discount_value;
        } else {
            discount = (amount * coupon.discount_value) / 100;
            if (coupon.max_discount) {
                discount = Math.min(discount, coupon.max_discount);
            }
        }

        const finalAmount = Math.max(0, amount - discount);

        return { valid: true, discount, final_amount: finalAmount };
    },

    /**
     * Record coupon usage
     */
    async recordUsage(couponId: string, userId: string, orderAmount: number, discountAmount: number, licenseId?: string) {
        await supabase.from('coupon_usage').insert({
            coupon_id: couponId,
            user_id: userId,
            order_amount: orderAmount,
            discount_amount: discountAmount,
            license_id: licenseId,
        });

        // Increment used_count
        await supabase.rpc('increment_used_count', { coupon_id: couponId });
    },
};

// ============================================================
// ADMIN SERVICE
// ============================================================

export const adminService = {
    /**
     * Get dashboard stats
     */
    async getDashboardStats() {
        const { data } = await supabase.from('admin_dashboard_stats').select('*').single();
        return data;
    },

    /**
     * Get all users with licenses
     */
    async getUsers(params?: { search?: string; status?: string; page?: number; limit?: number }) {
        let query = supabase
            .from('user_licenses')
            .select('*, user:auth.users(id, email, raw_user_meta_data), plan:subscription_plans(name, slug)')
            .order('created_at', { ascending: false });

        if (params?.status) {
            query = query.eq('status', params.status);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    /**
     * Get all companies
     */
    async getCompanies(params?: { search?: string }) {
        let query = supabase
            .from('companies')
            .select('*')
            .order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    },

    /**
     * Get all payments
     */
    async getPayments(params?: { status?: string; page?: number }) {
        const { data } = await supabase
            .from('admin_recent_payments')
            .select('*')
            .order('created_at', { ascending: false });

        return data || [];
    },

    /**
     * Get activity logs
     */
    async getActivityLogs(params?: { action?: string; user_id?: string; limit?: number }) {
        let query = supabase
            .from('activity_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(params?.limit || 100);

        if (params?.action) query = query.eq('action', params.action);
        if (params?.user_id) query = query.eq('user_id', params.user_id);

        const { data } = await query;
        return data || [];
    },

    /**
     * Extend trial
     */
    async extendTrial(licenseId: string, days: number, reason: string, adminId: string) {
        const { data: license } = await supabase
            .from('user_licenses')
            .select('expiry_date')
            .eq('id', licenseId)
            .single();

        if (!license) return { success: false, error: 'License not found' };

        const newExpiry = new Date(license.expiry_date);
        newExpiry.setDate(newExpiry.getDate() + days);

        const { error } = await supabase
            .from('user_licenses')
            .update({ expiry_date: newExpiry.toISOString(), updated_at: new Date().toISOString() })
            .eq('id', licenseId);

        if (error) return { success: false, error: error.message };

        // Log
        await this.logActivity(adminId, 'trial_extended', 'license', licenseId, '', {
            days_added: days,
            new_expiry: newExpiry.toISOString(),
            reason,
        });

        return { success: true, new_expiry: newExpiry.toISOString() };
    },

    /**
     * Suspend user
     */
    async suspendUser(licenseId: string, reason: string, adminId: string) {
        const { error } = await supabase
            .from('user_licenses')
            .update({ status: 'suspended', updated_at: new Date().toISOString() })
            .eq('id', licenseId);

        if (error) return { success: false, error: error.message };

        await this.logActivity(adminId, 'user_suspended', 'license', licenseId, '', { reason });
        return { success: true };
    },

    /**
     * Block user
     */
    async blockUser(licenseId: string, reason: string, adminId: string) {
        const { error } = await supabase
            .from('user_licenses')
            .update({ status: 'blocked', updated_at: new Date().toISOString() })
            .eq('id', licenseId);

        if (error) return { success: false, error: error.message };

        await this.logActivity(adminId, 'user_blocked', 'license', licenseId, '', { reason });
        return { success: true };
    },

    /**
     * Create subscription plan
     */
    async createPlan(params: {
        name: string;
        slug: string;
        duration_days: number;
        price: number;
        gst_percent?: number;
        features?: string[];
        is_trial?: boolean;
    }) {
        const { data, error } = await supabase.from('subscription_plans').insert({
            name: params.name,
            slug: params.slug,
            duration_days: params.duration_days,
            price: params.price,
            gst_percent: params.gst_percent || 18,
            features: params.features || [],
            is_trial: params.is_trial || false,
        }).select().single();

        return { data, error };
    },

    /**
     * Create coupon
     */
    async createCoupon(params: {
        code: string;
        description?: string;
        discount_type: 'flat' | 'percentage';
        discount_value: number;
        max_discount?: number;
        min_order?: number;
        usage_limit?: number;
        per_user_limit?: number;
        expiry_date?: string;
        created_by?: string;
    }) {
        const { data, error } = await supabase.from('coupons').insert({
            code: params.code.toUpperCase(),
            description: params.description,
            discount_type: params.discount_type,
            discount_value: params.discount_value,
            max_discount: params.max_discount,
            min_order: params.min_order || 0,
            usage_limit: params.usage_limit,
            per_user_limit: params.per_user_limit || 1,
            expiry_date: params.expiry_date,
            created_by: params.created_by,
        }).select().single();

        return { data, error };
    },

    /**
     * Log activity
     */
    async logActivity(userId: string, action: string, entityType?: string, entityId?: string, entityName?: string, details?: any) {
        await supabase.from('activity_logs').insert({
            user_id: userId,
            action,
            entity_type: entityType,
            entity_id: entityId,
            entity_name: entityName,
            details: details || {},
        });
    },
};

// ============================================================
// PAYMENT SERVICE
// ============================================================

export const paymentService = {
    /**
     * Create payment record
     */
    async create(params: {
        user_id: string;
        plan_id: string;
        amount: number;
        coupon_id?: string;
        discount_amount?: number;
        payment_method?: string;
    }) {
        const { data: plan } = await supabase
            .from('subscription_plans')
            .select('*')
            .eq('id', params.plan_id)
            .single();

        if (!plan) return { success: false, error: 'Plan not found' };

        const gstAmount = (params.amount * (plan.gst_percent || 18)) / 100;
        const totalAmount = params.amount + gstAmount - (params.discount_amount || 0);
        const invoiceNum = `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

        const { data, error } = await supabase.from('payments').insert({
            user_id: params.user_id,
            plan_id: params.plan_id,
            coupon_id: params.coupon_id,
            amount: params.amount,
            gst_amount: gstAmount,
            discount_amount: params.discount_amount || 0,
            total_amount: totalAmount,
            payment_method: params.payment_method,
            invoice_number: invoiceNum,
            status: 'pending',
        }).select().single();

        if (error) return { success: false, error: error.message };
        return { success: true, payment: data };
    },

    /**
     * Mark payment as paid
     */
    async markPaid(paymentId: string, gatewayTransactionId?: string) {
        const { data: payment, error } = await supabase
            .from('payments')
            .update({
                status: 'paid',
                gateway_transaction_id: gatewayTransactionId,
                paid_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('id', paymentId)
            .select()
            .single();

        if (error) return { success: false, error: error.message };

        // Create/update license
        if (payment.plan_id && payment.user_id) {
            await licenseService.createLicense({
                user_id: payment.user_id,
                plan_id: payment.plan_id,
            });
        }

        return { success: true, payment };
    },

    /**
     * Get user payments
     */
    async getUserPayments(userId: string) {
        const { data } = await supabase
            .from('payments')
            .select('*, plan:subscription_plans(name)')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        return data || [];
    },
};

// ============================================================
// LEAD / CRM SERVICE
// ============================================================

export const leadService = {
    async create(params: {
        name: string;
        email?: string;
        mobile?: string;
        company_name?: string;
        tally_serial?: string;
        source?: string;
        assigned_to?: string;
        notes?: string;
    }) {
        const { data, error } = await supabase.from('sales_leads').insert({
            name: params.name,
            email: params.email,
            mobile: params.mobile,
            company_name: params.company_name,
            tally_serial: params.tally_serial,
            source: params.source || 'manual',
            assigned_to: params.assigned_to,
            notes: params.notes,
        }).select().single();

        return { data, error };
    },

    async updateStatus(leadId: string, status: string, notes?: string) {
        const updates: any = { status, updated_at: new Date().toISOString() };
        if (status === 'converted') updates.converted_at = new Date().toISOString();

        const { error } = await supabase.from('sales_leads').update(updates).eq('id', leadId);
        if (error) return { success: false, error: error.message };

        if (notes) {
            await supabase.from('lead_followups').insert({
                lead_id: leadId,
                note: notes,
                followup_type: 'note',
            });
        }

        return { success: true };
    },

    async getLeads(params?: { status?: string; assigned_to?: string }) {
        let query = supabase.from('sales_leads').select('*').order('created_at', { ascending: false });
        if (params?.status) query = query.eq('status', params.status);
        if (params?.assigned_to) query = query.eq('assigned_to', params.assigned_to);

        const { data } = await query;
        return data || [];
    },

    async addFollowup(leadId: string, userId: string, note: string, type: string = 'note', nextFollowup?: string) {
        const { error } = await supabase.from('lead_followups').insert({
            lead_id: leadId,
            user_id: userId,
            note,
            followup_type: type,
            next_followup: nextFollowup,
        });

        return { success: !error, error: error?.message };
    },
};

// ============================================================
// ROLE PERMISSIONS
// ============================================================

export const roleService = {
    async getRoles() {
        const { data } = await supabase.from('user_roles').select('*').order('name');
        return data || [];
    },

    async hasPermission(userId: string, permission: string): Promise<boolean> {
        // Check if user has super_admin license
        const { data } = await supabase
            .from('user_licenses')
            .select('license_key')
            .eq('user_id', userId)
            .eq('status', 'active')
            .like('license_key', 'TOM-SUPER%')
            .limit(1);

        if (data && data.length > 0) return true;
        return false;
    },
};
