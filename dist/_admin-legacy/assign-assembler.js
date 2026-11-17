const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||'').trim();
    const montadorId=String(req.body?.montadorId||'').trim()||null;
    if(!atendimentoId)return res.status(400).json({error:'Atendimento não informado.'});
    const sql=getDatabase();
    const rows=await sql`SELECT a.id,a.atendente_id,a.status,o.id AS orcamento_id,o.valor,o.montador_id FROM atendimentos a LEFT JOIN orcamentos o ON o.atendimento_id=a.id WHERE a.id=${atendimentoId} LIMIT 1`;
    const atendimento=rows[0];
    if(!atendimento)return res.status(404).json({error:'Atendimento não encontrado.'});
    if(['SERVICO_FINALIZADO','CANCELADO'].includes(atendimento.status))return res.status(409).json({error:'O atendimento já foi encerrado.'});
    if(user.perfil!=='ADMINISTRADOR'&&atendimento.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável pelo atendimento pode atribuir o montador.'});
    if(!atendimento.orcamento_id)return res.status(409).json({error:'Gere o orçamento antes de atribuir o montador.'});
    let percentual=0;
    if(montadorId){
      const montadores=await sql`SELECT id,percentual_repasse FROM montadores WHERE id=${montadorId} AND ativo=TRUE LIMIT 1`;
      if(!montadores[0])return res.status(400).json({error:'Montador inválido ou inativo.'});
      percentual=Number(montadores[0].percentual_repasse||0);
    }
    const valorMontador=(Number(atendimento.valor||0)*percentual/100).toFixed(2);
    const statusOrcamento=montadorId?'MONTADOR_ATRIBUIDO':'GERADO';
    const statusAtendimento=montadorId?'ATRIBUIDO_MONTADOR':'GEROU_ORCAMENTO';
    const orcamento=await sql`UPDATE orcamentos SET montador_alterado_em=CASE WHEN montador_id IS DISTINCT FROM ${montadorId}::uuid THEN NOW() ELSE montador_alterado_em END,montador_id=${montadorId},status_orcamento=${statusOrcamento},valor_montador=${valorMontador},atualizado_em=NOW() WHERE id=${atendimento.orcamento_id} RETURNING *`;
    await sql`UPDATE atendimentos SET montador_id=${montadorId},status=${statusAtendimento},atualizado_em=NOW() WHERE id=${atendimentoId}`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${atendimentoId},${montadorId?'MONTADOR_ATRIBUIDO':'MONTADOR_REMOVIDO'},${JSON.stringify({orcamentoId:atendimento.orcamento_id,montadorId,valorMontador,origem:'CONVERSA_INTERNA'})}::jsonb)`;
    return res.status(200).json({orcamento:orcamento[0]});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível atribuir o montador.'})}
};
