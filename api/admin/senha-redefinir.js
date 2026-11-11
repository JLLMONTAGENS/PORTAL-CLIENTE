const crypto=require('node:crypto');
const {getDatabase}=require('../_db');
const {hashPassword}=require('./_auth');

module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  try{
    const token=String(req.body?.token||''),senha=String(req.body?.senha||'');
    if(token.length<30||senha.length<6)return res.status(400).json({error:'Informe uma senha com pelo menos 6 caracteres.'});
    const hash=crypto.createHash('sha256').update(token).digest('hex'),passwordHash=hashPassword(senha),sql=getDatabase();
    const updated=await sql`WITH valid AS (UPDATE redefinicoes_senha_usuario SET usado_em=NOW() WHERE token_hash=${hash} AND usado_em IS NULL AND expira_em>NOW() RETURNING usuario_id) UPDATE usuarios_atendimento u SET senha_hash=${passwordHash} FROM valid WHERE u.id=valid.usuario_id AND u.ativo=TRUE RETURNING u.id`;
    if(!updated[0])return res.status(400).json({error:'Este link é inválido ou expirou. Solicite uma nova redefinição.'});
    res.setHeader('Set-Cookie','jll_admin_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return res.status(200).json({ok:true,mensagem:'Senha alterada com sucesso. Você já pode entrar.'});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível redefinir a senha.'})}
};
