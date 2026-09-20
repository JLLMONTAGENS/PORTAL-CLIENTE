const { get } = require('@vercel/blob');
const { getDatabase } = require('../_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  const conversationId = String(req.query?.conversationId || '');
  const messageId = String(req.query?.messageId || '');
  if (!conversationId || !messageId) return res.status(400).end('Parâmetros inválidos');
  try {
    const sql = getDatabase();
    const rows = await sql`SELECT a.url_armazenamento, a.tipo_mime FROM anexos_mensagem a JOIN mensagens m ON m.id = a.mensagem_id WHERE a.mensagem_id = ${messageId} AND m.atendimento_id = ${conversationId} LIMIT 1`;
    if (!rows[0]) return res.status(404).end('Imagem não encontrada');
    const blob = await get(rows[0].url_armazenamento, { access: 'private' });
    if (!blob || blob.statusCode !== 200) return res.status(404).end('Imagem não encontrada');
    res.statusCode = 200;
    res.setHeader('Content-Type', blob.blob.contentType || rows[0].tipo_mime);
    res.setHeader('Cache-Control', 'private, no-cache');
    for await (const chunk of blob.stream) res.write(chunk);
    return res.end();
  } catch (error) {
    console.error('Attachment read failed', error);
    return res.status(500).end('Não foi possível abrir a imagem');
  }
};
