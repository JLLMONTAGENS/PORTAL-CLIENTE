BEGIN;

-- Mantém os orçamentos antigos válidos e exige os campos na aplicação
-- para todas as novas gerações/atualizações de orçamento.
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS cidade TEXT;

CREATE INDEX IF NOT EXISTS orcamentos_cidade_bairro_idx
  ON orcamentos (LOWER(cidade), LOWER(bairro));

COMMIT;
