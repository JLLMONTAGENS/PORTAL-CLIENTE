const {put}=require('@vercel/blob');
const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

const allowedTypes=new Set(['image/jpeg','image/png','image/webp','application/pdf']);
const hasValidSignature=(buffer,mimeType)=>{
  if(mimeType==='application/pdf')return buffer.subarray(0,5).toString()==='%PDF-';
  if(mimeType==='image/jpeg')return buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff;
  if(mimeType==='image/png')return buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]));
  if(mimeType==='image/webp')return buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP';
  return false;
};

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||'').trim();
    const mimeType=String(req.body?.mimeType||'').toLowerCase();
    const fileName=String(req.body?.fileName||'anexo').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,120);
    const encoded=String(req.body?.data||'');
    if(!atendimentoId||!allowedTypes.has(mimeType)||!encoded)return res.status(400).json({error:'Selecione uma imagem ou um arquivo PDF válido.'});
    const fileBuffer=Buffer.from(encoded,'base64');
    const maxBytes=3*1024*1024;
    if(!fileBuffer.length||fileBuffer.length>maxBytes)return res.status(413).json({error:'O arquivo deve ter no máximo 3 MB.'});
    if(!hasValidSignature(fileBuffer,mimeType))return res.status(400).json({error:'O conteúdo do arquivo não corresponde ao formato informado.'});
    const sql=getDatabase();
    const allowed=await sql`SELECT id,atendente_id,status FROM atendimentos WHERE id=${atendimentoId} LIMIT 1`;
    if(!allowed[0]||['SERVICO_FINALIZADO','CANCELADO'].includes(allowed[0].status))return res.status(404).json({error:'Atendimento não encontrado ou encerrado.'});
    if(allowed[0].atendente_id!==user.id&&user.perfil!=='ADMINISTRADOR')return res.status(409).json({error:'Assuma ou receba este atendimento antes de enviar anexos.'});
    const blob=await put(`atendimentos/${atendimentoId}/${Date.now()}-${fileName}`,fileBuffer,{access:'private',contentType:mimeType,addRandomSuffix:true});
    const label=mimeType==='application/pdf'?`Documento enviado: ${fileName}`:'Imagem enviada';
    const messages=await sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,remetente_id,texto) VALUES (${atendimentoId},'ATENDENTE',${user.id},${label}) RETURNING id,tipo_remetente,remetente_id,texto,criado_em`;
    const message=messages[0];
    const attachments=await sql`INSERT INTO anexos_mensagem (mensagem_id,url_armazenamento,nome_arquivo,tipo_mime,tamanho_bytes) VALUES (${message.id},${blob.url},${fileName},${mimeType},${fileBuffer.length}) RETURNING id`;
    await sql`UPDATE atendimentos SET atualizado_em=NOW() WHERE id=${atendimentoId}`;
    return res.status(201).json({mensagem:{...message,anexo_id:attachments[0].id,nome_arquivo:fileName,tipo_mime:mimeType},anexo:{nomeArquivo:fileName,tipoMime:mimeType,tamanho:fileBuffer.length}});
  }catch(error){console.error('Admin attachment upload failed',error);return res.status(500).json({error:'Não foi possível enviar o anexo.'})}
};
