const crypto=require('node:crypto');
const {getDatabase}=require('../_db');
const {sendAdminEmail,emailLayout}=require('./_email');

const validEmail=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const requestIp=req=>String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'').split(',')[0].trim().slice(0,80);

module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const generic='Se o e-mail estiver vinculado a um usuário ativo, você receberá as instruções para criar uma nova senha.';
  try{
    const email=String(req.body?.email||'').trim().toLowerCase();
    if(!validEmail(email))return res.status(200).json({ok:true,mensagem:generic});
    const sql=getDatabase(),user=(await sql`SELECT id,email,nome_exibicao,nome_completo FROM usuarios_atendimento WHERE LOWER(email)=LOWER(${email}) AND ativo=TRUE LIMIT 1`)[0];
    if(!user)return res.status(200).json({ok:true,mensagem:generic});
    const recent=(await sql`SELECT id FROM redefinicoes_senha_usuario WHERE usuario_id=${user.id} AND criado_em>NOW()-INTERVAL '5 minutes' LIMIT 1`)[0];
    if(recent)return res.status(200).json({ok:true,mensagem:generic});
    const token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex');
    await sql`UPDATE redefinicoes_senha_usuario SET usado_em=COALESCE(usado_em,NOW()) WHERE usuario_id=${user.id} AND usado_em IS NULL`;
    await sql`INSERT INTO redefinicoes_senha_usuario (usuario_id,token_hash,expira_em,solicitado_ip) VALUES (${user.id},${hash},NOW()+INTERVAL '30 minutes',${requestIp(req)})`;
    const protocol=String(req.headers['x-forwarded-proto']||'https').split(',')[0],host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0],base=String(process.env.PUBLIC_SITE_URL||`${protocol}://${host}`).replace(/\/$/,'');
    const link=`${base}/admin/?redefinir=${encodeURIComponent(token)}`;
    await sendAdminEmail(user.email,'Central JLL: redefinição de senha',emailLayout('Crie uma nova senha',`<p>Olá, ${String(user.nome_completo||user.nome_exibicao||'').trim()}.</p><p>Recebemos uma solicitação para redefinir sua senha de acesso à Central JLL. O link abaixo é válido por 30 minutos e só pode ser usado uma vez.</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#1A2B4C;color:#fff;text-decoration:none;border-radius:7px">Criar nova senha</a></p><p>Se você não fez esta solicitação, ignore esta mensagem. Sua senha atual continuará válida.</p>`));
    return res.status(200).json({ok:true,mensagem:generic});
  }catch(error){console.error('Admin password reset request failed',error);return res.status(200).json({ok:true,mensagem:generic})}
};
