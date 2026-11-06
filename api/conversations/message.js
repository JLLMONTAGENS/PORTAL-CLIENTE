const { getDatabase } = require('../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });
  const conversationId = String(req.body?.conversationId || '');
  const body = String(req.body?.body || '').trim();
  if (!conversationId || !body) return res.status(400).json({ error: 'Mensagem vazia.' });
  try {
    const sql = getDatabase();
    const open = await sql`SELECT id,nome_cliente,atendente_id FROM atendimentos WHERE id = ${conversationId} AND status NOT IN ('SERVICO_FINALIZADO','CANCELADO') LIMIT 1`;
    if (!open[0]) return res.status(404).json({ error: 'Atendimento não encontrado ou encerrado.' });
    const rows = await sql`INSERT INTO mensagens (atendimento_id, tipo_remetente, texto) VALUES (${conversationId}, 'CLIENTE', ${body}) RETURNING id, tipo_remetente AS sender_type, texto AS body, criado_em AS created_at`;
    await sql`UPDATE atendimentos SET atualizado_em = NOW() WHERE id = ${conversationId}`;
    try {
      const { notifyAttendance } = require('../admin/_push');
      const preview = body.replace(/\s+/g, ' ').slice(0, 120);
      await notifyAttendance({ atendimentoId: conversationId, tipo: 'NOVA_MENSAGEM_CLIENTE', titulo: 'Nova mensagem do cliente', mensagem: `${open[0].nome_cliente} enviou: ${preview}`, usuarioId: open[0].atendente_id });
    } catch (pushError) {
      console.error('Push de nova mensagem não enviado', pushError);
    }
    return res.status(201).json({ message: rows[0] });
  } catch (error) {
    console.error('Send message failed', error);
    return res.status(500).json({ error: 'Não foi possível enviar a mensagem.' });
  }
};
