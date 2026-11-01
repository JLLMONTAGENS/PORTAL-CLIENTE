const crypto=require('node:crypto');
const {getDatabase}=require('../_db');
const c=require('./_core');

module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  try{
    const token=String(req.body?.token||''),senha=String(req.body?.senha||'');
    if(token.length<30||senha.length<c.MIN_PASSWORD_LENGTH)return res.status(400).json({error:`Informe uma senha com pelo menos ${c.MIN_PASSWORD_LENGTH} caracteres.`});
    const hash=crypto.createHash('sha256').update(token).digest('hex'),passwordHash=c.hashPassword(senha),sql=getDatabase();
    const updated=await sql`WITH valid AS (UPDATE redefinicoes_senha_montador SET usado_em=NOW() WHERE token_hash=${hash} AND usado_em IS NULL AND expira_em>NOW() RETURNING montador_id) UPDATE montadores m SET senha_hash=${passwordHash},atualizado_em=NOW() FROM valid WHERE m.id=valid.montador_id RETURNING m.id`;
    if(!updated[0])return res.status(400).json({error:'Este link é inválido ou expirou. Solicite uma nova redefinição.'});
    await sql`INSERT INTO auditoria_montador (montador_id,ator_tipo,ator_id,acao,ip_origem) VALUES (${updated[0].id},'MONTADOR',${updated[0].id},'SENHA_REDEFINIDA',${c.requestIp(req)})`;
    res.setHeader('Set-Cookie','jll_montador_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
    return res.status(200).json({ok:true,mensagem:'Senha alterada com sucesso. Você já pode entrar.'});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível redefinir a senha.'})}
};
