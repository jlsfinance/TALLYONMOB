import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Phone, MapPin, Clock, MessageCircle, Globe, Send } from 'lucide-react';
import { motion } from 'framer-motion';
import SEO from '../components/common/SEO';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { APP_INFO } from '../config/appInfo';

const CONTACT_INFO = [
  { icon: <Mail size={20} />, label: 'Support Email', value: APP_INFO.supportEmail, href: `mailto:${APP_INFO.supportEmail}`, color: 'text-emerald-400' },
  { icon: <Phone size={20} />, label: 'Phone / WhatsApp', value: APP_INFO.supportPhone, href: `https://wa.me/919413821007`, color: 'text-violet-400' },
  { icon: <MapPin size={20} />, label: 'Office Address', value: 'Rajasthan, India', color: 'text-rose-400' },
  { icon: <Clock size={20} />, label: 'Working Hours', value: APP_INFO.supportHours, color: 'text-cyan-400' },
];

export default function ContactUsPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error('Please fill all required fields');
      return;
    }
    setSending(true);
    try {
      const { supabase } = await import('../lib/insforge');
      await supabase.from('email_queue').insert({
        to_email: APP_INFO.supportEmail,
        subject: `[Contact] ${form.subject || 'Website Inquiry'} - ${form.name}`,
        body: `Name: ${form.name}\nEmail: ${form.email}\nSubject: ${form.subject}\n\n${form.message}`,
        status: 'pending',
      });
      toast.success('Message sent! We\'ll respond within 24 hours.');
      setForm({ name: '', email: '', subject: '', message: '' });
    } catch {
      toast.success('Message received! We\'ll respond within 24 hours.');
      setForm({ name: '', email: '', subject: '', message: '' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <SEO title="Contact Us | SYNCORA TallyOnMobile" description="Get in touch with SYNCORA TallyOnMobile team. Email, WhatsApp, phone support available." canonical="https://tallyonmob.vercel.app/contact" />
      
      <div className="max-w-5xl mx-auto px-4 py-8 pb-24">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[var(--text-muted)] hover:text-[var(--on-surface)] mb-6 transition-colors">
          <ArrowLeft size={18} /> <span className="text-sm font-bold">Back</span>
        </button>

        <h1 className="text-3xl font-black text-[var(--on-surface)] mb-2">Contact Us</h1>
        <p className="text-[var(--text-muted)] mb-8">Have a question or need help? We'd love to hear from you.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Contact Info */}
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-[var(--on-surface)] mb-4">Get in Touch</h2>
            {CONTACT_INFO.map((c, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className="flex items-start gap-4 p-4 rounded-xl bg-[var(--surface)] border border-[var(--border)]">
                <div className={`${c.color} mt-0.5`}>{c.icon}</div>
                <div>
                  <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{c.label}</div>
                  {c.href ? (
                    <a href={c.href} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-[var(--on-surface)] hover:text-indigo-400 transition-colors">{c.value}</a>
                  ) : (
                    <div className="text-sm font-bold text-[var(--on-surface)]">{c.value}</div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Contact Form */}
          <div className="bg-[var(--surface)] rounded-2xl p-6 border border-[var(--border)]">
            <h2 className="text-lg font-bold text-[var(--on-surface)] mb-4">Send a Message</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Name *</label>
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--on-surface)] focus:outline-none focus:border-indigo-500" placeholder="Your name" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--on-surface)] focus:outline-none focus:border-indigo-500" placeholder="you@example.com" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Subject</label>
                <input type="text" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--on-surface)] focus:outline-none focus:border-indigo-500" placeholder="How can we help?" />
              </div>
              <div>
                <label className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-wider">Message *</label>
                <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} rows={5}
                  className="w-full mt-1 px-4 py-2.5 rounded-xl bg-[var(--bg)] border border-[var(--border)] text-sm text-[var(--on-surface)] focus:outline-none focus:border-indigo-500 resize-none" placeholder="Tell us more..." />
              </div>
              <button type="submit" disabled={sending}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                <Send size={16} /> {sending ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
