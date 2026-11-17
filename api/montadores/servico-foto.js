const {put}=global.__JLL_VERCEL_BLOB||require('@vercel/blob');
const {getDatabase}=require('../_db');const c=require('./_core');
const signatures={'image/jpeg':buffer=>buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff,'image/png':buffer=>buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'image/webp':buffer=>buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'};
module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});const assembler=await c.currentAssembler(req);if(!assembler)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const sql=getDatabase(),id=String(req.body?.id||''),key=String(req.body?.operacaoId||req.headers['x-idempotency-key']||'').trim();
    if(key){const existing=(await sql`SELECT * FROM fotos_servico_montador WHERE montador_id=${assembler.id} AND chave_idempotencia=${key} LIMIT 1`)[0];if(existing)return res.status(200).json({foto:{id:existing.id,nomeArquivo:existing.nome_arquivo},repetida:true})}
    const service=(await sql`SELECT o.id,o.atendimento_id,o.status_execucao_montador FROM orcamentos o WHERE o.id=${id} AND o.montador_id=${assembler.id} LIMIT 1`)[0];if(!service)return res.status(404).json({error:'Serviço não encontrado.'});
    if(!['ACEITO','EM_EXECUCAO'].includes(service.status_execucao_montador))return res.status(409).json({error:'As fotos são liberadas depois do aceite e antes da conclusão.'});
    const mime=String(req.body?.mimeType||'').toLowerCase(),check=signatures[mime],buffer=Buffer.from(String(req.body?.data||''),'base64'),fileName=String(req.body?.fileName||'foto').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,120);
    if(!check||!buffer.length||buffer.length>6*1024*1024||!check(buffer))return res.status(400).json({error:'Envie uma imagem JPEG, PNG ou WebP válida de até 6 MB.'});
    const blob=await put(`montadores/${assembler.id}/servicos/${id}/${Date.now()}-${fileName}`,buffer,{access:'private',contentType:mime,addRandomSuffix:true});
    const photo=(await sql`INSERT INTO fotos_servico_montador (atendimento_id,orcamento_id,montador_id,url_armazenamento,nome_arquivo,tipo_mime,tamanho_bytes,chave_idempotencia,capturado_em) VALUES (${service.atendimento_id},${id},${assembler.id},${blob.url},${fileName},${mime},${buffer.length},${key||null},${req.body?.capturadoEm||null}) RETURNING id,nome_arquivo,criado_em`)[0];
    await sql`INSERT INTO auditoria_montador (montador_id,ator_tipo,ator_id,acao,detalhes,ip_origem) VALUES (${assembler.id},'MONTADOR',${assembler.id},'FOTO_SERVICO_ENVIADA',${JSON.stringify({orcamentoId:id,fotoId:photo.id})}::jsonb,${c.requestIp(req)})`;
    return res.status(201).json({foto:{id:photo.id,nomeArquivo:photo.nome_arquivo,criadoEm:photo.criado_em}});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível enviar a foto do serviço.'})}
};
