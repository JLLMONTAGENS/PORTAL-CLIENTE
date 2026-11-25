CREATE TABLE IF NOT EXISTS dispositivos_push_web_atendimento (
  endpoint TEXT PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS dispositivos_push_web_atendimento_usuario_idx
  ON dispositivos_push_web_atendimento (usuario_id);
