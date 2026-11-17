const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {canManageAll}=require('./_permissions');

module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const sql=getDatabase();
    const unrestricted=canManageAll(user);
    const rows=await sql`
      SELECT o.*,m.nome AS montador_nome,m.percentual_repasse,pmi.pagamento_id,
             gerador.nome_exibicao AS gerado_por_nome,a.atendente_id,a.status AS atendimento_status,
             atendente.nome_exibicao AS atendente_nome,(pmi.pagamento_id IS NOT NULL) AS pagamento_gerado,
             COALESCE((SELECT json_agg(json_build_object('id',f.id,'nomeArquivo',f.nome_arquivo,'tipoMime',f.tipo_mime,'capturadoEm',f.capturado_em,'criadoEm',f.criado_em) ORDER BY f.criado_em) FROM fotos_servico_montador f WHERE f.orcamento_id=o.id),'[]'::json) AS fotos_servico
      FROM orcamentos o
      JOIN atendimentos a ON a.id=o.atendimento_id
      LEFT JOIN montadores m ON m.id=o.montador_id
      LEFT JOIN usuarios_atendimento gerador ON gerador.id=o.gerado_por
      LEFT JOIN usuarios_atendimento atendente ON atendente.id=a.atendente_id
      LEFT JOIN pagamentos_montador_itens pmi ON pmi.orcamento_id=o.id
      WHERE (${unrestricted} OR o.gerado_por=${user.id} OR a.atendente_id=${user.id})
      ORDER BY o.agendado_para DESC,o.criado_em DESC LIMIT 1000`;
    const [montadores,atendentes]=await Promise.all([
      sql`SELECT id,nome,telefone,percentual_repasse FROM montadores WHERE ativo=TRUE ORDER BY nome`,
      sql`SELECT id,nome_exibicao FROM usuarios_atendimento WHERE ativo=TRUE ORDER BY nome_exibicao`
    ]);
    return res.status(200).json({orcamentos:rows,montadores,atendentes,podeGerarPagamentos:unrestricted});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível carregar os orçamentos.'})}
};
