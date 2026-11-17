const {getDatabase}=require('../_db');
const {authenticatedUser,hashPassword}=require('./_auth');

const validLogin=value=>/^[a-zA-Z0-9._@-]{3,80}$/.test(value);
const publicUser=row=>({id:row.id,nomeExibicao:row.nome_exibicao,nomeCompleto:row.nome_completo,login:row.login,perfil:row.perfil,ativo:row.ativo,criadoEm:row.criado_em});

module.exports=async function handler(req,res){
  const session=await authenticatedUser(req);
  if(!session)return res.status(401).json({error:'Sessão expirada.'});
  if(session.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'Somente administradores podem gerenciar usuários.'});
  const sql=getDatabase();
  try{
    if(req.method==='GET'){
      const rows=await sql`SELECT id,nome_exibicao,nome_completo,login,perfil,ativo,criado_em FROM usuarios_atendimento ORDER BY ativo DESC,nome_exibicao ASC`;
      return res.status(200).json({usuarios:rows.map(publicUser)});
    }
    if(req.method==='POST'){
      const nomeExibicao=String(req.body?.nomeExibicao||'').trim();
      const nomeCompleto=String(req.body?.nomeCompleto||'').trim();
      const login=String(req.body?.login||'').trim().toLowerCase();
      const senha=String(req.body?.senha||'');
      const perfil=String(req.body?.perfil||'ATENDENTE').toUpperCase();
      if(nomeExibicao.length<2||nomeCompleto.length<3)return res.status(400).json({error:'Informe o nome de exibição e o nome completo.'});
      if(!validLogin(login))return res.status(400).json({error:'O login deve ter de 3 a 80 caracteres e usar apenas letras, números, ponto, traço, sublinhado ou @.'});
      if(senha.length<10)return res.status(400).json({error:'A senha deve ter pelo menos 10 caracteres.'});
      if(!['ADMINISTRADOR','ATENDENTE'].includes(perfil))return res.status(400).json({error:'Permissão inválida.'});
      const rows=await sql`INSERT INTO usuarios_atendimento (nome,nome_exibicao,nome_completo,login,email,senha_hash,perfil) VALUES (${nomeExibicao},${nomeExibicao},${nomeCompleto},${login},${login},${hashPassword(senha)},${perfil}) RETURNING id,nome_exibicao,nome_completo,login,perfil,ativo,criado_em`;
      return res.status(201).json({usuario:publicUser(rows[0])});
    }
    if(req.method==='PATCH'){
      const id=String(req.body?.id||'');
      const nomeExibicao=String(req.body?.nomeExibicao||'').trim();
      const nomeCompleto=String(req.body?.nomeCompleto||'').trim();
      const login=String(req.body?.login||'').trim().toLowerCase();
      const senha=String(req.body?.senha||'');
      const perfil=String(req.body?.perfil||'ATENDENTE').toUpperCase();
      const ativo=req.body?.ativo!==false;
      if(!id||nomeExibicao.length<2||nomeCompleto.length<3||!validLogin(login)||!['ADMINISTRADOR','ATENDENTE'].includes(perfil))return res.status(400).json({error:'Dados do usuário inválidos.'});
      if(id===session.id&&(!ativo||perfil!=='ADMINISTRADOR'))return res.status(400).json({error:'Você não pode desativar ou remover a própria permissão de administrador.'});
      if(senha&&senha.length<10)return res.status(400).json({error:'A nova senha deve ter pelo menos 10 caracteres.'});
      let rows;
      if(senha)rows=await sql`UPDATE usuarios_atendimento SET nome=${nomeExibicao},nome_exibicao=${nomeExibicao},nome_completo=${nomeCompleto},login=${login},email=${login},perfil=${perfil},ativo=${ativo},senha_hash=${hashPassword(senha)} WHERE id=${id} RETURNING id,nome_exibicao,nome_completo,login,perfil,ativo,criado_em`;
      else rows=await sql`UPDATE usuarios_atendimento SET nome=${nomeExibicao},nome_exibicao=${nomeExibicao},nome_completo=${nomeCompleto},login=${login},email=${login},perfil=${perfil},ativo=${ativo} WHERE id=${id} RETURNING id,nome_exibicao,nome_completo,login,perfil,ativo,criado_em`;
      if(!rows[0])return res.status(404).json({error:'Usuário não encontrado.'});
      return res.status(200).json({usuario:publicUser(rows[0])});
    }
    return res.status(405).json({error:'Método não permitido'});
  }catch(error){
    console.error(error);
    if(String(error.message||'').includes('unique'))return res.status(409).json({error:'Este login já está em uso.'});
    return res.status(500).json({error:'Não foi possível salvar o usuário.'});
  }
};
