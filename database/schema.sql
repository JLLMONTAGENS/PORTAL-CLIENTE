-- JLL Montagens — base inicial do atendimento
-- Execute este arquivo no SQL Editor do Neon uma única vez.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios_atendimento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'attendant' CHECK (role IN ('admin', 'attendant')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS montadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number BIGSERIAL UNIQUE,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'quote_generated', 'assembler_assigned', 'service_completed', 'closed')),
  assigned_assembler_id UUID REFERENCES montadores(id),
  assigned_staff_id UUID REFERENCES usuarios_atendimento(id),
  service_details TEXT,
  scheduled_for TIMESTAMPTZ,
  service_value_cents INTEGER CHECK (service_value_cents IS NULL OR service_value_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS atendimentos_um_aberto_por_telefone
  ON atendimentos (phone)
  WHERE status <> 'closed';

CREATE INDEX IF NOT EXISTS atendimentos_status_atualizado_idx
  ON atendimentos (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'staff', 'system')),
  sender_id UUID,
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (body IS NOT NULL OR sender_type = 'system')
);

CREATE INDEX IF NOT EXISTS mensagens_atendimento_criado_idx
  ON mensagens (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS anexos_mensagem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES mensagens(id) ON DELETE CASCADE,
  storage_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS eventos_atendimento (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES atendimentos(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eventos_atendimento_criado_idx
  ON eventos_atendimento (conversation_id, created_at ASC);
