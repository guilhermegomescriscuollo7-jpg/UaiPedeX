-- ATENÇÃO: Execute APENAS após confirmar que TODOS os usuários fizeram o reset de senha
-- e nenhum fluxo de autenticação ainda usa o campo `password` diretamente.
-- A autenticação foi migrada para Supabase Auth (bcrypt) — as colunas abaixo são obsoletas.

ALTER TABLE customers DROP COLUMN IF EXISTS password;
ALTER TABLE stores    DROP COLUMN IF EXISTS password;
ALTER TABLE drivers   DROP COLUMN IF EXISTS password;
