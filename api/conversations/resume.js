const { getDatabase, normalizePhone, publicConversation } = require('../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const phone = normalizePhone(req.body?.phone);
  if (phone.length < 12) return res.status(400).json({ error: 'Informe um telefone válido.' });
  try {
    const sql = getDatabase();
    const conversations = await sql`SELECT * FROM atendimentos WHERE telefone = ${phone} AND status <> 'SERVICO_FINALIZADO' ORDER BY atualizado_em DESC LIMIT 1`;
    if (!conversations[0]) return res.status(404).json({ error: 'Não encontramos atendimento aberto para este telefone.' });
    const conversation = conversations[0];
    const messages = await sql`SELECT m.id, m.tipo_remetente AS sender_type, m.texto AS body, m.criado_em AS created_at, a.id AS attachment_id, a.tipo_mime AS attachment_mime FROM mensagens m LEFT JOIN anexos_mensagem a ON a.mensagem_id = m.id WHERE m.atendimento_id = ${conversation.id} ORDER BY m.criado_em ASC`;
    return res.status(200).json({ conversation: publicConversation(conversation), messages });
  } catch (error) {
    console.error('Resume conversation failed', error);
    return res.status(500).json({ error: 'Não foi possível recuperar o atendimento.' });
  }
};
