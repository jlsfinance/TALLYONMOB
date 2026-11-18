import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const action = 'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50';

export default function TelegramSettingsPage() {
    const [command, setCommand] = useState('');
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    const [failed, setFailed] = useState(false);

    async function updateLink(operation: 'create' | 'unlink') {
        setPending(true);
        setMessage('');
        setFailed(false);
        setCommand('');
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error || !session) throw new Error('Sign in to SYNCORA first.');

            const url = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '');
            const response = await fetch(`${url}/functions/v1/telegram-report-bot/link`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ action: operation }),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.ok) throw new Error(result?.error ?? 'Could not update Telegram access.');
            if (operation === 'create') {
                setCommand(result.command);
            } else {
                setMessage('Telegram report access has been disconnected.');
            }
        } catch (error) {
            setFailed(true);
            setMessage(error instanceof Error ? error.message : 'Could not update Telegram access.');
        } finally {
            setPending(false);
        }
    }

    async function copyCommand() {
        try {
            await navigator.clipboard.writeText(command);
            setFailed(false);
            setMessage('Link command copied.');
        } catch {
            setFailed(true);
            setMessage('Select and copy the command manually.');
        }
    }

    return (
        <section className="mx-auto max-w-lg space-y-5 p-4 text-[var(--on-surface)]">
            <Link to="/settings" className="text-sm text-[var(--primary)]">Back to settings</Link>
            <h1 className="text-2xl font-bold">Telegram Bot</h1>
            <p className="text-sm text-[var(--text-muted)]">
                Generate a one-time command and paste it into your private chat with the SYNCORA Telegram report bot
                to view reports for companies you own.
            </p>
            <div className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <button type="button" disabled={pending} onClick={() => void updateLink('create')}
                    className={`${action} bg-[var(--primary)] text-white`}>
                    Generate link command
                </button>
                {command && (
                    <div className="space-y-2">
                        <p className="text-sm">This command expires in 10 minutes. Keep it private.</p>
                        <code className="block break-all rounded-lg bg-[var(--surface-container)] p-2 text-sm">{command}</code>
                        <button type="button" onClick={() => void copyCommand()}
                            className={`${action} border border-[var(--border)]`}>Copy command</button>
                    </div>
                )}
            </div>
            <button type="button" disabled={pending} onClick={() => void updateLink('unlink')}
                className={`${action} border border-[var(--border)]`}>
                Disconnect Telegram report access
            </button>
            {message && <p role={failed ? 'alert' : 'status'} className="text-sm">{message}</p>}
        </section>
    );
}
