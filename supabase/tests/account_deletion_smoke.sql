-- Run after 20261118000005_account_deletion.sql on a disposable database.
-- This exercises every cleanup statement without touching a real account.
BEGIN;

DO $$
DECLARE
  v_test_user UUID := gen_random_uuid();
BEGIN
  PERFORM public.delete_account_data_secure(v_test_user);
END;
$$;

ROLLBACK;
