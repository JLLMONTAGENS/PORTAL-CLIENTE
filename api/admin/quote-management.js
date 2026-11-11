const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {canManageAll}=require('./_permissions');
const {notifyAssignment}=require('../montadores/_push');
const money=value=>{const raw=String(value??'0').trim().replace(/[^\d,.-]/g,'');const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const amount=Number(normalized);return Number.isFinite(amount)&&amount>=0?amount.toFixed(2):null};

module.exports=async function handler(req,res){
  if(req.method!=='PATCH')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  if(!canManageAll(user))return res.status(403).json({error:'Somente gestores e administradores podem gerenciar orçamentos.'});
  try{
    const id=String(req.body?.id||''),montadorId=String(req.body?.montadorId||'').trim()||null;
    const statusPagCliente=String(req.body?.statusPagCliente||''),statusPgMontador=String(req.body?.statusPgMontador||'');
    const adicionalMontador=money(req.body?.adicionalMontador);
    if(!id||!['PENDENTE','PAGO'].includes(statusPagCliente)||!['PENDENTE','PAGO'].includes(statusPgMontador)||adicionalMontador===null)return res.status(400).json({error:'Dados financeiros inválidos.'});
    const sql=getDatabase(),existing=await sql`SELECT o.*,a.atendente_id FROM orcamentos o JOIN atendimentos a ON a.id=o.atendimento_id WHERE o.id=${id} LIMIT 1`;
    if(!existing[0])return res.status(404).json({error:'Orçamento não encontrado.'});
    if(existing[0].status_orcamento==='CANCELADO')return res.status(409).json({error:'Orçamentos cancelados são somente para consulta.'});
    if(existing[0].status_pag_cliente==='PAGO'&&statusPagCliente==='PENDENTE')return res.status(409).json({error:'Um pagamento confirmado não pode voltar para pendente.'});
    if(statusPgMontador==='PAGO'&&!montadorId)return res.status(400).json({error:'Atribua um montador antes de registrar o pagamento.'});
    let percentual=0;if(montadorId){const montadores=await sql`SELECT id,percentual_repasse FROM montadores WHERE id=${montadorId} AND ativo=TRUE LIMIT 1`;if(!montadores[0])return res.status(400).json({error:'Montador inválido ou inativo.'});percentual=Number(montadores[0].percentual_repasse||0)}
    const valorMontador=(Number(existing[0].valor)*percentual/100).toFixed(2);
    const totalMontador=(Number(valorMontador)+Number(adicionalMontador)).toFixed(2);
    if(statusPgMontador==='PAGO'&&existing[0].status_pg_montador!=='PAGO'){
      const nfse=(await sql`SELECT id FROM documentos_montador WHERE montador_id=${montadorId} AND tipo='NOTA_FISCAL_SERVICO' AND status_revisao='APROVADO' AND valor_total=${totalMontador} AND (referencia_pagamento=${String(existing[0].numero_atendimento)} OR referencia_pagamento=${id}) LIMIT 1`)[0];if(!nfse)return res.status(409).json({error:`O repasse de R$ ${totalMontador.replace('.',',')} exige NFS-e aprovada pelo valor total, referenciada pelo atendimento ${existing[0].numero_atendimento}.`});
    }
    const statusOrcamento=statusPagCliente==='PAGO'?'FINALIZADO':montadorId?'MONTADOR_ATRIBUIDO':'GERADO';
    const atendimentoStatus=statusPagCliente==='PAGO'?'SERVICO_FINALIZADO':montadorId?'ATRIBUIDO_MONTADOR':'GEROU_ORCAMENTO';
    const origem=statusPagCliente==='PAGO'?(existing[0].origem_pagamento_cliente||'MANUAL'):null;
    const rows=await sql`UPDATE orcamentos SET montador_alterado_em=CASE WHEN montador_id IS DISTINCT FROM ${montadorId}::uuid THEN NOW() ELSE montador_alterado_em END,status_execucao_montador=CASE WHEN montador_id IS DISTINCT FROM ${montadorId}::uuid THEN CASE WHEN ${montadorId}::uuid IS NULL THEN NULL ELSE 'PENDENTE_ACEITE' END ELSE status_execucao_montador END,atribuicao_versao=CASE WHEN montador_id IS DISTINCT FROM ${montadorId}::uuid THEN CASE WHEN ${montadorId}::uuid IS NULL THEN NULL ELSE gen_random_uuid() END ELSE atribuicao_versao END,aceito_montador_em=CASE WHEN montador_id IS DISTINCT FROM ${montadorId}::uuid THEN NULL ELSE aceito_montador_em END,montador_id=${montadorId},status_orcamento=${statusOrcamento},status_pag_cliente=${statusPagCliente},status_pg_montador=${statusPgMontador},valor_montador=${valorMontador},adicional_montador=${adicionalMontador},origem_pagamento_cliente=${origem},pago_cliente_em=CASE WHEN ${statusPagCliente}='PAGO' THEN COALESCE(pago_cliente_em,NOW()) ELSE NULL END,finalizado_em=CASE WHEN ${statusPagCliente}='PAGO' THEN COALESCE(finalizado_em,NOW()) ELSE finalizado_em END,pago_montador_em=CASE WHEN ${statusPgMontador}='PAGO' THEN COALESCE(pago_montador_em,NOW()) ELSE NULL END,atualizado_em=NOW() WHERE id=${id} RETURNING *`;
    await sql`UPDATE atendimentos SET montador_id=${montadorId},status=${atendimentoStatus},encerrado_em=CASE WHEN ${atendimentoStatus}='SERVICO_FINALIZADO' THEN COALESCE(encerrado_em,NOW()) ELSE NULL END,atualizado_em=NOW() WHERE id=${existing[0].atendimento_id}`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${existing[0].atendimento_id},'ORCAMENTO_ATUALIZADO',${JSON.stringify({orcamentoId:id,montadorId,statusPagCliente,statusPgMontador,valorMontador,adicionalMontador})}::jsonb)`;
    if(montadorId&&existing[0].montador_id!==montadorId)await notifyAssignment({montadorId,orcamentoId:id,numeroAtendimento:existing[0].numero_atendimento,descricaoServico:existing[0].descricao_servico,bairro:existing[0].bairro,cidade:existing[0].cidade,valorRepasse:totalMontador,agendadoPara:existing[0].agendado_para});
    return res.status(200).json({orcamento:rows[0]});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível atualizar o orçamento.'})}
};
