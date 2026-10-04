const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||''),sql=getDatabase();
    const atendimentos=await sql`SELECT id,atendente_id,status FROM atendimentos WHERE id=${atendimentoId} LIMIT 1`,atendimento=atendimentos[0];
    if(!atendimento)return res.status(404).json({error:'Atendimento não encontrado.'});
    if(user.perfil!=='ADMINISTRADOR'&&atendimento.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável pode finalizar o atendimento.'});
    const rows=await sql`UPDATE orcamentos SET status_orcamento='FINALIZADO',status_pag_cliente='PAGO',origem_pagamento_cliente=COALESCE(origem_pagamento_cliente,'MANUAL'),pago_cliente_em=COALESCE(pago_cliente_em,NOW()),finalizado_em=COALESCE(finalizado_em,NOW()),atualizado_em=NOW() WHERE atendimento_id=${atendimentoId} RETURNING *`;
    if(!rows[0])return res.status(409).json({error:'Gere o orçamento antes de finalizar o atendimento.'});
    await sql`UPDATE atendimentos SET status='SERVICO_FINALIZADO',encerrado_em=COALESCE(encerrado_em,NOW()),atualizado_em=NOW() WHERE id=${atendimentoId}`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${atendimentoId},'ATENDIMENTO_FINALIZADO',${JSON.stringify({orcamentoId:rows[0].id,pagamentoCliente:'PAGO',origem:'MANUAL',usuario:user.id})}::jsonb)`;
    return res.status(200).json({ok:true,orcamento:rows[0]});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível finalizar o atendimento.'})}
};
