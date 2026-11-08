jest.mock('../config/supabaseIdentity',()=>({supabaseIdentity:{auth:{getUser:jest.fn()}}}));
const express=require('express');
const request=require('supertest');
const {supabaseIdentity:db}=require('../config/supabaseIdentity');
const {subscriptionRoutes,subscriptionPayments}=require('./subscriptionRoutes');
const app=express();
app.use(express.json({verify:(req,_res,body)=>{req.rawBody=Buffer.from(body);}}));
app.use('/subscriptions',subscriptionRoutes);
beforeEach(()=>{jest.restoreAllMocks();db.auth.getUser.mockReset();});
test('missing or invalid session cannot create checkout',async()=>{
    expect((await request(app).post('/subscriptions/checkout').send({userId:'victim',amount:1})).status).toBe(401);
    expect(db.auth.getUser).not.toHaveBeenCalled();
    db.auth.getUser.mockResolvedValue({data:{},error:new Error('invalid token')});
    expect((await request(app).post('/subscriptions/checkout').set('Authorization','Bearer invalid').send({})).status).toBe(401);
});
test('checkout identity comes from verified JWT rather than request body',async()=>{
    const user={id:'verified-user',email:'test@example.invalid'};
    db.auth.getUser.mockResolvedValue({data:{user}});
    const create=jest.spyOn(subscriptionPayments,'create').mockResolvedValue({orderId:'test'});
    const response=await request(app).post('/subscriptions/checkout').set('Authorization','Bearer signed-session').send({userId:'victim',planSlug:'monthly',amount:1});
    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith(user,'signed-session',expect.anything());
});
test('webhook receives raw body and persistence errors request gateway retry',async()=>{
    const webhook=jest.spyOn(subscriptionPayments,'webhook').mockRejectedValue(Object.assign(new Error('Activation pending'),{status:503}));
    const raw='{ "event" : "payment_link.paid" }';
    const response=await request(app).post('/subscriptions/webhook').set('Content-Type','application/json').set('x-razorpay-signature','signed').send(raw);
    expect(response.status).toBe(503);
    expect(webhook).toHaveBeenCalledWith(Buffer.from(raw),'signed');
});
