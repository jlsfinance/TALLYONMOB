import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function AuthCallback() {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            try {
                // Get the session from the URL hash
                const { data: { user }, error } = await supabase.auth.getCurrentUser();

                if (error) {
                    console.error('Auth callback error:', error);
                    navigate('/login');
                    return;
                }

                if (user) {
                    // Successfully authenticated, redirect to dashboard
                    navigate('/');
                } else {
                    // No session, redirect to login
                    navigate('/login');
                }
            } catch (error) {
                console.error('Auth callback error:', error);
                navigate('/login');
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <div className="min-h-screen bg-[var(--surface)] flex items-center justify-center">
            <div className="text-center">
                <div className="w-16 h-16 border-4 border-[var(--primary)] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-[var(--on-surface)] font-medium">Authenticating...</p>
                <p className="text-[var(--text-muted)] text-sm mt-2">Please wait while we verify your identity.</p>
            </div>
        </div>
    );
}
