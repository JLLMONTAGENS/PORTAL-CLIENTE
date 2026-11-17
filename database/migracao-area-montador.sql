-- Área do Montador — homologação. Reexecutável e preserva montadores legados.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE montadores ADD COLUMN IF NOT EXISTS nome_completo TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS cpf TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS possui_cnpj BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS tipo_logradouro TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS logradouro TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS complemento TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS uf CHAR(2);
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS telefone_alternativo TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS banco_codigo TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS banco_nome TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS agencia TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS conta TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS chave_pix TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS senha_hash TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS status_cadastro TEXT NOT NULL DEFAULT 'LEGADO';
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS certidao_status TEXT NOT NULL DEFAULT 'PENDENTE';
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS observacoes_internas TEXT;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMPTZ;
ALTER TABLE montadores ADD COLUMN IF NOT EXISTS aprovado_por UUID REFERENCES usuarios_atendimento(id);

CREATE UNIQUE INDEX IF NOT EXISTS montadores_cpf_unico_idx ON montadores(cpf) WHERE cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS montadores_email_unico_idx ON montadores(LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS montadores_cnpj_unico_idx ON montadores(cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX IF NOT EXISTS montadores_status_idx ON montadores(status_cadastro, atualizado_em DESC);

CREATE TABLE IF NOT EXISTS termos_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('PRIVACIDADE_LGPD','PRESTACAO_AUTONOMA','ANTECEDENTES')),
  versao TEXT NOT NULL,
  hash_conteudo TEXT NOT NULL,
  aceito_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_origem TEXT,
  user_agent TEXT NOT NULL DEFAULT '',
  UNIQUE (montador_id, tipo, versao)
);
CREATE INDEX IF NOT EXISTS termos_montador_idx ON termos_montador(montador_id, aceito_em DESC);

CREATE TABLE IF NOT EXISTS documentos_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('CERTIDAO_ANTECEDENTES','NOTA_FISCAL_SERVICO')),
  url_armazenamento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  status_revisao TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status_revisao IN ('PENDENTE','APROVADO','REJEITADO')),
  valor_total NUMERIC(18,2),
  referencia_pagamento TEXT,
  revisado_por UUID REFERENCES usuarios_atendimento(id),
  revisado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS documentos_montador_idx ON documentos_montador(montador_id, tipo, criado_em DESC);

CREATE TABLE IF NOT EXISTS auditoria_montador (
  id BIGSERIAL PRIMARY KEY,
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE CASCADE,
  ator_tipo TEXT NOT NULL CHECK (ator_tipo IN ('MONTADOR','ADMIN','SISTEMA')),
  ator_id UUID,
  acao TEXT NOT NULL,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_origem TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS auditoria_montador_idx ON auditoria_montador(montador_id, criado_em DESC);

CREATE TABLE IF NOT EXISTS configuracao_smtp (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  host TEXT NOT NULL DEFAULT 'email-ssl.com.br',
  porta INTEGER NOT NULL DEFAULT 465 CHECK (porta BETWEEN 1 AND 65535),
  seguro BOOLEAN NOT NULL DEFAULT TRUE,
  usuario TEXT,
  senha_criptografada TEXT,
  remetente_nome TEXT NOT NULL DEFAULT 'JLL Montagens',
  remetente_email TEXT,
  responder_para TEXT,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  atualizado_por UUID REFERENCES usuarios_atendimento(id),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fila_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  montador_id UUID REFERENCES montadores(id) ON DELETE SET NULL,
  destinatario TEXT NOT NULL,
  assunto TEXT NOT NULL,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK (status IN ('PENDENTE','ENVIADO','FALHOU')),
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  enviado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS fila_emails_status_idx ON fila_emails(status, criado_em);

COMMENT ON COLUMN montadores.status_cadastro IS 'LEGADO, CADASTRO_RECEBIDO, PENDENTE_DOCUMENTO, EM_ANALISE, APROVADO, REJEITADO ou SUSPENSO';
COMMENT ON TABLE documentos_montador IS 'Arquivos privados. Certidão somente para revisão administrativa; NFS-e condiciona o repasse correspondente.';
COMMENT ON COLUMN documentos_montador.valor_total IS 'Para NFS-e, deve corresponder ao valor total previsto de pagamento.';
