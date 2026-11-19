const {get}=global.__JLL_VERCEL_BLOB||require('@vercel/blob');
const {getDatabase}=require('../_db');
const c=require('./_core');

module.exports=async function(req,res){
  if(req.method!=='GET')return res.status(405).end('Método não permitido');
  const assembler=await c.currentAssembler(req);if(!assembler)return res.status(401).end('Sessão expirada');
  const id=String(req.query?.id||'');if(!id)return res.status(400).end('Imagem não informada');
  try{
    const sql=getDatabase(),image=(await sql`SELECT oi.id,oi.orcamento_id,am.url_armazenamento,am.nome_arquivo,am.tipo_mime FROM orcamento_imagens_cliente oi JOIN orcamentos o ON o.id=oi.orcamento_id JOIN anexos_mensagem am ON am.id=oi.anexo_mensagem_id WHERE oi.id=${id} AND o.montador_id=${assembler.id} LIMIT 1`)[0];
    if(!image)return res.status(404).end('Imagem não encontrada ou não vinculada a um serviço seu');
    const blob=await get(image.url_armazenamento,{access:'private'});if(!blob||blob.statusCode!==200)return res.status(404).end('Imagem não encontrada');
    res.statusCode=200;res.setHeader('Content-Type',blob.blob.contentType||image.tipo_mime);res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(image.nome_arquivo)}`);
    for await(const chunk of blob.stream)res.write(chunk);return res.end();
  }catch(error){console.error(error);return res.status(500).end('Não foi possível abrir a imagem do orçamento')}
};
