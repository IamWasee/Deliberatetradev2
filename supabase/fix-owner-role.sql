-- Run this once in Supabase → SQL Editor to promote the owner account that
-- already exists. Re-running supabase/schema.sql in full does the same thing;
-- this is the minimal version if you'd rather not re-run everything.

update public.profiles
set role = 'admin'
where lower(email) = 'abdullahwasee86@gmail.com';

-- Confirm it worked — this should return one row showing role = admin.
select email, role, tier, created_at
from public.profiles
where lower(email) = 'abdullahwasee86@gmail.com';
