const crypto = require('crypto');
const { SubscriptionPayments, verifyWebhook } = require('./subscriptionPayments');
const env = { RAZORPAY_KEY_ID:'rzp_test_test123', RAZORPAY_KEY_SECRET:'secret-test-123', RAZORPAY_WEBHOOK_SECRET:'webhook-test-123' };
test.each([false,true])('production test payments require a verified administrator (%s)',async isAdmin=>{
    const db={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{is_admin:isAdmin,is_active:true}})})})})};
    const service=new SubscriptionPayments({db,env:{...env,VERCEL_ENV:'production'}});
    if(isAdmin) await expect(service.assertPaymentMode('user-a')).resolves.toBeUndefined();
    else await expect(service.assertPaymentMode('user-a')).rejects.toMatchObject({status:403});
});
test('live keys do not apply the test-only administrator restriction',async()=>{
    const service=new SubscriptionPayments({db:{},env:{...env,RAZORPAY_KEY_ID:'rzp_live_test123',VERCEL_ENV:'production'}});
    await expect(service.assertPaymentMode('user-a')).resolves.toBeUndefined();
});
const order = { id:'11111111-1111-4111-8111-111111111111',user_id:'user-a',gateway_link_id:'plink_test',amount_paise:15900,status:'pending' };
const link = { id:'plink_test',status:'paid',amount:15900,amount_paid:15900,currency:'INR',reference_id:order.id,notes:{subscription_order_id:order.id},order_id:'order_test',payments:[{status:'captured',payment_id:'pay_test'}] };
const payment = { id:'pay_test',status:'captured',captured:true,amount:15900,currency:'INR',amount_refunded:0,order_id:'order_test' };
function fixture(linkChange={}, paymentChange={}) {
    const db={rpc:jest.fn().mockResolvedValue({data:{success:true}})};
    const fetchImpl=jest.fn(async url=>({ok:true,json:async()=>url.includes('/payment_links/')?{...link,...linkChange}:{...payment,...paymentChange}}));
    return {db,fetchImpl,service:new SubscriptionPayments({db,fetchImpl,env})};
}
test('signature uses exact original bytes and rejects reserialized JSON',()=>{
    const raw=Buffer.from('{ "event" : "payment_link.paid" }');
    const sig=crypto.createHmac('sha256',env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest('hex');
    expect(verifyWebhook(raw,sig,env.RAZORPAY_WEBHOOK_SECRET).event).toBe('payment_link.paid');
    expect(()=>verifyWebhook(Buffer.from(JSON.stringify(JSON.parse(raw))),sig,env.RAZORPAY_WEBHOOK_SECRET)).toThrow('Invalid webhook');
    expect(()=>verifyWebhook(raw,sig,'')).toThrow('not configured');
    expect(()=>verifyWebhook(raw,'x',env.RAZORPAY_WEBHOOK_SECRET)).toThrow('Invalid webhook');
});
test('captured, matching payment finalizes the saved order',async()=>{
    const {service,db}=fixture();
    expect(await service.reconcile(order)).toEqual({status:'paid',orderId:order.id});
    expect(db.rpc).toHaveBeenCalledWith('finalize_subscription_payment',expect.objectContaining({p_order_id:order.id,p_amount_paise:15900,p_payment_id:'pay_test'}));
});
test.each([
    [{amount:100},{}], [{currency:'USD'},{}], [{amount_paid:100},{}], [{reference_id:'other'},{}],
    [{notes:{subscription_order_id:'other'}},{}], [{},{status:'authorized',captured:false}],
    [{},{amount:100}], [{},{currency:'USD'}], [{},{order_id:'order_other'}], [{},{amount_refunded:100}]
])('mismatched, partial, uncaptured or refunded payment never grants access (%j,%j)',async(l,p)=>{
    const {service,db}=fixture(l,p);
    await expect(service.reconcile(order)).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
});
test('pending and already finalized orders do not activate twice',async()=>{
    const {service,db}=fixture({status:'created'});
    expect((await service.reconcile(order)).status).toBe('pending');
    expect((await service.reconcile({...order,status:'paid'})).status).toBe('paid');
    expect(db.rpc).not.toHaveBeenCalled();
});
test('database activation failure is retryable and never acknowledged as success',async()=>{
    const {service,db}=fixture();db.rpc.mockResolvedValue({error:{message:'transaction failed'}});
    await expect(service.reconcile(order)).rejects.toMatchObject({status:503});
});

test.each(['expired','cancelled'])('ended checkout reports %s without activating a license',async status=>{
    const {service,db}=fixture({status});
    expect(await service.reconcile(order)).toEqual({status,orderId:order.id});
    expect(db.rpc).not.toHaveBeenCalled();
});

test.each([
    [[{status:'failed',order_id:'order_test'}],'failed'],
    [[{status:'failed',order_id:'order_test'},{status:'authorized',order_id:'order_test'}],'pending'],
    [[{status:'failed',order_id:'different_order'}],'pending'],
    [[], 'pending'],
])('failed attempt is checked against gateway evidence (%j)',async(items,status)=>{
    const db={rpc:jest.fn()};
    const fetchImpl=jest.fn(async url=>({ok:true,json:async()=>url.includes('/payment_links/')?{...link,status:'created'}:{items}}));
    const service=new SubscriptionPayments({db,fetchImpl,env});
    expect(await service.reconcile(order)).toEqual({status,orderId:order.id});
    expect(db.rpc).not.toHaveBeenCalled();
});
test('placeholder credentials fail closed before creating any checkout',async()=>{
    const userClient=jest.fn();const service=new SubscriptionPayments({db:{},userClient,env:{...env,RAZORPAY_KEY_SECRET:'your_secret_here'}});
    await expect(service.create({id:'user-a'},'token',{planSlug:'monthly',requestId:order.id,amount:1})).rejects.toMatchObject({status:503});
    expect(userClient).not.toHaveBeenCalled();
});
test('browser amount and user id are excluded from the authoritative quote request',async()=>{
    const saved={...order,plan_slug:'monthly',checkout_url:'https://rzp.io/test',expires_at:new Date(Date.now()+60000).toISOString()};
    const rpc=jest.fn().mockResolvedValue({data:saved});const service=new SubscriptionPayments({db:{},userClient:()=>({rpc}),env});
    await service.create({id:'user-a'},'token',{planSlug:'monthly',requestId:order.id,amount:1,userId:'victim'});
    expect(rpc).toHaveBeenCalledWith('create_subscription_order',{p_plan_slug:'monthly',p_coupon_code:null,p_request_id:order.id});
});
test('a different user cannot access an existing checkout',async()=>{
    const rpc=jest.fn().mockResolvedValue({data:{...order,user_id:'victim'}});
    const service=new SubscriptionPayments({db:{},userClient:()=>({rpc}),env});
    await expect(service.create({id:'attacker'},'token',{planSlug:'monthly',requestId:order.id})).rejects.toMatchObject({status:404});
});
