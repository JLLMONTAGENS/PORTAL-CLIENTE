-- Gestão financeira dos orçamentos — homologação.
-- Pode ser executada mais de uma vez. Valores antigos em centavos são convertidos para NUMERIC(18,2).

BEGIN;

ALTER TABLE montadores
  ADD COLUMN IF NOT EXISTS percentual_repasse NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE montadores DROP CONSTRAINT IF EXISTS montadores_percentual_repasse_check;
ALTER TABLE montadores ADD CONSTRAINT montadores_percentual_repasse_check
  CHECK (percentual_repasse >= 0 AND percentual_repasse <= 100);

ALTER TABLE atendimentos ADD COLUMN IF NOT EXISTS valor_servico NUMERIC(18,2);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='atendimentos' AND column_name='valor_servico_centavos') THEN
    EXECUTE 'UPDATE atendimentos SET valor_servico = ROUND(valor_servico_centavos::numeric / 100, 2) WHERE valor_servico IS NULL AND valor_servico_centavos IS NOT NULL';
    ALTER TABLE atendimentos DROP COLUMN valor_servico_centavos;
  END IF;
END $$;
ALTER TABLE atendimentos DROP CONSTRAINT IF EXISTS atendimentos_valor_servico_check;
ALTER TABLE atendimentos ADD CONSTRAINT atendimentos_valor_servico_check
  CHECK (valor_servico IS NULL OR valor_servico >= 0);

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS valor NUMERIC(18,2);
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orcamentos' AND column_name='valor_centavos') THEN
    EXECUTE 'UPDATE orcamentos SET valor = ROUND(valor_centavos::numeric / 100, 2) WHERE valor IS NULL AND valor_centavos IS NOT NULL';
    ALTER TABLE orcamentos DROP COLUMN valor_centavos;
  END IF;
END $$;
ALTER TABLE orcamentos ALTER COLUMN valor SET NOT NULL;
ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_valor_check;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_valor_check CHECK (valor >= 0);

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS status_orcamento TEXT NOT NULL DEFAULT 'GERADO';
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS status_pag_cliente TEXT NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS status_pg_montador TEXT NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS valor_montador NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS adicional_montador NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS origem_pagamento_cliente TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS provedor_pagamento TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS id_pagamento_externo TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS link_pagamento TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS pago_cliente_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS pago_montador_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS finalizado_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS montador_alterado_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS cidade TEXT;

ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_status_orcamento_check;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_status_orcamento_check
  CHECK (status_orcamento IN ('GERADO', 'MONTADOR_ATRIBUIDO', 'FINALIZADO', 'CANCELADO'));
ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_status_pag_cliente_check;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_status_pag_cliente_check
  CHECK (status_pag_cliente IN ('PENDENTE', 'PAGO'));
ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_status_pg_montador_check;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_status_pg_montador_check
  CHECK (status_pg_montador IN ('PENDENTE', 'PAGO'));
ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_valor_montador_check;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_valor_montador_check CHECK (valor_montador >= 0);
ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_adicional_montador_check;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_adicional_montador_check CHECK (adicional_montador >= 0);
ALTER TABLE orcamentos DROP CONSTRAINT IF EXISTS orcamentos_origem_pagamento_cliente_check;
ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_origem_pagamento_cliente_check
  CHECK (origem_pagamento_cliente IS NULL OR origem_pagamento_cliente IN ('MANUAL', 'LINK'));

UPDATE orcamentos o
SET status_orcamento = CASE
      WHEN a.status = 'SERVICO_FINALIZADO' THEN 'FINALIZADO'
      WHEN o.montador_id IS NOT NULL THEN 'MONTADOR_ATRIBUIDO'
      ELSE 'GERADO'
    END,
    status_pag_cliente = CASE WHEN a.status = 'SERVICO_FINALIZADO' THEN 'PAGO' ELSE status_pag_cliente END,
    pago_cliente_em = CASE WHEN a.status = 'SERVICO_FINALIZADO' THEN COALESCE(o.pago_cliente_em, a.encerrado_em, a.atualizado_em) ELSE o.pago_cliente_em END
FROM atendimentos a
WHERE a.id = o.atendimento_id;

UPDATE orcamentos o
SET valor_montador = ROUND(o.valor * COALESCE(m.percentual_repasse, 0) / 100, 2)
FROM montadores m
WHERE m.id = o.montador_id AND o.valor_montador = 0;

UPDATE orcamentos
SET finalizado_em = COALESCE(finalizado_em, pago_cliente_em, atualizado_em)
WHERE status_orcamento = 'FINALIZADO' AND finalizado_em IS NULL;

UPDATE orcamentos
SET montador_alterado_em = COALESCE(montador_alterado_em, atualizado_em, criado_em)
WHERE montador_id IS NOT NULL AND montador_alterado_em IS NULL;

CREATE INDEX IF NOT EXISTS orcamentos_status_pagamentos_idx
  ON orcamentos (status_pag_cliente, status_pg_montador, status_orcamento);

CREATE INDEX IF NOT EXISTS orcamentos_datas_gestao_idx
  ON orcamentos (criado_em, finalizado_em, montador_alterado_em, pago_montador_em);

CREATE TABLE IF NOT EXISTS configuracoes_pagamento (
  provedor TEXT PRIMARY KEY CHECK (provedor IN ('MERCADO_PAGO', 'PAGBANK', 'REDE')),
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  ambiente TEXT NOT NULL DEFAULT 'SANDBOX' CHECK (ambiente IN ('SANDBOX', 'PRODUCAO')),
  usar_3ds BOOLEAN NOT NULL DEFAULT FALSE,
  configuracao_publica JSONB NOT NULL DEFAULT '{}'::jsonb,
  segredos_criptografados TEXT,
  ultimo_teste_em TIMESTAMPTZ,
  ultimo_teste_ok BOOLEAN,
  ultimo_teste_mensagem TEXT,
  atualizado_por UUID REFERENCES usuarios_atendimento(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orcamentos_cidade_bairro_idx
  ON orcamentos (LOWER(cidade), LOWER(bairro));

COMMIT;
