import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

const inputClass = 'mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2.5';
const actionClass = 'rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50';

export default function WhatsAppSettingsPage() {
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [pending, setPending] = useState(false);
    const [message, setMessage] = useState('');
    const [failed, setFailed] = useState(false);

    async function updateLink(action: 'confirm' | 'unlink') {
        setPending(true);
        setMessage('');
        setFailed(false);
        try {
            const { data: { session }, error: authError } = await supabase.auth.getSession();
            if (authError || !session) throw new Error('Sign in to SYNCORA first.');

            const url = String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/, '');
            const response = await fetch(`${url}/functions/v1/whatsapp-bot/link`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${session.access_token}`,
                    apikey: String(import.meta.env.VITE_SUPABASE_ANON_KEY),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(action === 'confirm'
                    ? { action, phone: phone.replace(/[\s()-]/g, ''), code }
                    : { action }),
            });
            const result = await response.json().catch(() => null);
            if (!response.ok || !result?.ok) {
                throw new Error(result?.error ?? 'Could not update WhatsApp access. Please try again.');
            }
            setCode('');
            setPhone('');
            setMessage(action === 'confirm'
                ? 'WhatsApp linked. Return to the chat and send COMPANIES or ask for a report.'
                : 'All WhatsApp numbers linked to your SYNCORA account have been disconnected.');
        } catch (error) {
            setFailed(true);
            setMessage(error instanceof Error ? error.message : 'Could not update WhatsApp access.');
        } finally {
            setPending(false);
        }
    }

    function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void updateLink('confirm');
    }

    return (
        <section className="mx-auto max-w-lg space-y-5 p-4 text-[var(--on-surface)]">
            <Link to="/settings" className="text-sm text-[var(--primary)]">Back to settings</Link>
            <h1 className="text-2xl font-bold">WhatsApp Bot</h1>
            <p className="text-sm text-[var(--text-muted)]">
                Send <strong>LINK</strong> to the SYNCORA bot from your own WhatsApp number. Enter that number
                and the code from your chat to give it access to reports for companies you own.
            </p>
            <form onSubmit={submit} className="space-y-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <label className="block text-sm font-medium">
                    WhatsApp number with country code
                    <input className={inputClass} type="tel" autoComplete="tel" value={phone}
                        onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" maxLength={24} required />
                </label>
                <label className="block text-sm font-medium">
                    One-time code
                    <input className={inputClass} type="text" autoComplete="off" autoCapitalize="none"
                        spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)}
                        maxLength={32} required />
                </label>
                <button type="submit" disabled={pending} className={`${actionClass} bg-[var(--primary)] text-white`}>
                    Link WhatsApp
                </button>
            </form>
            <button type="button" disabled={pending} onClick={() => void updateLink('unlink')}
                className={`${actionClass} border border-[var(--border)]`}>
                Disconnect all WhatsApp numbers
            </button>
            {message && <p role={failed ? 'alert' : 'status'} className="text-sm">{message}</p>}
        </section>
    );
}
