// Supabase Edge Function: delete-account
//
// 真正注销账号：用 service-role key 调 auth.admin.deleteUser() 删掉 auth.users 那一行。
// 客户端没有 service-role 权限做不到这件事，所以注销流程的最后一步调用本 Function。
//
// 安全：删除的用户 id 只从调用者的 JWT 推导（admin.auth.getUser(token)），绝不接受
// body 传入的 id——否则任何登录用户都能删别人的账号。
//
// 因为每张表的 user_id 都是 `REFERENCES auth.users(id) ON DELETE CASCADE`（迁移 0009），
// 删掉 auth 用户会级联清掉该用户所有数据行，所以这一步同时兜底了数据删除。
//
// 部署：supabase functions deploy delete-account
//   (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自动注入，无需手动设 secret)

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  // CORS preflight — the browser sends this before the real POST.
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return json({ error: '未认证' }, 401)

  const admin = createClient(url, serviceKey)

  // Verify the caller and take their id straight from the JWT — never trust a
  // body-supplied id, or one user could delete another's account.
  const { data: { user }, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !user) return json({ error: '认证失效，请重新登录' }, 401)

  // Delete the auth.users row; ON DELETE CASCADE wipes every owned data row too.
  const { error: delErr } = await admin.auth.admin.deleteUser(user.id)
  if (delErr) return json({ error: delErr.message }, 500)

  return json({ ok: true })
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
