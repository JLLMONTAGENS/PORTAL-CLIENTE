const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {canManageAll}=require('./_permissions');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||'').trim(),sql=getDatabase();
    if(!atendimentoId)return res.status(400).json({error:'Atendimento não informado.'});
    const quote=(await sql`SELECT o.*,a.atendente_id,a.status AS atendimento_status,EXISTS(SELECT 1 FROM pagamentos_montador_itens i WHERE i.orcamento_id=o.id) AS possui_repasse FROM orcamentos o JOIN atendimentos a ON a.id=o.atendimento_id WHERE o.atendimento_id=${atendimentoId} LIMIT 1`)[0];
    if(!quote)return res.status(404).json({error:'Orçamento não encontrado.'});
    if(!canManageAll(user)&&quote.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável, gestor ou administrador pode cancelar o orçamento.'});
    if(['SERVICO_FINALIZADO','CANCELADO'].includes(quote.atendimento_status))return res.status(409).json({error:'O atendimento já foi encerrado.'});
    if(quote.status_orcamento==='CANCELADO')return res.status(409).json({error:'Este orçamento já foi cancelado.'});
    if(quote.status_orcamento==='FINALIZADO'||quote.status_pag_cliente==='PAGO')return res.status(409).json({error:'Um orçamento com pagamento confirmado não pode ser cancelado.'});
    if(quote.possui_repasse||quote.status_pg_montador==='PAGO')return res.status(409).json({error:'Este orçamento já está vinculado a um pagamento de montador.'});
    const message=`Orçamento do atendimento #${quote.numero_atendimento} cancelado. O atendimento permanece aberto para um novo orçamento.`;
    await sql.transaction([
      sql`UPDATE orcamentos SET status_orcamento='CANCELADO',montador_id=NULL,status_execucao_montador=NULL,atribuicao_versao=NULL,aceito_montador_em=NULL,link_pagamento=NULL,id_pagamento_externo=NULL,atualizado_em=NOW() WHERE id=${quote.id}`,
      sql`UPDATE atendimentos SET status='PENDENTE',montador_id=NULL,atualizado_em=NOW() WHERE id=${atendimentoId}`,
      sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,texto) VALUES (${atendimentoId},'SISTEMA',${message})`,
      sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${atendimentoId},'ORCAMENTO_CANCELADO',${JSON.stringify({orcamentoId:quote.id,usuario:user.id})}::jsonb)`
    ]);
    return res.status(200).json({ok:true,mensagem:'Orçamento cancelado. O atendimento continua aberto para gerar outro.'});
  }catch(error){console.error('Falha ao cancelar orçamento',error);return res.status(500).json({error:'Não foi possível cancelar somente o orçamento.'})}
};
