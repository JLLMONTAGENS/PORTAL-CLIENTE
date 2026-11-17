BEGIN;

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS aceito_cliente_em TIMESTAMPTZ;

COMMENT ON COLUMN public.orcamentos.aceito_cliente_em IS
  'Data e hora em que o cliente confirmou o aceite do orçamento.';

COMMIT;
