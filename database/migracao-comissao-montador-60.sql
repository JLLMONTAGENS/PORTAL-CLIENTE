BEGIN;

-- Novos cadastros começam com o percentual comercial padrão da JLL.
ALTER TABLE montadores
  ALTER COLUMN percentual_repasse SET DEFAULT 60;

-- Preserva percentuais personalizados e corrige apenas cadastros sem comissão definida.
UPDATE montadores
SET percentual_repasse = 60,
    atualizado_em = NOW()
WHERE percentual_repasse IS NULL OR percentual_repasse = 0;

-- Registra como o valor do montador foi definido em cada orçamento.
ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS modo_valor_montador TEXT NOT NULL DEFAULT 'PERCENTUAL';

ALTER TABLE orcamentos
  ADD COLUMN IF NOT EXISTS percentual_repasse_aplicado NUMERIC(5,2);

ALTER TABLE orcamentos
  DROP CONSTRAINT IF EXISTS orcamentos_modo_valor_montador_check;

ALTER TABLE orcamentos
  ADD CONSTRAINT orcamentos_modo_valor_montador_check
  CHECK (modo_valor_montador IN ('PERCENTUAL', 'VALOR'));

ALTER TABLE orcamentos
  DROP CONSTRAINT IF EXISTS orcamentos_percentual_repasse_aplicado_check;

ALTER TABLE orcamentos
  ADD CONSTRAINT orcamentos_percentual_repasse_aplicado_check
  CHECK (
    percentual_repasse_aplicado IS NULL OR
    (percentual_repasse_aplicado >= 0 AND percentual_repasse_aplicado <= 100)
  );

-- Orçamentos antigos continuam com o valor já gravado e ganham o percentual de auditoria.
UPDATE orcamentos AS o
SET modo_valor_montador = 'PERCENTUAL',
    percentual_repasse_aplicado = m.percentual_repasse
FROM montadores AS m
WHERE o.montador_id = m.id
  AND o.percentual_repasse_aplicado IS NULL;

COMMIT;
