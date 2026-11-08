import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Clock, CreditCard, RefreshCw, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useLicenseGate } from '@/contexts/LicenseGateContext';
import { formatPlanPrice } from '@/config/subscriptionPlans';
import { useSubscriptionCatalog } from '@/hooks/useSubscriptionCatalog';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/insforge';
import { useAuth } from '@/contexts/AuthContext';
import './SubscriptionPage.css';

export default function SubscriptionPage() {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { license, isLoading, licenseError, refresh } = useLicenseGate();
    const { user } = useAuth() as any;
    const catalog = useSubscriptionCatalog();
    const plans = catalog.data || [];
    const [couponInput, setCouponInput] = useState('');
    const [appliedCode, setAppliedCode] = useState('');
    const [refreshing, setRefreshing] = useState(false);
    const [refreshError, setRefreshError] = useState('');
    const [checkoutBusy,setCheckoutBusy]=useState(false);
    const [checkoutError,setCheckoutError]=useState('');
    const checkoutRequest=useRef<{key:string;id:string}|null>(null);
    const apiBase=String(import.meta.env.VITE_SUBSCRIPTION_API_URL || '').replace(/\/$/,'');
    const availability=useQuery({ queryKey:['checkout-availability',apiBase], queryFn:async()=>{
        const response=await fetch(apiBase+'/api/v1/subscriptions/availability',{cache:'no-store',signal:AbortSignal.timeout(10000)});
        if(!response.ok) throw new Error('Checkout unavailable');
        return response.json() as Promise<{enabled:boolean;testMode?:boolean}>;
    },retry:1,refetchInterval:30000 });
    const testRestricted = Boolean(availability.data?.testMode && !license.isAdmin);
    const paymentLabel = availability.isLoading ? 'Checking payments…' : availability.isError ? 'Payment connection failed' : testRestricted ? 'Live payments not enabled' : availability.data?.enabled ? (availability.data.testMode ? 'Continue to test payment' : 'Continue to payment') : 'Payment unavailable';
    const subscriptionRequest=async(path:string,body?:unknown)=>{
        const {data:{session}}=await supabase.auth.getSession();
        if(!session) throw new Error('Please sign in to continue.');
        const response=await fetch(apiBase+'/api/v1/subscriptions'+path, {method:body?'POST':'GET',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
        const data=await response.json();
        if(!response.ok) { if(response.status===409) checkoutRequest.current=null; throw new Error(data.error || 'Payment verification unavailable. Please retry.'); }
        return data;
    };
    const beginCheckout=async()=>{
        if(!selectedPlan || checkoutBusy) return;
        setCheckoutBusy(true);setCheckoutError('');
        try {
            const key=JSON.stringify([user?.id,selectedSlug,appliedCode]);
            if(checkoutRequest.current?.key!==key) checkoutRequest.current={key,id:crypto.randomUUID()};
            const result=await subscriptionRequest('/checkout',{planSlug:selectedSlug,couponCode:appliedCode || null,requestId:checkoutRequest.current.id});
            if(result.status==='paid') { await refresh();return; }
            const url=new URL(result.checkoutUrl);
            if(url.protocol!=='https:' || url.hostname!=='rzp.io') throw new Error('Invalid payment destination');
            window.localStorage.setItem('syncora-pending-checkout:'+user.id,result.orderId);
            window.location.assign(url.toString());
        } catch(error) { setCheckoutError(error instanceof Error?error.message:'Could not start checkout'); }
        finally { setCheckoutBusy(false); }
    };
    useEffect(()=>{
        if(!user?.id) return;
        const order=searchParams.get('checkout') || window.localStorage.getItem('syncora-pending-checkout:'+user.id);
        if(!order) return;
        let disposed=false;let inFlight=false;let timer:number|undefined;
        const verify=async()=>{if(inFlight)return;inFlight=true;try {
            const result=await subscriptionRequest('/checkout/'+encodeURIComponent(order));
            if(disposed) return;
            if(result.status==='paid') { window.clearInterval(timer);window.localStorage.removeItem('syncora-pending-checkout:'+user.id);setCheckoutError('');await refresh(); }
            else { setCheckoutError(result.status==='pending'?'Payment is awaiting confirmation. It will be checked again automatically.':'This checkout has ended. Please choose a plan again.');
                if(result.status!=='pending'){window.clearInterval(timer);window.localStorage.removeItem('syncora-pending-checkout:'+user.id);checkoutRequest.current=null;}
            }
        } catch(error) {if(!disposed)setCheckoutError(error instanceof Error?error.message:'Could not verify payment');}finally{inFlight=false;}};
        void verify();timer=window.setInterval(()=>void verify(),10000);
        return()=>{disposed=true;window.clearInterval(timer);};
    },[user?.id,searchParams.get('checkout')]);
    const dialogRef = useRef<HTMLDialogElement>(null);
    const selectedSlug = searchParams.get('plan');
    const selectedPlan = plans.find(plan => plan.id === selectedSlug);
    const quote = useQuery({
        queryKey: ['subscription-quote', selectedSlug, appliedCode, user?.id],
        queryFn: async () => {
            const { data, error } = await supabase.rpc('quote_subscription_plan', {
                p_plan_slug: selectedSlug, p_coupon_code: appliedCode || null,
            });
            if (error) throw error;
            return data as { valid: boolean; error?: string; price: number; discount: number; final_amount: number; coupon_code?: string };
        },
        enabled: !!selectedPlan,
        refetchInterval: 5000,
        staleTime: 0,
    });
    const validQuote = quote.data?.valid && !quote.isFetching && !quote.isError ? quote.data : null;

    useEffect(() => { setCouponInput(''); setAppliedCode(''); }, [selectedSlug, user?.id]);
    const active = license.status === 'active' || license.status === 'trial';

    useEffect(() => {
        const dialog = dialogRef.current;
        if (selectedPlan && !dialog?.open) dialog?.showModal();
        if (!selectedPlan && dialog?.open) dialog.close();
    }, [selectedPlan?.id]);

    const closeDetails = () => {
        if (!searchParams.has('plan')) return;
        const next = new URLSearchParams(searchParams);
        next.delete('plan');
        setSearchParams(next, { replace: true });
    };

    const checkStatus = async () => {
        setRefreshing(true);
        setRefreshError('');
        try { await refresh(); }
        catch { setRefreshError('Could not refresh your subscription. Please try again.'); }
        finally { setRefreshing(false); }
    };

    return (
        <main className="subscription-page">
            <div className="subscription-wrap">
                <header className="subscription-nav">
                    <button type="button" onClick={() => navigate('/dashboard')} className="subscription-back"><ArrowLeft size={18} /> Back to app</button>
                    <span className="subscription-brand">SYNCORA<span> / PLANS</span></span>
                </header>

                <section className="subscription-heading">
                    <span className="subscription-eyebrow"><Sparkles size={14} /> YOUR BUSINESS, CONNECTED</span>
                    <h1>Your Tally.<br /><span>Always within reach.</span></h1>
                    <p>Choose how long you want to stay connected.<br className="hidden sm:block" /> Three simple plans. One place to manage your subscription.</p>
                </section>

                <section aria-label="Current subscription" className="subscription-status">
                    <div className="subscription-status-icon"><ShieldCheck size={22} /></div>
                    <div className="subscription-status-copy">
                        <p>{isLoading ? 'Checking subscription…' : licenseError || (active ? license.planName || 'Active subscription' : license.status === 'expired' ? 'Your subscription has expired' : license.status === 'blocked' ? 'Account blocked — contact support' : license.status === 'suspended' ? 'Account suspended — contact support' : 'Find the right plan for your business')}</p>
                        {!isLoading && active && license.expiryDate
                            ? <span>Valid until {new Date(license.expiryDate).toLocaleDateString('en-IN')}</span>
                            : <span>Monthly, six months or a full year — the choice is yours.</span>}
                    </div>
                    <button type="button" onClick={checkStatus} disabled={refreshing || isLoading} aria-label="Refresh subscription" className="subscription-refresh"><RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} /></button>
                </section>
                {refreshError && <p role="alert">{refreshError}</p>}
                {checkoutError && <p role="status" className="subscription-catalog-message">{checkoutError}</p>}

                {catalog.isLoading && <p role="status" className="subscription-catalog-message">Loading current plans…</p>}
                {catalog.isError && <p role="alert" className="subscription-catalog-message">Current prices could not be loaded. <button type="button" onClick={() => void catalog.refetch()}>Try again</button></p>}
                {!catalog.isLoading && !catalog.isError && plans.length === 0 && <p role="status" className="subscription-catalog-message">No plans are available right now. Please check again later.</p>}
                {!catalog.isLoading && selectedSlug && !selectedPlan && <p role="status" className="subscription-catalog-message">The selected plan is no longer available. Please choose another plan.</p>}
                <section className="subscription-plans" aria-label="Subscription plans">
                    {plans.map(plan => (
                        <article key={plan.id} className={`subscription-card ${plan.id === 'half_yearly' ? 'subscription-card-featured' : ''}`}>
                            <div className="subscription-card-top">
                                <span className="subscription-plan-icon">{plan.id === 'yearly' ? <Sparkles size={21} /> : <Clock size={21} />}</span>
                                {plan.badge && <span className="subscription-badge">{plan.badge}</span>}
                            </div>
                            <h2>{plan.title}</h2>
                            <p className="subscription-description">Stay connected for {plan.period}.</p>
                            <div className="subscription-price">{formatPlanPrice(plan.price)}<span> / {plan.period}</span></div>
                            <p className="subscription-billing">One payment for {plan.period}</p>
                            <div className="subscription-divider" />
                            <ul>
                                <li><Check size={16} /> {plan.period} of subscription access</li>
                                {(plan.features.length ? plan.features : ['Tally on mobile and web', 'Manage your plan in this app']).map(feature => <li key={feature}><Check size={16} /> {feature}</li>)}
                            </ul>
                            <button type="button" className="subscription-buy" onClick={() => {
                                const next = new URLSearchParams(searchParams);
                                next.set('plan', plan.id);
                                setSearchParams(next);
                            }} aria-label={`Buy ${plan.title} plan for ${formatPlanPrice(plan.price)}`}>
                                Buy Now <ArrowRight size={17} />
                            </button>
                        </article>
                    ))}
                </section>

                <aside className="subscription-note"><CreditCard size={18} /><p><strong>{availability.data?.enabled ? 'Secure online payment.' : 'Online payments are being configured.'}</strong> Your subscription activates only after payment is verified.</p></aside>
                <footer className="subscription-footer"><span>Need a hand choosing?</span><Link to="/support">Get in touch <ArrowRight size={14} /></Link></footer>
            </div>

            <dialog ref={dialogRef} className="subscription-dialog" onClose={closeDetails} onClick={event => { if (event.target === event.currentTarget) dialogRef.current?.close(); }} aria-labelledby="plan-details-title">
                {selectedPlan && <div className="subscription-dialog-content">
                    <button type="button" autoFocus className="subscription-dialog-close" onClick={() => dialogRef.current?.close()} aria-label="Close plan details"><X size={20} /></button>
                    <span className="subscription-eyebrow">YOUR SELECTED PLAN</span>
                    <h2 id="plan-details-title">{selectedPlan.title}</h2>
                    <p className="subscription-dialog-intro">Subscription for {selectedPlan.period}</p>
                    <form className="subscription-coupon" onSubmit={event => {
                        event.preventDefault();
                        const code = couponInput.trim().toUpperCase();
                        if (!code) return;
                        if (appliedCode === code) void quote.refetch();
                        else setAppliedCode(code);
                    }}>
                        <label htmlFor="subscription-coupon-code">Have a coupon?</label>
                        <div><input id="subscription-coupon-code" maxLength={80} value={couponInput} placeholder="Enter coupon code" autoComplete="off" onChange={event => { setCouponInput(event.target.value.toUpperCase()); setAppliedCode(''); }} />
                        <button type="submit" disabled={!couponInput.trim() || quote.isFetching}>Apply</button></div>
                    </form>
                    {appliedCode && quote.isFetching && <p role="status" className="subscription-coupon-message">Checking coupon…</p>}
                    {quote.isError && <p role="alert" className="subscription-coupon-message">Could not verify the price or coupon. Please try again.</p>}
                    {!quote.isFetching && quote.data && !quote.data.valid && <p role="alert" className="subscription-coupon-message">{quote.data.error}</p>}
                    {validQuote?.coupon_code && <p role="status" className="subscription-coupon-message">{validQuote.coupon_code} applied. <button type="button" onClick={() => { setCouponInput(''); setAppliedCode(''); }}>Remove</button></p>}
                    <div className="subscription-summary"><span>Plan price</span><strong>{formatPlanPrice(validQuote?.price ?? selectedPlan.price)}</strong></div>
                    {validQuote && validQuote.discount > 0 && <div className="subscription-total"><span>Coupon discount</span><span>−{formatPlanPrice(validQuote.discount)}</span></div>}
                    <div className="subscription-total"><strong>After discount</strong><strong>{formatPlanPrice(validQuote?.final_amount ?? selectedPlan.price)}</strong></div>
                    <p className="subscription-coupon-message">The final payable amount is verified by the server when checkout starts.</p>
                    {availability.isLoading && <p role="status">Checking payment availability…</p>}
                    {availability.isError && <p role="alert">Could not connect to payments. <button type="button" onClick={()=>void availability.refetch()} className="underline">Retry</button></p>}
                    {!availability.isLoading && !availability.isError && !availability.data?.enabled && <p role="status" className="subscription-unavailable">Online payments are not configured yet. Contact support to activate a plan.</p>}
                    {availability.data?.testMode && <p role="status">{testRestricted ? 'Payments are currently being tested. Contact support for activation.' : 'Test mode: no real money will be charged.'}</p>}
                    {checkoutError && <p role="alert">{checkoutError}</p>}
                    <button type="button" onClick={()=>void beginCheckout()} disabled={!availability.data?.enabled || testRestricted || !validQuote || checkoutBusy || !user?.id} className="subscription-buy"><CreditCard size={17} /> {checkoutBusy ? 'Preparing checkout…' : paymentLabel}</button>
                    <button type="button" className="subscription-change" onClick={() => dialogRef.current?.close()}>Compare other plans</button>
                </div>}
            </dialog>
        </main>
    );
}
