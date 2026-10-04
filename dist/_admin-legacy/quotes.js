const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  if(user.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'Somente administradores podem gerenciar orçamentos.'});
  try{
    const sql=getDatabase();
    const rows=await sql`
      SELECT o.*,m.nome AS montador_nome,m.percentual_repasse,
             gerador.nome_exibicao AS gerado_por_nome,a.atendente_id,a.status AS atendimento_status,
             atendente.nome_exibicao AS atendente_nome
      FROM orcamentos o
      JOIN atendimentos a ON a.id=o.atendimento_id
      LEFT JOIN montadores m ON m.id=o.montador_id
      LEFT JOIN usuarios_atendimento gerador ON gerador.id=o.gerado_por
      LEFT JOIN usuarios_atendimento atendente ON atendente.id=a.atendente_id
      ORDER BY o.agendado_para DESC,o.criado_em DESC LIMIT 1000`;
    const [montadores,atendentes]=await Promise.all([
      sql`SELECT id,nome,telefone,percentual_repasse FROM montadores WHERE ativo=TRUE ORDER BY nome`,
      sql`SELECT id,nome_exibicao FROM usuarios_atendimento WHERE ativo=TRUE ORDER BY nome_exibicao`
    ]);
    return res.status(200).json({orcamentos:rows,montadores,atendentes});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível carregar os orçamentos.'})}
};
