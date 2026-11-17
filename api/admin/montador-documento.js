const {get}=global.__JLL_VERCEL_BLOB||require('@vercel/blob');
const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {canManageAll}=require('./_permissions');
const c=require('../montadores/_core');

module.exports=async function(req,res){
  const user=await authenticatedUser(req);
  if(!user)return res.status(401).end('Sessão expirada');
  if(!canManageAll(user))return res.status(403).end('Acesso negado');
  const id=String(req.query?.id||'');
  try{
    const sql=getDatabase(),doc=(await sql`SELECT * FROM documentos_montador WHERE id=${id} LIMIT 1`)[0];
    if(!doc)return res.status(404).end('Documento não encontrado');
    await sql`INSERT INTO auditoria_montador (montador_id,ator_tipo,ator_id,acao,detalhes,ip_origem) VALUES (${doc.montador_id},'ADMIN',${user.id},'DOCUMENTO_VISUALIZADO',${JSON.stringify({documentoId:id,tipo:doc.tipo})}::jsonb,${c.requestIp(req)})`;
    const blob=await get(doc.url_armazenamento,{access:'private'});
    if(!blob||blob.statusCode!==200)return res.status(404).end('Documento não encontrado');
    res.statusCode=200;
    res.setHeader('Content-Type',blob.blob.contentType||doc.tipo_mime);
    res.setHeader('Cache-Control','private, no-store');
    res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(doc.nome_arquivo)}`);
    for await(const chunk of blob.stream)res.write(chunk);
    return res.end();
  }catch(error){
    console.error(error);
    return res.status(500).end('Não foi possível abrir o documento');
  }
};
