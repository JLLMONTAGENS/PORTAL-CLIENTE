-- Presença, supervisão e chat interno da equipe — homologação.
-- Reexecutável e sem remoção de dados existentes.

CREATE TABLE IF NOT EXISTS usuarios_presenca (
  usuario_id UUID PRIMARY KEY REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,
  origem TEXT NOT NULL DEFAULT 'WEB' CHECK (origem IN ('WEB','ANDROID','IOS')),
  ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS usuarios_presenca_atividade_idx ON usuarios_presenca(ultima_atividade_em DESC);

CREATE TABLE IF NOT EXISTS mensagens_internas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  remetente_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,
  destinatario_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,
  texto TEXT,
  atendimento_origem_id UUID REFERENCES atendimentos(id) ON DELETE SET NULL,
  mensagem_origem_id UUID REFERENCES mensagens(id) ON DELETE SET NULL,
  lida_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (remetente_id <> destinatario_id),
  CHECK (texto IS NOT NULL OR mensagem_origem_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS mensagens_internas_conversa_idx ON mensagens_internas(remetente_id,destinatario_id,criado_em DESC);
CREATE INDEX IF NOT EXISTS mensagens_internas_nao_lidas_idx ON mensagens_internas(destinatario_id,lida_em,criado_em DESC);

CREATE TABLE IF NOT EXISTS anexos_mensagem_interna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id UUID NOT NULL UNIQUE REFERENCES mensagens_internas(id) ON DELETE CASCADE,
  url_armazenamento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  tipo_mime TEXT NOT NULL CHECK (tipo_mime IN ('image/jpeg','image/png','image/webp')),
  tamanho_bytes INTEGER NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notificacoes_push_interna (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,
  mensagem_interna_id UUID REFERENCES mensagens_internas(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','AGUARDANDO_CONFIGURACAO','SEM_DISPOSITIVO','ENVIADA','FALHOU')),
  resultado JSONB NOT NULL DEFAULT '[]'::jsonb,
  ultimo_erro TEXT,
  enviado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE usuarios_presenca IS 'Presença operacional; on-line quando a última atividade ocorreu nos 90 segundos anteriores.';
COMMENT ON TABLE mensagens_internas IS 'Mensagens diretas entre usuários do atendimento, separadas da conversa do cliente.';
