const {getDatabase,normalizePhone}=require('../_db');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const conversationId=String(req.body?.conversationId||'').trim();
  const phone=normalizePhone(req.body?.phone);
  if(!conversationId||phone.length<12)return res.status(400).json({error:'Atendimento ou telefone inválido.'});
  try{
    const sql=getDatabase();
    const rows=await sql`SELECT o.id,o.atendimento_id,o.aceito_cliente_em,o.status_orcamento,a.numero_atendimento,a.nome_cliente,a.atendente_id,a.status AS atendimento_status FROM orcamentos o JOIN atendimentos a ON a.id=o.atendimento_id WHERE a.id=${conversationId} AND a.telefone=${phone} LIMIT 1`;
    const quote=rows[0];
    if(!quote)return res.status(404).json({error:'Orçamento não encontrado para este atendimento.'});
    if(quote.status_orcamento==='CANCELADO'||quote.atendimento_status==='CANCELADO')return res.status(409).json({error:'Este orçamento foi cancelado e não pode ser aceito.'});
    if(quote.status_orcamento==='FINALIZADO'||quote.atendimento_status==='SERVICO_FINALIZADO')return res.status(409).json({error:'Este atendimento já foi finalizado.'});
    if(quote.aceito_cliente_em)return res.status(200).json({ok:true,alreadyAccepted:true,acceptedAt:quote.aceito_cliente_em});
    const updated=(await sql`UPDATE orcamentos SET aceito_cliente_em=NOW(),atualizado_em=NOW() WHERE id=${quote.id} AND aceito_cliente_em IS NULL RETURNING aceito_cliente_em`)[0];
    if(!updated){const current=(await sql`SELECT aceito_cliente_em FROM orcamentos WHERE id=${quote.id} LIMIT 1`)[0];return res.status(200).json({ok:true,alreadyAccepted:true,acceptedAt:current?.aceito_cliente_em||null})}
    const message=`Orçamento do atendimento #${quote.numero_atendimento} aceito pelo cliente.`;
    await Promise.all([sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${quote.atendimento_id},'ORCAMENTO_ACEITO_CLIENTE',${JSON.stringify({orcamentoId:quote.id,origem:'PORTAL_CLIENTE'})}::jsonb)`,sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,texto) VALUES (${quote.atendimento_id},'SISTEMA',${message})`]);
    try{const {notifyAttendance}=require('../_push');await notifyAttendance({atendimentoId:quote.atendimento_id,tipo:'ORCAMENTO_ACEITO_CLIENTE',titulo:'Orçamento aceito',mensagem:`${quote.nome_cliente} aceitou o orçamento do atendimento #${quote.numero_atendimento}.`,usuarioId:quote.atendente_id||null})}catch(pushError){console.error('Push de aceite do orçamento não enviado',pushError)}
    return res.status(200).json({ok:true,alreadyAccepted:false,acceptedAt:updated.aceito_cliente_em});
  }catch(error){console.error('Quote acceptance failed',error);return res.status(500).json({error:'Não foi possível registrar o aceite do orçamento.'})}
};
