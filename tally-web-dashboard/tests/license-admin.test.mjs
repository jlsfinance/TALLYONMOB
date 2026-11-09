import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyLicenseAdminAction } from '../src/lib/licenseAdmin.mjs';
import { licensePresentation } from '../src/lib/licensePresentation.mjs';
const request = { userId: 'user-a', action: 'REVOKE', days: 30, reason: 'Admin review', requestId: 'request-a' };
test('revoke requires a confirmed server response and always sends null days', async () => {
    let sent;
    const client = { rpc: async (_name,args) => { sent=args; return { data: { ok: true, user_id: 'user-a', action: 'REVOKE', status: 'REVOKED' } }; } };
    assert.equal((await applyLicenseAdminAction(client,request)).status,'REVOKED');
    assert.equal(sent.p_days,null);
    assert.equal(sent.p_request_id,'request-a');
});
for (const data of [null,{ok:false},{ok:true,user_id:'other',action:'REVOKE',status:'REVOKED'},{ok:true,user_id:'user-a',action:'REVOKE',status:'ACTIVE'}]) {
    test('missing, false or mismatched payload is never treated as success: '+JSON.stringify(data), async () => {
        await assert.rejects(applyLicenseAdminAction({rpc:async()=>({data})},request),/did not confirm/);
    });
}
test('RPC errors propagate rather than displaying a success message', async () => {
    await assert.rejects(applyLicenseAdminAction({rpc:async()=>({error:new Error('Not authorized')})},request),/Not authorized/);
});
test('future expiry never makes a revoked license look active', () => {
    assert.deepEqual(licensePresentation({status:'revoked',daysLeft:300,expiryDate:'2099-01-01'},null,false),{active:false,label:'Revoked',daysLeft:0});
});
test('verification errors and loading never display an active badge', () => {
    assert.equal(licensePresentation({status:'active',daysLeft:30},'Offline',false).active,false);
    assert.equal(licensePresentation({status:'active',daysLeft:30},null,true).active,false);
});
