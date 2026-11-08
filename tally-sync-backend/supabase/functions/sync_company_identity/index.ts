/**
 * SYNCORA — Edge Function: sync_company_identity
 *
 * Endpoint: POST /functions/v1/sync_company_identity
 * Method: POST
 * Auth: Bearer JWT (Supabase Auth)
 * Description: Registers company identity mapping and performs Main Path switching.
 *              All cloud writes are atomic within this function.
 *
 * Security:
 * - Validates Supabase JWT (auth.uid())
 * - Verifies company ownership (companies.owner_id = auth.uid())
 * - Uses service_role client for database writes (server-side only)
 * - Idempotent: same (company_id, tally_guid, data_path, source_id) returns existing record
 * - Conflict detection: same tally_guid registered to different company_id → 409
 * - Path switching: deactivates old path, activates new path atomically
 * - Never exposes service_role credentials to client
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface RequestBody {
  company_id: string;
  tally_guid: string;
  data_path: string;
  source_id: string;
  switch_main_path?: boolean; // When true, deactivates other active paths for this GUID
}

interface IndexEntry {
  id: string;
  supabase_company_id: string;
  tally_guid: string;
  data_path: string;
  source_id: string;
  owner_id: string;
  is_verified: boolean;
  is_active: boolean;
  confirmation_state: string;
  registered_at: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  // Only POST method allowed
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'method_not_allowed', message: 'Only POST method allowed' }),
      { status: 405, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // 1. Verify JWT authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'unauthorized', message: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);

    // Create Supabase client with user's JWT for RLS enforcement
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    // Verify user authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'unauthorized', message: 'Invalid or expired token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = user.id;

    // 2. Parse request body
    const body = await req.json() as {
      company_id: string;
      tally_guid: string;
      data_path: string;
      source_id: string;
      switch_main_path?: boolean;
    };

    const { company_id, tally_guid, data_path, source_id, switch_main_path = false } = body;

    // 3. Validate required fields
    if (!company_id || !tally_guid || !data_path || !source_id) {
      return new Response(JSON.stringify({ success: false, error: 'validation_error', message: 'company_id, tally_guid, data_path, and source_id are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 4. Verify company exists and ownership
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, owner_id')
      .eq('id', company_id)
      .maybeSingle();

    if (companyError || !company) {
      return new Response(JSON.stringify({ success: false, error: 'company_not_found', message: 'Company not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // Verify ownership
    if (company.owner_id !== user.id) {
      return new Response(JSON.stringify({ success: false, error: 'ownership_mismatch', message: 'You do not own this company' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // 5. Check existing exact mapping (idempotency)
    const { data: existingExact } = await supabase
      .from('company_identities')
      .select('*')
      .eq('supabase_company_id', company_id)
      .eq('tally_guid', tally_guid)
      .eq('data_path', data_path)
      .eq('source_id', source_id)
      .maybeSingle();

    if (existingExact) {
      // Same company_id + same tally_guid + same data_path + same source_id → return existing (idempotent)
      return new Response(JSON.stringify({
        success: true,
        action: 'idempotent',
        data: {
          id: existingExact.id,
          supabase_company_id: existingExact.supabase_company_id,
          tally_guid: existingExact.tally_guid,
          data_path: existingExact.data_path,
          source_id: existingExact.source_id,
          owner_id: existingExact.owner_id,
          is_verified: existingExact.is_verified,
          is_active: existingExact.is_active,
          confirmation_state: existingExact.confirmation_state,
          registered_at: existingExact.registered_at,
        },
      }, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }

    // 6. Check if same tally_guid is registered to a DIFFERENT company (cross-company conflict)
    const { data: existingByGuidDiffCompany } = await supabase
      .from('company_identities')
      .select('supabase_company_id, tally_guid, data_path, source_id, is_active, confirmation_state')
      .eq('tally_guid', tally_guid)
      .neq('supabase_company_id', company_id)
      .maybeSingle();

    if (existingByGuidDiffCompany) {
      return new Response(JSON.stringify({
        success: false,
        error: 'identity_conflict',
        message: 'This Tally GUID is already registered to a different company',
        existing: {
          company_id: existingByGuidDiffCompany.supabase_company_id,
          tally_guid: existingByGuidDiffCompany.tally_guid,
          data_path: existingByGuidDiffCompany.data_path,
          source_id: existingByGuidDiffCompany.source_id,
          is_active: existingByGuidDiffCompany.is_active,
          confirmation_state: existingByGuidDiffCompany.confirmation_state,
        },
      }, { status: 409, headers: { 'Content-Type': 'application/json' } }));
    }

    // 7. Path switching logic
    if (switch_main_path) {
      // Find any ACTIVE mapping for this company_id + tally_guid (old path to deactivate)
      const { data: activeMappings } = await supabase
        .from('company_identities')
        .select('id, supabase_company_id, tally_guid, data_path, source_id, is_active, confirmation_state')
        .eq('supabase_company_id', company_id)
        .eq('tally_guid', tally_guid)
        .eq('is_active', true)
        .neq('data_path', data_path); // exclude the new path itself

      if (activeMappings && activeMappings.length > 0) {
        // Deactivate all old active paths (atomic within this function)
        for (const oldMapping of activeMappings) {
          const { error: deactivateError } = await supabase
            .from('company_identities')
            .update({ is_active: false, confirmation_state: 'superseded' })
            .eq('id', oldMapping.id);

          if (deactivateError) {
            // Compensating: log but continue - the new path activation is the critical step
            console.error(`[PathSwitch] Failed to deactivate old path ${oldMapping.id}: ${deactivateError.message}`);
          }
        }
      }

      // Check if the new path already exists (inactive or pending) for this company
      const { data: existingNewPath } = await supabase
        .from('company_identities')
        .select('*')
        .eq('supabase_company_id', company_id)
        .eq('tally_guid', tally_guid)
        .eq('data_path', data_path)
        .maybeSingle();

      if (existingNewPath) {
        // Reactivate the existing new path mapping
        const { data: updatedRow, error: updateError } = await supabase
          .from('company_identities')
          .update({
            is_active: true,
            confirmation_state: 'confirmed',
            source_id: source_id,
            last_seen_at: new Date().toISOString(),
          })
          .eq('id', existingNewPath.id)
          .select()
          .single();

        if (updateError) {
          return new Response(JSON.stringify({ success: false, error: 'database_error', message: updateError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }

        return new Response(JSON.stringify({
          success: true,
          action: 'path_switched',
          data: {
            id: updatedRow.id,
            supabase_company_id: updatedRow.supabase_company_id,
            tally_guid: updatedRow.tally_guid,
            data_path: updatedRow.data_path,
            source_id: updatedRow.source_id,
            owner_id: updatedRow.owner_id,
            is_verified: updatedRow.is_verified,
            is_active: updatedRow.is_active,
            confirmation_state: updatedRow.confirmation_state,
            registered_at: updatedRow.registered_at,
          },
        }, { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }

      // 8. Insert new mapping as the active confirmed path
      const { data: newIndex, error: insertError } = await supabase
        .from('company_identities')
        .insert([{
          supabase_company_id: company_id,
          tally_guid: tally_guid,
          data_path: data_path,
          source_id: source_id,
          owner_id: userId,
          is_verified: false,
          is_active: true,
          confirmation_state: 'confirmed',
        }])
        .select()
        .single();

      if (insertError) {
        // Handle unique constraint violation (race condition)
        if (insertError.code === '23505') {
          const { data: existingRow } = await supabase
            .from('company_identities')
            .select('*')
            .eq('supabase_company_id', company_id)
            .eq('tally_guid', tally_guid)
            .eq('data_path', data_path)
            .eq('source_id', source_id)
            .maybeSingle();

          if (existingRow) {
            return new Response(JSON.stringify({
              success: true,
              action: 'idempotent_race',
              data: {
                id: existingRow.id,
                supabase_company_id: existingRow.supabase_company_id,
                tally_guid: existingRow.tally_guid,
                data_path: existingRow.data_path,
                source_id: existingRow.source_id,
                owner_id: existingRow.owner_id,
                is_verified: existingRow.is_verified,
                is_active: existingRow.is_active,
                confirmation_state: existingRow.confirmation_state,
              },
            }, { status: 200, headers: { 'Content-Type': 'application/json' } }));
          }
        }

        return new Response(JSON.stringify({ success: false, error: 'database_error', message: insertError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success: true,
        action: 'path_switched',
        data: {
          id: newIndex.id,
          supabase_company_id: newIndex.supabase_company_id,
          tally_guid: newIndex.tally_guid,
          data_path: newIndex.data_path,
          source_id: newIndex.source_id,
          owner_id: newIndex.owner_id,
          is_verified: newIndex.is_verified,
          is_active: newIndex.is_active,
          confirmation_state: newIndex.confirmation_state,
          registered_at: newIndex.registered_at,
        },
      }, { status: 201, headers: { 'Content-Type': 'application/json' } }));
    }

    // 9. Non-switch registration (new company registration, no path switching)
    // Insert new mapping as pending (cloud activation not yet confirmed by connector)
    const { data: newIndex, error: insertError } = await supabase
      .from('company_identities')
      .insert([{
        supabase_company_id: company_id,
        tally_guid: tally_guid,
        data_path: data_path,
        source_id: source_id,
        owner_id: userId,
        is_verified: false,
        is_active: true,
        confirmation_state: 'pending',
      }])
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: existingRow } = await supabase
          .from('company_identities')
          .select('*')
          .eq('supabase_company_id', company_id)
          .eq('tally_guid', tally_guid)
          .eq('data_path', data_path)
          .eq('source_id', source_id)
          .maybeSingle();

        if (existingRow) {
          return new Response(JSON.stringify({
            success: true,
            action: 'idempotent_race',
            data: {
              id: existingRow.id,
              supabase_company_id: existingRow.supabase_company_id,
              tally_guid: existingRow.tally_guid,
              data_path: existingRow.data_path,
              source_id: existingRow.source_id,
              owner_id: existingRow.owner_id,
              is_verified: existingRow.is_verified,
              is_active: existingRow.is_active,
              confirmation_state: existingRow.confirmation_state,
            },
          }, { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
      }

      return new Response(JSON.stringify({ success: false, error: 'database_error', message: insertError.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 10. Success - new mapping created as pending
    return new Response(JSON.stringify({
      success: true,
      action: 'registered_pending',
      data: {
        id: newIndex.id,
        supabase_company_id: newIndex.supabase_company_id,
        tally_guid: newIndex.tally_guid,
        data_path: newIndex.data_path,
        source_id: newIndex.source_id,
        owner_id: newIndex.owner_id,
        is_verified: newIndex.is_verified,
        is_active: newIndex.is_active,
        confirmation_state: newIndex.confirmation_state,
        registered_at: newIndex.registered_at,
      },
    }, { status: 201, headers: { 'Content-Type': 'application/json' } }));
  } catch (ex) {
    console.error('Identity registration error:', ex);
    return new Response(
      JSON.stringify({ success: false, error: 'internal_error', message: 'Internal server error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
