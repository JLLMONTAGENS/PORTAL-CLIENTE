-- Operação do montador, evidências e pagamentos agrupados — HOMOLOGAÇÃO.
-- Reexecutável. Execute somente depois de migracao-area-montador.sql.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS status_execucao_montador TEXT;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS aceito_montador_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS recusado_montador_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS iniciado_montador_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS concluido_montador_em TIMESTAMPTZ;
ALTER TABLE orcamentos ADD COLUMN IF NOT EXISTS atribuicao_versao UUID;

UPDATE orcamentos
SET status_execucao_montador='PENDENTE_ACEITE',atribuicao_versao=COALESCE(atribuicao_versao,gen_random_uuid())
WHERE montador_id IS NOT NULL AND status_execucao_montador IS NULL AND status_pg_montador<>'PAGO';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='orcamentos_status_execucao_montador_check') THEN
    ALTER TABLE orcamentos ADD CONSTRAINT orcamentos_status_execucao_montador_check
      CHECK (status_execucao_montador IS NULL OR status_execucao_montador IN ('PENDENTE_ACEITE','ACEITO','EM_EXECUCAO','CONCLUIDO','RECUSADO'));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS orcamentos_operacao_montador_idx ON orcamentos(montador_id,status_execucao_montador,agendado_para);

CREATE TABLE IF NOT EXISTS fotos_servico_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  orcamento_id UUID NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE RESTRICT,
  url_armazenamento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL,
  tamanho_bytes INTEGER NOT NULL,
  chave_idempotencia TEXT,
  capturado_em TIMESTAMPTZ,
  sincronizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(montador_id,chave_idempotencia)
);
CREATE INDEX IF NOT EXISTS fotos_servico_atendimento_idx ON fotos_servico_montador(atendimento_id,criado_em);

CREATE TABLE IF NOT EXISTS operacoes_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE CASCADE,
  chave_idempotencia TEXT NOT NULL,
  tipo TEXT NOT NULL,
  recurso_id UUID,
  resposta JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(montador_id,chave_idempotencia)
);

CREATE TABLE IF NOT EXISTS dispositivos_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE CASCADE,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('ANDROID','IOS')),
  push_token TEXT NOT NULL UNIQUE,
  identificador_dispositivo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_acesso_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dispositivos_montador_ativo_idx ON dispositivos_montador(montador_id,ativo);

CREATE TABLE IF NOT EXISTS notificacoes_push_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE CASCADE,
  orcamento_id UUID REFERENCES orcamentos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  dados JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','AGUARDANDO_CONFIGURACAO','SEM_DISPOSITIVO','ENVIADA','FALHOU')),
  resultado JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultimo_erro TEXT,
  enviado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS notificacoes_push_montador_idx ON notificacoes_push_montador(montador_id,status,criado_em DESC);

CREATE TABLE IF NOT EXISTS redefinicoes_senha_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  solicitado_ip TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS redefinicoes_senha_montador_idx ON redefinicoes_senha_montador(montador_id,criado_em DESC);

CREATE TABLE IF NOT EXISTS pagamentos_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero BIGSERIAL UNIQUE,
  montador_id UUID NOT NULL REFERENCES montadores(id) ON DELETE RESTRICT,
  valor_total NUMERIC(18,2) NOT NULL CHECK(valor_total>0),
  status TEXT NOT NULL DEFAULT 'AGUARDANDO_NFSE' CHECK(status IN ('AGUARDANDO_NFSE','NFSE_EM_ANALISE','NFSE_REJEITADA','AUTORIZADO','ENVIADO_AO_BANCO','PAGO','FALHOU','CANCELADO')),
  documento_bancario TEXT NOT NULL UNIQUE,
  nfse_documento_id UUID,
  gerado_por UUID NOT NULL REFERENCES usuarios_atendimento(id),
  autorizado_por UUID REFERENCES usuarios_atendimento(id),
  autorizado_em TIMESTAMPTZ,
  enviado_banco_em TIMESTAMPTZ,
  pago_em TIMESTAMPTZ,
  baixado_por UUID REFERENCES usuarios_atendimento(id),
  baixa_origem TEXT CHECK(baixa_origem IS NULL OR baixa_origem IN ('CNAB_RETORNO','MANUAL')),
  baixa_justificativa TEXT,
  ocorrencia_bancaria TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS pagamentos_montador_status_idx ON pagamentos_montador(status,criado_em DESC);
CREATE INDEX IF NOT EXISTS pagamentos_montador_profissional_idx ON pagamentos_montador(montador_id,status,criado_em DESC);

CREATE TABLE IF NOT EXISTS pagamentos_montador_itens (
  pagamento_id UUID NOT NULL REFERENCES pagamentos_montador(id) ON DELETE CASCADE,
  orcamento_id UUID NOT NULL UNIQUE REFERENCES orcamentos(id) ON DELETE RESTRICT,
  valor NUMERIC(18,2) NOT NULL CHECK(valor>=0),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(pagamento_id,orcamento_id)
);

ALTER TABLE documentos_montador ADD COLUMN IF NOT EXISTS pagamento_montador_id UUID REFERENCES pagamentos_montador(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS documentos_montador_nfse_pagamento_idx ON documentos_montador(pagamento_montador_id) WHERE pagamento_montador_id IS NOT NULL AND tipo='NOTA_FISCAL_SERVICO';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='pagamentos_montador_nfse_fk') THEN
    ALTER TABLE pagamentos_montador ADD CONSTRAINT pagamentos_montador_nfse_fk FOREIGN KEY(nfse_documento_id) REFERENCES documentos_montador(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS configuracao_cnab_montador (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK(id=1),
  banco_codigo TEXT NOT NULL,
  convenio TEXT NOT NULL,
  layout_versao TEXT NOT NULL,
  empresa_inscricao TEXT NOT NULL,
  agencia TEXT NOT NULL,
  conta TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT FALSE,
  sequencial_remessa BIGINT NOT NULL DEFAULT 0,
  atualizado_por UUID REFERENCES usuarios_atendimento(id),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS arquivos_cnab_montador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK(tipo IN ('REMESSA','RETORNO')),
  nome_arquivo TEXT NOT NULL,
  hash_sha256 TEXT NOT NULL,
  banco_codigo TEXT NOT NULL,
  sequencial BIGINT,
  conteudo TEXT NOT NULL,
  resultado JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por UUID NOT NULL REFERENCES usuarios_atendimento(id),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE pagamentos_montador IS 'Borderôs agrupados por montador. Uma NFS-e pelo valor total precede a autorização.';
COMMENT ON COLUMN pagamentos_montador.documento_bancario IS 'Identificador estável enviado no CNAB e conciliado no retorno.';
COMMENT ON TABLE fotos_servico_montador IS 'Evidências privadas obrigatórias para conclusão pelo aplicativo.';
