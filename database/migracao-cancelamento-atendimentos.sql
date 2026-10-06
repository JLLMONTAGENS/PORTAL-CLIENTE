BEGIN;

ALTER TABLE atendimentos DROP CONSTRAINT IF EXISTS atendimentos_status_check;
ALTER TABLE atendimentos ADD CONSTRAINT atendimentos_status_check
  CHECK (status IN ('PENDENTE', 'GEROU_ORCAMENTO', 'ATRIBUIDO_MONTADOR', 'SERVICO_FINALIZADO', 'CANCELADO'));

ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_status_orcamento_check;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_status_orcamento_check
  CHECK (status_orcamento IN ('GERADO', 'MONTADOR_ATRIBUIDO', 'FINALIZADO', 'CANCELADO'));

DROP INDEX IF EXISTS atendimentos_um_aberto_por_telefone;
CREATE UNIQUE INDEX atendimentos_um_aberto_por_telefone
  ON atendimentos (telefone)
  WHERE status NOT IN ('SERVICO_FINALIZADO', 'CANCELADO');

COMMIT;
