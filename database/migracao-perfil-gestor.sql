BEGIN;

ALTER TABLE usuarios_atendimento
  DROP CONSTRAINT IF EXISTS usuarios_atendimento_perfil_check;

ALTER TABLE usuarios_atendimento
  ADD CONSTRAINT usuarios_atendimento_perfil_check
  CHECK (perfil IN ('ADMINISTRADOR', 'GESTOR', 'ATENDENTE'));

COMMIT;
