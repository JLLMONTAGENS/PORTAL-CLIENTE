const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const c=require('../montadores/_core');

module.exports=async function(req,res){
  if(req.method!=='PATCH')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);
  if(!user)return res.status(401).json({error:'Sessão expirada.'});
  if(user.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'Acesso negado.'});
  try{
    const id=String(req.body?.id||''),status=String(req.body?.status||'').toUpperCase();
    if(!['APROVADO','REJEITADO'].includes(status))return res.status(400).json({error:'Revisão inválida.'});
    const sql=getDatabase();
    const doc=(await sql`UPDATE documentos_montador SET status_revisao=${status},revisado_por=${user.id},revisado_em=NOW() WHERE id=${id} AND status_revisao IS DISTINCT FROM ${status} RETURNING *`)[0];
    if(!doc){
      const existing=(await sql`SELECT * FROM documentos_montador WHERE id=${id} LIMIT 1`)[0];
      if(!existing)return res.status(404).json({error:'Documento não encontrado.'});
      return res.status(200).json({documento:existing,alterado:false,mensagem:`Documento já estava ${status==='APROVADO'?'aprovado':'rejeitado'}. Nenhuma nova notificação foi enviada.`});
    }
    const assembler=(await sql`SELECT * FROM montadores WHERE id=${doc.montador_id} LIMIT 1`)[0];
    if(doc.tipo==='CERTIDAO_ANTECEDENTES'){
      const updated=(await sql`UPDATE montadores SET certidao_status=${status},status_cadastro=CASE WHEN ${status}='REJEITADO' THEN 'PENDENTE_DOCUMENTO' ELSE status_cadastro END,atualizado_em=NOW() WHERE id=${doc.montador_id} RETURNING *`)[0];
      if(updated.status_cadastro!==assembler.status_cadastro)await c.notifyStatus(updated,assembler.status_cadastro);
      await c.sendAssemblerEmail(updated.id,updated.email,'CERTIDAO_REVISADA',`Certidão ${status==='APROVADO'?'aprovada':'rejeitada'}`,c.emailLayout('Revisão da certidão',`<p>Olá, ${c.clean(updated.nome_completo||updated.nome)}.</p><p>Sua certidão foi <strong>${status==='APROVADO'?'aprovada':'rejeitada'}</strong>${status==='REJEITADO'?'. Envie um novo documento válido para retomar a análise.':'. A aprovação final do cadastro continua sujeita à análise dos demais dados.'}</p>`));
    }
    await sql`INSERT INTO auditoria_montador (montador_id,ator_tipo,ator_id,acao,detalhes,ip_origem) VALUES (${doc.montador_id},'ADMIN',${user.id},'DOCUMENTO_REVISADO',${JSON.stringify({documentoId:id,tipo:doc.tipo,status})}::jsonb,${c.requestIp(req)})`;
    return res.status(200).json({documento:doc,alterado:true,mensagem:status==='APROVADO'?'Documento aprovado. A notificação foi enviada uma única vez.':'Documento rejeitado. A notificação foi enviada uma única vez.'});
  }catch(error){
    console.error(error);
    return res.status(500).json({error:'Não foi possível revisar o documento.'});
  }
};
