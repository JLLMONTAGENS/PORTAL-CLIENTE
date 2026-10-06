const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||'').trim(),sql=getDatabase();
    if(!atendimentoId)return res.status(400).json({error:'Atendimento não informado.'});
    const rows=await sql`SELECT id,numero_atendimento,atendente_id,status FROM atendimentos WHERE id=${atendimentoId} LIMIT 1`,atendimento=rows[0];
    if(!atendimento)return res.status(404).json({error:'Atendimento não encontrado.'});
    if(atendimento.status==='SERVICO_FINALIZADO')return res.status(409).json({error:'Atendimentos finalizados não podem ser cancelados.'});
    if(atendimento.status==='CANCELADO')return res.status(409).json({error:'Este atendimento já foi cancelado.'});
    if(user.perfil!=='ADMINISTRADOR'&&atendimento.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável ou um administrador pode cancelar o atendimento.'});
    const existingQuotes=await sql`SELECT id,status_orcamento FROM orcamentos WHERE atendimento_id=${atendimentoId} LIMIT 1`,existingQuote=existingQuotes[0]||null;
    if(existingQuote?.status_orcamento==='FINALIZADO')return res.status(409).json({error:'Este atendimento possui um orçamento finalizado e não pode ser cancelado.'});
    const quotes=existingQuote?await sql`UPDATE orcamentos SET status_orcamento='CANCELADO',link_pagamento=NULL,atualizado_em=NOW() WHERE id=${existingQuote.id} RETURNING id`:[];
    await sql`UPDATE atendimentos SET status='CANCELADO',encerrado_em=COALESCE(encerrado_em,NOW()),atualizado_em=NOW() WHERE id=${atendimentoId}`;
    const message='Atendimento cancelado. Se precisar solicitar um novo serviço, a equipe JLL Montagens permanece à disposição.';
    await sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,texto) VALUES (${atendimentoId},'SISTEMA',${message})`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${atendimentoId},'ATENDIMENTO_CANCELADO',${JSON.stringify({orcamentoId:quotes[0]?.id||null,usuario:user.id})}::jsonb)`;
    return res.status(200).json({ok:true,atendimentoId,orcamentoCancelado:Boolean(quotes[0])});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível cancelar o atendimento.'})}
};
