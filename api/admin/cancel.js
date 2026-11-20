const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {canManageAll}=require('./_permissions');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||'').trim(),sql=getDatabase();
    if(!atendimentoId)return res.status(400).json({error:'Atendimento não informado.'});
    const rows=await sql`SELECT id,numero_atendimento,atendente_id,status FROM atendimentos WHERE id=${atendimentoId} LIMIT 1`,atendimento=rows[0];
    if(!atendimento)return res.status(404).json({error:'Atendimento não encontrado.'});
    if(atendimento.status==='ATENDIMENTO_FINALIZADO')return res.status(409).json({error:'Atendimentos finalizados não podem ser cancelados.'});
    if(atendimento.status==='CANCELADO')return res.status(409).json({error:'Este atendimento já foi cancelado.'});
    if(!canManageAll(user)&&atendimento.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável, gestor ou administrador pode cancelar o atendimento.'});
    const existingQuotes=await sql`SELECT o.id,o.status_orcamento,o.status_pag_cliente,o.status_pg_montador,EXISTS(SELECT 1 FROM pagamentos_montador_itens i WHERE i.orcamento_id=o.id) AS possui_repasse FROM orcamentos o WHERE o.atendimento_id=${atendimentoId} LIMIT 1`,existingQuote=existingQuotes[0]||null;
    if(existingQuote?.status_orcamento==='FINALIZADO')return res.status(409).json({error:'Este atendimento possui um orçamento finalizado e não pode ser cancelado.'});
    if(existingQuote?.status_pag_cliente==='PAGO')return res.status(409).json({error:'O pagamento do cliente já foi confirmado. Regularize o pagamento antes de cancelar.'});
    if(existingQuote?.possui_repasse||existingQuote?.status_pg_montador==='PAGO')return res.status(409).json({error:'Este orçamento já está vinculado a um pagamento de montador e não pode ser cancelado por aqui.'});
    const message='Atendimento cancelado. Se precisar solicitar um novo serviço, a equipe JLL Montagens permanece à disposição.';
    const operations=[];
    if(existingQuote)operations.push(sql`UPDATE orcamentos SET status_orcamento='CANCELADO',link_pagamento=NULL,id_pagamento_externo=NULL,status_execucao_montador=NULL,atribuicao_versao=NULL,montador_id=NULL,atualizado_em=NOW() WHERE id=${existingQuote.id} AND status_orcamento NOT IN ('FINALIZADO','CANCELADO') RETURNING id`);
    operations.push(sql`UPDATE atendimentos SET status='CANCELADO',montador_id=NULL,encerrado_em=COALESCE(encerrado_em,NOW()),atualizado_em=NOW() WHERE id=${atendimentoId} AND status NOT IN ('ATENDIMENTO_FINALIZADO','CANCELADO') RETURNING id`);
    operations.push(sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,texto) VALUES (${atendimentoId},'SISTEMA',${message})`);
    operations.push(sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${atendimentoId},'ATENDIMENTO_CANCELADO',${JSON.stringify({orcamentoId:existingQuote?.id||null,usuario:user.id})}::jsonb)`);
    const results=await sql.transaction(operations);
    const attendanceResult=results[existingQuote?1:0];
    if(!attendanceResult?.[0])return res.status(409).json({error:'O atendimento mudou de situação. Atualize a tela e tente novamente.'});
    return res.status(200).json({ok:true,atendimentoId,orcamentoCancelado:Boolean(existingQuote),mensagem:existingQuote?'Atendimento e orçamento cancelados com sucesso.':'Atendimento cancelado com sucesso.'});
  }catch(error){console.error('Falha ao cancelar atendimento',{atendimentoId:req.body?.atendimentoId,codigo:error?.code,restricao:error?.constraint,mensagem:error?.message});if(error?.code==='23514')return res.status(409).json({error:'A estrutura do banco ainda não permite o status cancelado. Aplique a migração de cancelamento e tente novamente.'});return res.status(500).json({error:'Não foi possível cancelar o atendimento e o orçamento. Nenhuma alteração parcial foi mantida.'})}
};
