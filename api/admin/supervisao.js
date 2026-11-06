const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {ensureChatSchema}=require('./_chat-schema');

module.exports=async function handler(req,res){
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  if(user.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'A supervisão é exclusiva para administradores.'});
  const sql=getDatabase();
  try{
    await ensureChatSchema(sql);
    if(req.method==='GET'&&req.query?.atendimentoId){
      const id=String(req.query.atendimentoId),rows=await sql`SELECT a.*,u.nome_exibicao AS atendente_nome FROM atendimentos a LEFT JOIN usuarios_atendimento u ON u.id=a.atendente_id WHERE a.id=${id} LIMIT 1`;
      if(!rows[0])return res.status(404).json({error:'Atendimento não encontrado.'});
      const mensagens=await sql`SELECT m.id,m.tipo_remetente,m.remetente_id,m.texto,m.criado_em,am.id AS anexo_id,am.nome_arquivo,am.tipo_mime FROM mensagens m LEFT JOIN anexos_mensagem am ON am.mensagem_id=m.id WHERE m.atendimento_id=${id} ORDER BY m.criado_em`;
      return res.status(200).json({atendimento:rows[0],mensagens});
    }
    if(req.method==='GET'&&req.query?.usuarioId){
      const id=String(req.query.usuarioId),rows=await sql`SELECT a.id,a.numero_atendimento,a.nome_cliente,a.telefone,a.status,a.atualizado_em FROM atendimentos a WHERE a.atendente_id=${id} AND a.status NOT IN ('SERVICO_FINALIZADO','CANCELADO') ORDER BY a.atualizado_em DESC`;
      return res.status(200).json({atendimentos:rows});
    }
    if(req.method==='GET'){
      const rows=await sql`SELECT u.id,u.nome_exibicao,u.login,u.perfil,COALESCE(p.origem,'WEB') AS origem,p.ultima_atividade_em,(p.ultima_atividade_em>NOW()-INTERVAL '90 seconds') AS online,COUNT(a.id)::int AS atendimentos_ativos FROM usuarios_atendimento u LEFT JOIN usuarios_presenca p ON p.usuario_id=u.id LEFT JOIN atendimentos a ON a.atendente_id=u.id AND a.status NOT IN ('SERVICO_FINALIZADO','CANCELADO') WHERE u.ativo=TRUE GROUP BY u.id,p.origem,p.ultima_atividade_em ORDER BY online DESC,u.nome_exibicao`;
      return res.status(200).json({usuarios:rows});
    }
    if(req.method==='POST'){
      const atendimentoId=String(req.body?.atendimentoId||''),texto=String(req.body?.texto||'').trim();
      if(!atendimentoId||!texto)return res.status(400).json({error:'Mensagem vazia.'});
      const allowed=(await sql`SELECT id,status FROM atendimentos WHERE id=${atendimentoId} LIMIT 1`)[0];
      if(!allowed)return res.status(404).json({error:'Atendimento não encontrado.'});
      if(['SERVICO_FINALIZADO','CANCELADO'].includes(allowed.status))return res.status(409).json({error:'Atendimento encerrado.'});
      const message=(await sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,remetente_id,texto) VALUES (${atendimentoId},'ATENDENTE',${user.id},${texto}) RETURNING id,tipo_remetente,remetente_id,texto,criado_em`)[0];
      await sql`UPDATE atendimentos SET atualizado_em=NOW() WHERE id=${atendimentoId}`;
      return res.status(201).json({mensagem:message});
    }
    return res.status(405).json({error:'Método não permitido'});
  }catch(error){console.error('Supervision failed',error);return res.status(500).json({error:'Não foi possível carregar a supervisão.'})}
};
