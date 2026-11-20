const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {canManageAll}=require('./_permissions');
module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  const id=String(req.query?.id||'');if(!id)return res.status(400).json({error:'Atendimento não informado.'});
  try{
    const sql=getDatabase();
    const unrestricted=canManageAll(user);
    const rows=await sql`SELECT a.id,a.numero_atendimento,a.nome_cliente,a.telefone,a.status,a.atendente_id,u.nome_exibicao AS atendente_nome,a.detalhes_servico,a.agendado_para,a.valor_servico,a.criado_em,a.atualizado_em FROM atendimentos a LEFT JOIN usuarios_atendimento u ON u.id=a.atendente_id WHERE a.id=${id} AND (${unrestricted} OR a.atendente_id=${user.id} OR (a.atendente_id IS NULL AND a.status NOT IN ('ATENDIMENTO_FINALIZADO','CANCELADO'))) LIMIT 1`;
    if(!rows[0])return res.status(404).json({error:'Atendimento não encontrado.'});
    const mensagens=await sql`SELECT m.id,m.tipo_remetente,m.remetente_id,m.texto,m.criado_em,am.id AS anexo_id,am.url_armazenamento,am.nome_arquivo,am.tipo_mime FROM mensagens m LEFT JOIN anexos_mensagem am ON am.mensagem_id=m.id WHERE m.atendimento_id=${id} ORDER BY m.criado_em ASC`;
    const orcamentos=await sql`SELECT o.*,m.nome AS montador_nome FROM orcamentos o LEFT JOIN montadores m ON m.id=o.montador_id WHERE o.atendimento_id=${id} LIMIT 1`;
    const imagensCliente=await sql`SELECT am.id,am.mensagem_id AS "mensagemId",am.nome_arquivo AS "nomeArquivo",am.tipo_mime AS "tipoMime",m.tipo_remetente AS "origem",m.criado_em AS "enviadaEm" FROM anexos_mensagem am JOIN mensagens m ON m.id=am.mensagem_id WHERE m.atendimento_id=${id} AND m.tipo_remetente IN ('CLIENTE','ATENDENTE') AND am.tipo_mime LIKE 'image/%' ORDER BY m.criado_em,am.criado_em`;
    const imagensOrcamento=orcamentos[0]?await sql`SELECT oi.id,oi.anexo_mensagem_id AS "anexoId",oi.ordem,am.mensagem_id AS "mensagemId",am.nome_arquivo AS "nomeArquivo",am.tipo_mime AS "tipoMime" FROM orcamento_imagens_cliente oi JOIN anexos_mensagem am ON am.id=oi.anexo_mensagem_id WHERE oi.orcamento_id=${orcamentos[0].id} ORDER BY oi.ordem`:[];
    const fotosServico=await sql`SELECT id,nome_arquivo AS "nomeArquivo",tipo_mime AS "tipoMime",capturado_em AS "capturadoEm",criado_em AS "criadoEm" FROM fotos_servico_montador WHERE atendimento_id=${id} ORDER BY criado_em`;
    const atendimento=rows[0],quote=orcamentos[0]||null,active=!['ATENDIMENTO_FINALIZADO','CANCELADO'].includes(atendimento.status),owner=atendimento.atendente_id===user.id||unrestricted;
    const quoteActive=Boolean(quote&&quote.status_orcamento!=='CANCELADO');
    return res.status(200).json({atendimento,mensagens,orcamento:quote,fotosServico,imagensCliente,imagensOrcamento,permissoes:{podeResponder:owner&&active,podeTransferir:owner&&active,podeGerarOrcamento:owner&&active,podeFinalizar:owner&&active&&quoteActive,podeCancelar:owner&&active,podeAtribuirMontador:owner&&active&&quoteActive&&Boolean(quote.aceito_cliente_em),podeCancelarOrcamento:owner&&active&&quoteActive}});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível abrir a conversa.'})}
};
