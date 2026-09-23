begin;
-- Roll back the client first. Keep original-file retention and revision triggers:
-- disabling them would let older clients erase the only surviving source.
-- Restore the previous civil-date default only if reverting the product decision.
alter table public.ordenes alter column fecha_ingreso set default current_date;
-- All additions are backward compatible; no photo, source or audit is dropped.
commit;
