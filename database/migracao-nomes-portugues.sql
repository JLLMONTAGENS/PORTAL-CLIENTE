-- Renomeia a estrutura já criada no Neon sem apagar dados.
-- Execute uma única vez no mesmo banco em que o schema original foi executado.

ALTER TABLE IF EXISTS staff_users RENAME TO usuarios_atendimento;
ALTER TABLE IF EXISTS assemblers RENAME TO montadores;
ALTER TABLE IF EXISTS conversations RENAME TO atendimentos;
ALTER TABLE IF EXISTS messages RENAME TO mensagens;
ALTER TABLE IF EXISTS message_attachments RENAME TO anexos_mensagem;
ALTER TABLE IF EXISTS conversation_events RENAME TO eventos_atendimento;

ALTER INDEX IF EXISTS conversations_one_open_per_phone RENAME TO atendimentos_um_aberto_por_telefone;
ALTER INDEX IF EXISTS conversations_status_updated_idx RENAME TO atendimentos_status_atualizado_idx;
ALTER INDEX IF EXISTS messages_conversation_created_idx RENAME TO mensagens_atendimento_criado_idx;
ALTER INDEX IF EXISTS conversation_events_conversation_idx RENAME TO eventos_atendimento_criado_idx;
