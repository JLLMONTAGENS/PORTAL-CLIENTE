const { getDatabase, normalizePhone, publicConversation } = require('../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const name = String(req.body?.name || '').trim();
  const phone = normalizePhone(req.body?.phone);
  if (name.length < 2 || phone.length < 12) return res.status(400).json({ error: 'Informe nome e telefone válidos.' });
  try {
    const sql = getDatabase();
    const open = await sql`SELECT * FROM atendimentos WHERE phone = ${phone} AND status <> 'closed' LIMIT 1`;
    if (open[0]) return res.status(200).json({ existing: true, conversation: publicConversation(open[0]) });
    const rows = await sql`INSERT INTO atendimentos (customer_name, phone) VALUES (${name}, ${phone}) RETURNING *`;
    const conversation = rows[0];
    const welcome = 'Aguarde só mais um pouco, que um especialista irá lhe atender.';
    await sql`INSERT INTO mensagens (conversation_id, sender_type, body) VALUES (${conversation.id}, 'system', ${welcome})`;
    return res.status(201).json({ existing: false, conversation: publicConversation(conversation), message: welcome });
  } catch (error) {
    console.error('Create conversation failed', error);
    return res.status(500).json({ error: 'Não foi possível iniciar o atendimento.' });
  }
};
