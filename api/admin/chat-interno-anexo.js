const {get}=global.__JLL_VERCEL_BLOB||require('@vercel/blob');
const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).end();
  const user=await authenticatedUser(req);if(!user)return res.status(401).end('Sessão expirada.');
  try{
    const id=String(req.query?.mensagemId||''),sql=getDatabase();
    const rows=await sql`SELECT COALESCE(ai.url_armazenamento,ae.url_armazenamento) AS url_armazenamento,COALESCE(ai.tipo_mime,ae.tipo_mime) AS tipo_mime,COALESCE(ai.nome_arquivo,ae.nome_arquivo) AS nome_arquivo FROM mensagens_internas mi LEFT JOIN anexos_mensagem_interna ai ON ai.mensagem_id=mi.id LEFT JOIN anexos_mensagem ae ON ae.mensagem_id=mi.mensagem_origem_id WHERE mi.id=${id} AND (mi.remetente_id=${user.id} OR mi.destinatario_id=${user.id}) AND COALESCE(ai.id,ae.id) IS NOT NULL LIMIT 1`;
    if(!rows[0])return res.status(404).end('Imagem não encontrada.');
    const blob=await get(rows[0].url_armazenamento,{access:'private'});if(!blob||blob.statusCode!==200)return res.status(404).end('Imagem não encontrada.');
    res.statusCode=200;res.setHeader('Content-Type',blob.blob.contentType||rows[0].tipo_mime);res.setHeader('Cache-Control','private, no-cache');for await(const chunk of blob.stream)res.write(chunk);return res.end();
  }catch(error){console.error('Internal attachment failed',error);return res.status(500).end('Não foi possível abrir a imagem.')}
};
