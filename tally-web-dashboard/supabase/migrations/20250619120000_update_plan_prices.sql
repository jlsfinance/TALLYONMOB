-- Update subscription plan prices: ₹99/month, ₹999/year
DO $$ BEGIN
    UPDATE subscription_plans SET price_monthly = 99, price_yearly = 999 WHERE slug = 'monthly';
    UPDATE subscription_plans SET price_monthly = 249, price_yearly = 747 WHERE slug = 'quarterly';
    UPDATE subscription_plans SET price_monthly = 499, price_yearly = 499 WHERE slug = 'half_yearly';
    UPDATE subscription_plans SET price_monthly = 999, price_yearly = 999 WHERE slug = 'yearly';
    UPDATE subscription_plans SET price_monthly = 4999, price_yearly = 4999 WHERE slug = 'lifetime';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
