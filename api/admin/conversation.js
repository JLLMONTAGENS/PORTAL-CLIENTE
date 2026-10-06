const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  const id=String(req.query?.id||'');if(!id)return res.status(400).json({error:'Atendimento não informado.'});
  try{
    const sql=getDatabase();
    const rows=await sql`SELECT a.id,a.numero_atendimento,a.nome_cliente,a.telefone,a.status,a.atendente_id,u.nome_exibicao AS atendente_nome,a.detalhes_servico,a.agendado_para,a.valor_servico,a.criado_em,a.atualizado_em FROM atendimentos a LEFT JOIN usuarios_atendimento u ON u.id=a.atendente_id WHERE a.id=${id} LIMIT 1`;
    if(!rows[0])return res.status(404).json({error:'Atendimento não encontrado.'});
    const mensagens=await sql`SELECT m.id,m.tipo_remetente,m.remetente_id,m.texto,m.criado_em,am.id AS anexo_id,am.url_armazenamento,am.nome_arquivo,am.tipo_mime FROM mensagens m LEFT JOIN anexos_mensagem am ON am.mensagem_id=m.id WHERE m.atendimento_id=${id} ORDER BY m.criado_em ASC`;
    const orcamentos=await sql`SELECT o.*,m.nome AS montador_nome FROM orcamentos o LEFT JOIN montadores m ON m.id=o.montador_id WHERE o.atendimento_id=${id} LIMIT 1`;
    const atendimento=rows[0],quote=orcamentos[0]||null,active=!['SERVICO_FINALIZADO','CANCELADO'].includes(atendimento.status),owner=user.perfil==='ADMINISTRADOR'||atendimento.atendente_id===user.id;
    return res.status(200).json({atendimento,mensagens,orcamento:quote,permissoes:{podeResponder:owner&&active,podeTransferir:owner&&active,podeGerarOrcamento:owner&&active,podeFinalizar:owner&&active&&Boolean(quote),podeCancelar:owner&&active}});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível abrir a conversa.'})}
};
