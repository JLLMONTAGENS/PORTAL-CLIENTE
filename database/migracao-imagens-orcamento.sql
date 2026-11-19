BEGIN;

CREATE TABLE IF NOT EXISTS public.orcamento_imagens_cliente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  anexo_mensagem_id UUID NOT NULL REFERENCES public.anexos_mensagem(id) ON DELETE CASCADE,
  ordem INTEGER NOT NULL CHECK (ordem > 0),
  selecionado_por UUID NOT NULL REFERENCES public.usuarios_atendimento(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (orcamento_id, anexo_mensagem_id),
  UNIQUE (orcamento_id, ordem)
);

CREATE INDEX IF NOT EXISTS orcamento_imagens_cliente_orcamento_idx
  ON public.orcamento_imagens_cliente (orcamento_id, ordem);

COMMENT ON TABLE public.orcamento_imagens_cliente IS
  'Imagens enviadas pelo cliente e selecionadas para orientar a montagem, na ordem definida no orçamento.';

COMMIT;
