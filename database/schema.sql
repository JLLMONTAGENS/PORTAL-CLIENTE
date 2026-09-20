-- JLL Montagens — estrutura inicial do atendimento em português brasileiro.
-- Execute uma única vez em um banco novo do Neon.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL DEFAULT 'ATENDENTE' CHECK (perfil IN ('ADMINISTRADOR', 'ATENDENTE')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS montadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  telefone TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_atendimento BIGSERIAL UNIQUE,
  nome_cliente TEXT NOT NULL,
  telefone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE', 'GEROU_ORCAMENTO', 'ATRIBUIDO_MONTADOR', 'SERVICO_FINALIZADO')),
  montador_id UUID REFERENCES montadores(id),
  atendente_id UUID REFERENCES usuarios_atendimento(id),
  detalhes_servico TEXT,
  agendado_para TIMESTAMPTZ,
  valor_servico_centavos INTEGER CHECK (valor_servico_centavos IS NULL OR valor_servico_centavos >= 0),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrado_em TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS atendimentos_um_aberto_por_telefone
  ON atendimentos (telefone)
  WHERE status <> 'SERVICO_FINALIZADO';

CREATE INDEX IF NOT EXISTS atendimentos_status_atualizado_idx
  ON atendimentos (status, atualizado_em DESC);

CREATE TABLE IF NOT EXISTS mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  tipo_remetente TEXT NOT NULL CHECK (tipo_remetente IN ('CLIENTE', 'ATENDENTE', 'SISTEMA')),
  remetente_id UUID,
  texto TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (texto IS NOT NULL OR tipo_remetente = 'SISTEMA')
);

CREATE INDEX IF NOT EXISTS mensagens_atendimento_criado_idx
  ON mensagens (atendimento_id, criado_em ASC);

CREATE TABLE IF NOT EXISTS anexos_mensagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id UUID NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
  url_armazenamento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  tamanho_bytes INTEGER,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eventos_atendimento (
  id BIGSERIAL PRIMARY KEY,
  atendimento_id UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  tipo_evento TEXT NOT NULL,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eventos_atendimento_criado_idx
  ON eventos_atendimento (atendimento_id, criado_em ASC);
