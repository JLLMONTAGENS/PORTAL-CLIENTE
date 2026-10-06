const {getDatabase}=require('../_db');

async function completePayment({quoteId,provider,externalId}){
  const sql=getDatabase(),rows=await sql`SELECT o.id,o.atendimento_id,o.status_pag_cliente,o.status_orcamento,a.status AS atendimento_status FROM orcamentos o JOIN atendimentos a ON a.id=o.atendimento_id WHERE o.id=${quoteId} LIMIT 1`,quote=rows[0];
  if(!quote)return{found:false,finalized:false};
  if(quote.status_orcamento==='CANCELADO'||quote.atendimento_status==='CANCELADO')return{found:true,finalized:false,cancelled:true};
  await sql`UPDATE orcamentos SET status_orcamento='FINALIZADO',status_pag_cliente='PAGO',origem_pagamento_cliente='LINK',provedor_pagamento=${provider},id_pagamento_externo=COALESCE(${externalId},id_pagamento_externo),pago_cliente_em=COALESCE(pago_cliente_em,NOW()),finalizado_em=COALESCE(finalizado_em,NOW()),atualizado_em=NOW() WHERE id=${quote.id}`;
  await sql`UPDATE atendimentos SET status='SERVICO_FINALIZADO',encerrado_em=COALESCE(encerrado_em,NOW()),atualizado_em=NOW() WHERE id=${quote.atendimento_id}`;
  if(quote.status_pag_cliente!=='PAGO')await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${quote.atendimento_id},'PAGAMENTO_CLIENTE_CONFIRMADO',${JSON.stringify({orcamentoId:quote.id,provedor:provider,idPagamentoExterno:externalId,origem:'LINK'})}::jsonb)`;
  return{found:true,finalized:true};
}

module.exports={completePayment};
