const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const money=value=>{const raw=String(value??'0').trim().replace(/[^\d,.-]/g,'');const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const amount=Number(normalized);return Number.isFinite(amount)&&amount>=0?amount.toFixed(2):null};

module.exports=async function handler(req,res){
  if(req.method!=='PATCH')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  if(user.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'Somente administradores podem gerenciar orçamentos.'});
  try{
    const id=String(req.body?.id||''),montadorId=String(req.body?.montadorId||'').trim()||null;
    const statusPagCliente=String(req.body?.statusPagCliente||''),statusPgMontador=String(req.body?.statusPgMontador||'');
    const adicionalMontador=money(req.body?.adicionalMontador);
    if(!id||!['PENDENTE','PAGO'].includes(statusPagCliente)||!['PENDENTE','PAGO'].includes(statusPgMontador)||adicionalMontador===null)return res.status(400).json({error:'Dados financeiros inválidos.'});
    const sql=getDatabase(),existing=await sql`SELECT * FROM orcamentos WHERE id=${id} LIMIT 1`;
    if(!existing[0])return res.status(404).json({error:'Orçamento não encontrado.'});
    if(existing[0].status_pag_cliente==='PAGO'&&statusPagCliente==='PENDENTE')return res.status(409).json({error:'Um pagamento confirmado não pode voltar para pendente.'});
    if(statusPgMontador==='PAGO'&&!montadorId)return res.status(400).json({error:'Atribua um montador antes de registrar o pagamento.'});
    let percentual=0;if(montadorId){const montadores=await sql`SELECT id,percentual_repasse FROM montadores WHERE id=${montadorId} AND ativo=TRUE LIMIT 1`;if(!montadores[0])return res.status(400).json({error:'Montador inválido ou inativo.'});percentual=Number(montadores[0].percentual_repasse||0)}
    const valorMontador=(Number(existing[0].valor)*percentual/100).toFixed(2);
    const statusOrcamento=statusPagCliente==='PAGO'?'FINALIZADO':montadorId?'MONTADOR_ATRIBUIDO':'GERADO';
    const atendimentoStatus=statusPagCliente==='PAGO'?'SERVICO_FINALIZADO':montadorId?'ATRIBUIDO_MONTADOR':'GEROU_ORCAMENTO';
    const origem=statusPagCliente==='PAGO'?(existing[0].origem_pagamento_cliente||'MANUAL'):null;
    const rows=await sql`UPDATE orcamentos SET montador_alterado_em=CASE WHEN montador_id IS DISTINCT FROM ${montadorId}::uuid THEN NOW() ELSE montador_alterado_em END,montador_id=${montadorId},status_orcamento=${statusOrcamento},status_pag_cliente=${statusPagCliente},status_pg_montador=${statusPgMontador},valor_montador=${valorMontador},adicional_montador=${adicionalMontador},origem_pagamento_cliente=${origem},pago_cliente_em=CASE WHEN ${statusPagCliente}='PAGO' THEN COALESCE(pago_cliente_em,NOW()) ELSE NULL END,finalizado_em=CASE WHEN ${statusPagCliente}='PAGO' THEN COALESCE(finalizado_em,NOW()) ELSE finalizado_em END,pago_montador_em=CASE WHEN ${statusPgMontador}='PAGO' THEN COALESCE(pago_montador_em,NOW()) ELSE NULL END,atualizado_em=NOW() WHERE id=${id} RETURNING *`;
    await sql`UPDATE atendimentos SET montador_id=${montadorId},status=${atendimentoStatus},encerrado_em=CASE WHEN ${atendimentoStatus}='SERVICO_FINALIZADO' THEN COALESCE(encerrado_em,NOW()) ELSE NULL END,atualizado_em=NOW() WHERE id=${existing[0].atendimento_id}`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${existing[0].atendimento_id},'ORCAMENTO_ATUALIZADO',${JSON.stringify({orcamentoId:id,montadorId,statusPagCliente,statusPgMontador,valorMontador,adicionalMontador})}::jsonb)`;
    return res.status(200).json({orcamento:rows[0]});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível atualizar o orçamento.'})}
};
