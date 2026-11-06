let schemaPromise=null;

function ensureChatSchema(sql){
  if(schemaPromise)return schemaPromise;
  schemaPromise=(async()=>{
    await sql`CREATE TABLE IF NOT EXISTS usuarios_presenca (usuario_id UUID PRIMARY KEY REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,origem TEXT NOT NULL DEFAULT 'WEB' CHECK (origem IN ('WEB','ANDROID','IOS')),ultima_atividade_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE INDEX IF NOT EXISTS usuarios_presenca_atividade_idx ON usuarios_presenca(ultima_atividade_em DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS mensagens_internas (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),remetente_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,destinatario_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,texto TEXT,atendimento_origem_id UUID REFERENCES atendimentos(id) ON DELETE SET NULL,mensagem_origem_id UUID REFERENCES mensagens(id) ON DELETE SET NULL,lida_em TIMESTAMPTZ,criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),CHECK (remetente_id <> destinatario_id),CHECK (texto IS NOT NULL OR mensagem_origem_id IS NOT NULL))`;
    await sql`CREATE INDEX IF NOT EXISTS mensagens_internas_conversa_idx ON mensagens_internas(remetente_id,destinatario_id,criado_em DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS mensagens_internas_nao_lidas_idx ON mensagens_internas(destinatario_id,lida_em,criado_em DESC)`;
    await sql`CREATE TABLE IF NOT EXISTS anexos_mensagem_interna (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),mensagem_id UUID NOT NULL UNIQUE REFERENCES mensagens_internas(id) ON DELETE CASCADE,url_armazenamento TEXT NOT NULL,nome_arquivo TEXT NOT NULL,tipo_mime TEXT NOT NULL CHECK (tipo_mime IN ('image/jpeg','image/png','image/webp')),tamanho_bytes INTEGER NOT NULL,criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
    await sql`CREATE TABLE IF NOT EXISTS notificacoes_push_interna (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),usuario_id UUID NOT NULL REFERENCES usuarios_atendimento(id) ON DELETE CASCADE,mensagem_interna_id UUID REFERENCES mensagens_internas(id) ON DELETE CASCADE,titulo TEXT NOT NULL,mensagem TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE','AGUARDANDO_CONFIGURACAO','SEM_DISPOSITIVO','ENVIADA','FALHOU')),resultado JSONB NOT NULL DEFAULT '[]'::jsonb,ultimo_erro TEXT,enviado_em TIMESTAMPTZ,criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW())`;
  })().catch(error=>{schemaPromise=null;throw error});
  return schemaPromise;
}

module.exports={ensureChatSchema};
