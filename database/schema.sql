-- JLL Montagens — estrutura inicial do atendimento em português brasileiro.
-- Execute uma única vez em um banco novo do Neon.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nome_exibicao TEXT NOT NULL,
  nome_completo TEXT NOT NULL,
  login TEXT NOT NULL UNIQUE,
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
  percentual_repasse NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (percentual_repasse >= 0 AND percentual_repasse <= 100),
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
  valor_servico NUMERIC(18,2) CHECK (valor_servico IS NULL OR valor_servico >= 0),
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

CREATE TABLE IF NOT EXISTS orcamentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL UNIQUE REFERENCES atendimentos(id) ON DELETE CASCADE,
  numero_atendimento BIGINT NOT NULL,
  nome_cliente TEXT NOT NULL,
  telefone_cliente TEXT NOT NULL,
  telefone_alternativo TEXT,
  descricao_servico TEXT NOT NULL,
  valor NUMERIC(18,2) NOT NULL CHECK (valor >= 0),
  status_orcamento TEXT NOT NULL DEFAULT 'GERADO' CHECK (status_orcamento IN ('GERADO', 'MONTADOR_ATRIBUIDO', 'FINALIZADO')),
  status_pag_cliente TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status_pag_cliente IN ('PENDENTE', 'PAGO')),
  status_pg_montador TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status_pg_montador IN ('PENDENTE', 'PAGO')),
  valor_montador NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (valor_montador >= 0),
  adicional_montador NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (adicional_montador >= 0),
  origem_pagamento_cliente TEXT CHECK (origem_pagamento_cliente IS NULL OR origem_pagamento_cliente IN ('MANUAL', 'LINK')),
  provedor_pagamento TEXT,
  id_pagamento_externo TEXT,
  link_pagamento TEXT,
  pago_cliente_em TIMESTAMPTZ,
  pago_montador_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  montador_alterado_em TIMESTAMPTZ,
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
