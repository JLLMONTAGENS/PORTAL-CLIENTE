const crypto=require('crypto');
const {getDatabase}=require('../_db');

const authorized=req=>{
  const expected=String(process.env.PAYMENT_WEBHOOK_SECRET||''),provided=String(req.headers?.['x-jll-payment-secret']||'');
  const expectedBuffer=Buffer.from(expected),providedBuffer=Buffer.from(provided);if(!expected||expectedBuffer.length!==providedBuffer.length)return false;
  return crypto.timingSafeEqual(expectedBuffer,providedBuffer);
};

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  if(!authorized(req))return res.status(401).json({error:'Webhook não autorizado.'});
  try{
    const orcamentoId=String(req.body?.orcamentoId||'').trim()||null,idPagamentoExterno=String(req.body?.idPagamentoExterno||'').trim()||null;
    const provedor=String(req.body?.provedor||'').trim()||null,linkPagamento=String(req.body?.linkPagamento||'').trim()||null,status=String(req.body?.status||'').toUpperCase();
    if((!orcamentoId&&!idPagamentoExterno)||!['PENDENTE','PAGO'].includes(status))return res.status(400).json({error:'Identificação ou status de pagamento inválido.'});
    const sql=getDatabase(),rows=await sql`SELECT id,atendimento_id FROM orcamentos WHERE (${orcamentoId}::text IS NOT NULL AND id::text=${orcamentoId}) OR (${idPagamentoExterno}::text IS NOT NULL AND id_pagamento_externo=${idPagamentoExterno}) LIMIT 1`,quote=rows[0];
    if(!quote)return res.status(404).json({error:'Orçamento não encontrado.'});
    if(status==='PENDENTE'){
      await sql`UPDATE orcamentos SET provedor_pagamento=COALESCE(${provedor},provedor_pagamento),id_pagamento_externo=COALESCE(${idPagamentoExterno},id_pagamento_externo),link_pagamento=COALESCE(${linkPagamento},link_pagamento),atualizado_em=NOW() WHERE id=${quote.id}`;
      return res.status(200).json({ok:true,finalizado:false});
    }
    await sql`UPDATE orcamentos SET status_orcamento='FINALIZADO',status_pag_cliente='PAGO',origem_pagamento_cliente='LINK',provedor_pagamento=COALESCE(${provedor},provedor_pagamento),id_pagamento_externo=COALESCE(${idPagamentoExterno},id_pagamento_externo),link_pagamento=COALESCE(${linkPagamento},link_pagamento),pago_cliente_em=COALESCE(pago_cliente_em,NOW()),atualizado_em=NOW() WHERE id=${quote.id}`;
    await sql`UPDATE atendimentos SET status='SERVICO_FINALIZADO',encerrado_em=COALESCE(encerrado_em,NOW()),atualizado_em=NOW() WHERE id=${quote.atendimento_id}`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${quote.atendimento_id},'PAGAMENTO_CLIENTE_CONFIRMADO',${JSON.stringify({orcamentoId:quote.id,provedor,idPagamentoExterno,origem:'LINK'})}::jsonb)`;
    return res.status(200).json({ok:true,finalizado:true});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível confirmar o pagamento.'})}
};
