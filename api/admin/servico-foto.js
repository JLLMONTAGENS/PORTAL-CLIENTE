const {get}=global.__JLL_VERCEL_BLOB||require('@vercel/blob');
const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const c=require('../montadores/_core');

module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).end('Método não permitido');
  const user=await authenticatedUser(req);if(!user)return res.status(401).end('Sessão expirada');
  const id=String(req.query?.id||'');if(!id)return res.status(400).end('Imagem não informada');
  try{
    const sql=getDatabase(),photo=(await sql`SELECT f.*,o.numero_atendimento FROM fotos_servico_montador f JOIN orcamentos o ON o.id=f.orcamento_id WHERE f.id=${id} LIMIT 1`)[0];
    if(!photo)return res.status(404).end('Imagem não encontrada');
    await sql`INSERT INTO auditoria_montador (montador_id,ator_tipo,ator_id,acao,detalhes,ip_origem) VALUES (${photo.montador_id},'ADMIN',${user.id},'FOTO_SERVICO_VISUALIZADA',${JSON.stringify({fotoId:id,orcamentoId:photo.orcamento_id,atendimento:photo.numero_atendimento})}::jsonb,${c.requestIp(req)})`;
    const blob=await get(photo.url_armazenamento,{access:'private'});if(!blob||blob.statusCode!==200)return res.status(404).end('Imagem não encontrada');
    res.statusCode=200;res.setHeader('Content-Type',blob.blob.contentType||photo.tipo_mime);res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(photo.nome_arquivo)}`);
    for await(const chunk of blob.stream)res.write(chunk);return res.end();
  }catch(error){console.error(error);return res.status(500).end('Não foi possível abrir a imagem do serviço')}
};
