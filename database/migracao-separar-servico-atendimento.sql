BEGIN;

ALTER TABLE atendimentos DROP CONSTRAINT IF EXISTS atendimentos_status_check;
ALTER TABLE atendimentos ADD CONSTRAINT atendimentos_status_check
  CHECK (status IN ('PENDENTE','GEROU_ORCAMENTO','ATRIBUIDO_MONTADOR','SERVICO_FINALIZADO','ATENDIMENTO_FINALIZADO','CANCELADO'));

ALTER TABLE mensagens ADD COLUMN IF NOT EXISTS visivel_cliente BOOLEAN NOT NULL DEFAULT TRUE;

-- Finalizações feitas explicitamente pelo atendente permanecem encerradas.
UPDATE atendimentos a
SET status='ATENDIMENTO_FINALIZADO'
WHERE a.status='SERVICO_FINALIZADO'
  AND EXISTS (
    SELECT 1 FROM eventos_atendimento e
    WHERE e.atendimento_id=a.id
      AND e.tipo_evento='ATENDIMENTO_FINALIZADO'
      AND e.detalhes ? 'usuario'
  );

-- Registros encerrados automaticamente por serviço/pagamento voltam ao estágio operacional correto.
UPDATE atendimentos a
SET status=CASE
      WHEN o.status_execucao_montador='CONCLUIDO' THEN 'SERVICO_FINALIZADO'
      WHEN o.montador_id IS NOT NULL THEN 'ATRIBUIDO_MONTADOR'
      ELSE 'GEROU_ORCAMENTO'
    END,
    encerrado_em=NULL
FROM orcamentos o
WHERE o.atendimento_id=a.id
  AND a.status='SERVICO_FINALIZADO';

-- O índice anterior permitia um novo atendimento após SERVICO_FINALIZADO.
-- Se houver mais de um registro agora considerado aberto para o mesmo telefone,
-- preserva o mais recente e encerra os anteriores antes de recriar o índice.
WITH abertos_ordenados AS (
  SELECT id,ROW_NUMBER() OVER (PARTITION BY telefone ORDER BY atualizado_em DESC,criado_em DESC) AS posicao
  FROM atendimentos
  WHERE status NOT IN ('ATENDIMENTO_FINALIZADO','CANCELADO')
)
UPDATE atendimentos a
SET status='ATENDIMENTO_FINALIZADO',
    encerrado_em=COALESCE(a.encerrado_em,NOW()),
    atualizado_em=NOW()
FROM abertos_ordenados r
WHERE r.id=a.id AND r.posicao>1;

DROP INDEX IF EXISTS atendimentos_um_aberto_por_telefone;
CREATE UNIQUE INDEX atendimentos_um_aberto_por_telefone
  ON atendimentos (telefone)
  WHERE status NOT IN ('ATENDIMENTO_FINALIZADO','CANCELADO');

COMMIT;
