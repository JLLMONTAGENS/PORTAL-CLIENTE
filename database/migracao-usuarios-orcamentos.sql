-- Evolução da homologação: usuários com login/permissão e orçamentos vinculados ao atendimento.
-- Pode ser executada mais de uma vez com segurança.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE usuarios_atendimento ADD COLUMN IF NOT EXISTS nome_exibicao TEXT;
ALTER TABLE usuarios_atendimento ADD COLUMN IF NOT EXISTS nome_completo TEXT;
ALTER TABLE usuarios_atendimento ADD COLUMN IF NOT EXISTS login TEXT;

UPDATE usuarios_atendimento
SET nome_exibicao = COALESCE(NULLIF(nome_exibicao, ''), nome),
    nome_completo = COALESCE(NULLIF(nome_completo, ''), nome),
    login = COALESCE(NULLIF(login, ''), email);

ALTER TABLE usuarios_atendimento ALTER COLUMN nome_exibicao SET NOT NULL;
ALTER TABLE usuarios_atendimento ALTER COLUMN nome_completo SET NOT NULL;
ALTER TABLE usuarios_atendimento ALTER COLUMN login SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS usuarios_atendimento_login_unico
  ON usuarios_atendimento (LOWER(login));

CREATE TABLE IF NOT EXISTS orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL UNIQUE REFERENCES atendimentos(id) ON DELETE CASCADE,
  numero_atendimento BIGINT NOT NULL,
  nome_cliente TEXT NOT NULL,
  telefone_cliente TEXT NOT NULL,
  telefone_alternativo TEXT,
  descricao_servico TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos >= 0),
  agendado_para TIMESTAMPTZ NOT NULL,
  endereco TEXT NOT NULL,
  referencia TEXT,
  montador_id UUID REFERENCES montadores(id),
  gerado_por UUID NOT NULL REFERENCES usuarios_atendimento(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS orcamentos_agendamento_idx
  ON orcamentos (agendado_para ASC);
