# login-by-id

Bridges the app's **"Israeli ID number + password"** login to Supabase Auth
(**email + password**) — entirely server-side. See the header comment in
`index.ts` for the full flow and the security invariants.

The client calls it via `supabase.functions.invoke('login-by-id', { body: { idNumber, password } })`
from `services/authService.ts` (`signInById`), and only when
`EXPO_PUBLIC_USE_BACKEND=true`.

---

## Required secret — `ID_HMAC_PEPPER`

The function computes `HMAC-SHA256(normalizedIdNumber, ID_HMAC_PEPPER)` and
looks that up in `public.user_identity.id_number_hash`. The pepper is a
**server-side secret** — it must never appear in the Expo bundle, `.env`, git,
or this repo.

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are injected
automatically by the Supabase platform — you do **not** set those.

### Set it once (choose ONE):

**A. Supabase CLI**

```bash
# generate a cryptographically-random 256-bit pepper and set it as a secret
supabase secrets set ID_HMAC_PEPPER="$(openssl rand -hex 32)" --project-ref rxoyzsrnlterhmyzpsnd
```

**B. Supabase Dashboard**

Project → *Edge Functions* → *Manage secrets* → add
`ID_HMAC_PEPPER` = a 64-char hex string (e.g. from `openssl rand -hex 32`).

> Keep the value somewhere safe: you need the **same** value in the test-user
> seed SQL below, and the (future) Phase-3 registration Edge Function must reuse
> it too. Rotating it invalidates every stored `id_number_hash`.

---

## Deploy

Already deployed via MCP. To redeploy from the CLI:

```bash
supabase functions deploy login-by-id --project-ref rxoyzsrnlterhmyzpsnd
```

`verify_jwt = false` is pinned in `supabase/config.toml` (`[functions.login-by-id]`).

---

## Seed a single test user (Phase 2 has no registration flow yet)

Phase 3 will create `auth.users` rows from approved registrations. Until then,
create ONE test user by hand:

### 1. Create the auth user (safe, no direct `auth.users` insert)

Supabase Dashboard → *Authentication* → *Users* → **Add user**

- Email: `phase2.tester@buildup.dev` (any address you control / any address —
  it only needs to exist as an auth identity)
- Password: choose one, e.g. `Test1234!`
- **Auto Confirm User: ON**

Copy the new user's **UUID**.

### 2. Attach the profile + identity hash + minimal worker profile

Supabase Dashboard → *SQL Editor* → run (fill in the 3 placeholders; paste the
**same** `ID_HMAC_PEPPER` value you set above — this runs inside your own
Supabase project, not in chat):

```sql
do $$
declare
  v_uid    uuid := '<AUTH_USER_UUID>';
  v_email  text := '<AUTH_USER_EMAIL>';
  v_pepper text := '<ID_HMAC_PEPPER>';
  v_idnum  text := '123456782';                       -- 9-digit test ID (format-only)
  v_norm   text := lpad(regexp_replace(v_idnum, '\D', '', 'g'), 9, '0');
  v_hash   text := encode(extensions.hmac(v_norm, v_pepper, 'sha256'), 'hex');
begin
  insert into public.profiles (id, role, full_name, phone, email, email_verified, status)
  values (v_uid, 'worker', 'עובד בדיקה Phase 2', '050-0000000', v_email, true, 'approved')
  on conflict (id) do update
    set role = 'worker', status = 'approved', email = excluded.email;

  insert into public.user_identity (profile_id, id_number_hash)
  values (v_uid, v_hash)
  on conflict (profile_id) do update set id_number_hash = excluded.id_number_hash;

  insert into public.worker_profiles
    (profile_id, profession_category_slug, experience_years, is_available,
     hourly_rate, daily_rate, bio, city_name)
  values (v_uid, 'construction', 5, true, 120, 800, 'משתמש בדיקה של Phase 2', 'תל אביב')
  on conflict (profile_id) do nothing;

  insert into public.worker_professions (worker_id, profession_slug, is_primary)
  values (v_uid, 'builder', true)
  on conflict do nothing;

  insert into public.worker_preferred_areas (worker_id, area_slug)
  values (v_uid, 'center')
  on conflict do nothing;
end $$;
```

### 3. Log in from the app

`.env` → `EXPO_PUBLIC_USE_BACKEND=true`, reload, then on the worker login
screen: ID `123456782`, password `Test1234!`.

### Variations for the other acceptance tests

- **Admin (test G/H):** repeat with `role = 'admin'`, skip `worker_profiles`,
  and instead `insert into public.admin_permissions (profile_id, permission)
  values (v_uid, 'approve_registrations');` (add more rows as needed). Then it
  must succeed on the **admin** login and fail (generic) on the customer login.
- **pending / rejected / blocked (test F):** set `status` accordingly on the
  `profiles` row (`update public.profiles set status='pending' where id='<uuid>'`).
- **contractor:** `role='contractor'` + a `contractor_profiles` row
  (`company_name`, `contractor_registration_number`, `license_details` are NOT
  NULL) instead of `worker_profiles`.
