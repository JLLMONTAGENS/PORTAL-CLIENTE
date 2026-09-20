const { getDatabase } = require('../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const conversationId = String(req.body?.conversationId || '');
  const body = String(req.body?.body || '').trim();
  if (!conversationId || !body) return res.status(400).json({ error: 'Mensagem vazia.' });
  try {
    const sql = getDatabase();
    const open = await sql`SELECT id FROM conversations WHERE id = ${conversationId} AND status <> 'closed' LIMIT 1`;
    if (!open[0]) return res.status(404).json({ error: 'Atendimento não encontrado ou encerrado.' });
    const rows = await sql`INSERT INTO messages (conversation_id, sender_type, body) VALUES (${conversationId}, 'customer', ${body}) RETURNING id, sender_type, body, created_at`;
    await sql`UPDATE conversations SET updated_at = NOW() WHERE id = ${conversationId}`;
    return res.status(201).json({ message: rows[0] });
  } catch (error) {
    console.error('Send message failed', error);
    return res.status(500).json({ error: 'Não foi possível enviar a mensagem.' });
  }
};
