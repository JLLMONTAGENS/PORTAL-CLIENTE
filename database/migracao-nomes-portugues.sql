-- Migração completa para nomes em português, preservando os dados existentes.
-- Execute uma única vez no banco Neon que já recebeu o schema em inglês.

ALTER TABLE IF EXISTS staff_users RENAME TO usuarios_atendimento;
ALTER TABLE IF EXISTS assemblers RENAME TO montadores;
ALTER TABLE IF EXISTS conversations RENAME TO atendimentos;
ALTER TABLE IF EXISTS messages RENAME TO mensagens;
ALTER TABLE IF EXISTS message_attachments RENAME TO anexos_mensagem;
ALTER TABLE IF EXISTS conversation_events RENAME TO eventos_atendimento;

ALTER TABLE IF EXISTS usuarios_atendimento RENAME COLUMN name TO nome;
ALTER TABLE IF EXISTS usuarios_atendimento RENAME COLUMN password_hash TO senha_hash;
ALTER TABLE IF EXISTS usuarios_atendimento RENAME COLUMN role TO perfil;
ALTER TABLE IF EXISTS usuarios_atendimento RENAME COLUMN active TO ativo;
ALTER TABLE IF EXISTS usuarios_atendimento RENAME COLUMN created_at TO criado_em;

ALTER TABLE IF EXISTS montadores RENAME COLUMN name TO nome;
ALTER TABLE IF EXISTS montadores RENAME COLUMN phone TO telefone;
ALTER TABLE IF EXISTS montadores RENAME COLUMN active TO ativo;
ALTER TABLE IF EXISTS montadores RENAME COLUMN created_at TO criado_em;

ALTER TABLE IF EXISTS atendimentos RENAME COLUMN ticket_number TO numero_atendimento;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN customer_name TO nome_cliente;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN phone TO telefone;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN assigned_assembler_id TO montador_id;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN assigned_staff_id TO atendente_id;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN service_details TO detalhes_servico;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN scheduled_for TO agendado_para;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN service_value_cents TO valor_servico_centavos;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN created_at TO criado_em;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN updated_at TO atualizado_em;
ALTER TABLE IF EXISTS atendimentos RENAME COLUMN closed_at TO encerrado_em;

ALTER TABLE IF EXISTS mensagens RENAME COLUMN conversation_id TO atendimento_id;
ALTER TABLE IF EXISTS mensagens RENAME COLUMN sender_type TO tipo_remetente;
ALTER TABLE IF EXISTS mensagens RENAME COLUMN sender_id TO remetente_id;
ALTER TABLE IF EXISTS mensagens RENAME COLUMN body TO texto;
ALTER TABLE IF EXISTS mensagens RENAME COLUMN created_at TO criado_em;

ALTER TABLE IF EXISTS anexos_mensagem RENAME COLUMN message_id TO mensagem_id;
ALTER TABLE IF EXISTS anexos_mensagem RENAME COLUMN storage_url TO url_armazenamento;
ALTER TABLE IF EXISTS anexos_mensagem RENAME COLUMN file_name TO nome_arquivo;
ALTER TABLE IF EXISTS anexos_mensagem RENAME COLUMN mime_type TO tipo_mime;
ALTER TABLE IF EXISTS anexos_mensagem RENAME COLUMN file_size TO tamanho_bytes;
ALTER TABLE IF EXISTS anexos_mensagem RENAME COLUMN created_at TO criado_em;

ALTER TABLE IF EXISTS eventos_atendimento RENAME COLUMN conversation_id TO atendimento_id;
ALTER TABLE IF EXISTS eventos_atendimento RENAME COLUMN event_type TO tipo_evento;
ALTER TABLE IF EXISTS eventos_atendimento RENAME COLUMN details TO detalhes;
ALTER TABLE IF EXISTS eventos_atendimento RENAME COLUMN created_at TO criado_em;

ALTER TABLE IF EXISTS atendimentos DROP CONSTRAINT IF EXISTS conversations_status_check;
ALTER TABLE IF EXISTS atendimentos DROP CONSTRAINT IF EXISTS atendimentos_status_check;
ALTER TABLE IF EXISTS mensagens DROP CONSTRAINT IF EXISTS messages_sender_type_check;
ALTER TABLE IF EXISTS mensagens DROP CONSTRAINT IF EXISTS mensagens_tipo_remetente_check;
ALTER TABLE IF EXISTS mensagens DROP CONSTRAINT IF EXISTS messages_body_check;
ALTER TABLE IF EXISTS mensagens DROP CONSTRAINT IF EXISTS mensagens_texto_check;

UPDATE atendimentos SET status = CASE status
  WHEN 'pending' THEN 'PENDENTE'
  WHEN 'quote_generated' THEN 'GEROU_ORCAMENTO'
  WHEN 'assembler_assigned' THEN 'ATRIBUIDO_MONTADOR'
  WHEN 'service_completed' THEN 'SERVICO_FINALIZADO'
  WHEN 'closed' THEN 'SERVICO_FINALIZADO'
  ELSE status
END;

ALTER TABLE atendimentos ALTER COLUMN status SET DEFAULT 'PENDENTE';
ALTER TABLE atendimentos ADD CONSTRAINT atendimentos_status_check CHECK (status IN ('PENDENTE', 'GEROU_ORCAMENTO', 'ATRIBUIDO_MONTADOR', 'SERVICO_FINALIZADO'));
UPDATE mensagens SET tipo_remetente = CASE tipo_remetente
  WHEN 'customer' THEN 'CLIENTE'
  WHEN 'staff' THEN 'ATENDENTE'
  WHEN 'system' THEN 'SISTEMA'
  ELSE tipo_remetente
END;

ALTER TABLE mensagens ADD CONSTRAINT mensagens_tipo_remetente_check CHECK (tipo_remetente IN ('CLIENTE', 'ATENDENTE', 'SISTEMA'));
ALTER TABLE mensagens ADD CONSTRAINT mensagens_texto_check CHECK (texto IS NOT NULL OR tipo_remetente = 'SISTEMA');

DROP INDEX IF EXISTS atendimentos_um_aberto_por_telefone;
DROP INDEX IF EXISTS conversations_one_open_per_phone;
CREATE UNIQUE INDEX atendimentos_um_aberto_por_telefone ON atendimentos (telefone) WHERE status <> 'SERVICO_FINALIZADO';

DROP INDEX IF EXISTS atendimentos_status_atualizado_idx;
CREATE INDEX atendimentos_status_atualizado_idx ON atendimentos (status, atualizado_em DESC);
