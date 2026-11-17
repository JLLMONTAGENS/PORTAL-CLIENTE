-- Homologação: recuperação de senha dos usuários e dispositivos do app de atendimento.
-- Reexecutável e sem alteração dos logins existentes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS redefinicoes_senha_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  solicitado_ip TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS redefinicoes_senha_usuario_idx ON redefinicoes_senha_usuario(usuario_id,criado_em DESC);

CREATE TABLE IF NOT EXISTS dispositivos_usuario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('ANDROID','IOS')),
  push_token TEXT NOT NULL UNIQUE,
  identificador_dispositivo TEXT,
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_acesso_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dispositivos_usuario_ativo_idx ON dispositivos_usuario(usuario_id,ativo);

CREATE TABLE IF NOT EXISTS notificacoes_push_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  atendimento_id UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS notificacoes_push_atendimento_idx ON notificacoes_push_atendimento(atendimento_id,status,criado_em DESC);

COMMENT ON COLUMN usuarios_atendimento.login IS 'Identificador livre usado no login; não precisa ser um e-mail.';
COMMENT ON COLUMN usuarios_atendimento.email IS 'E-mail obrigatório e exclusivo usado para comunicações e recuperação de senha.';
