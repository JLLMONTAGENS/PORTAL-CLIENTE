const crypto=require('node:crypto');
const {getDatabase}=require('../_db');
const c=require('./_core');

module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const generic='Se o e-mail estiver cadastrado, você receberá as instruções para criar uma nova senha.';
  try{
    const email=c.clean(req.body?.email).toLowerCase();if(!c.validEmail(email))return res.status(200).json({ok:true,mensagem:generic});
    const sql=getDatabase(),row=(await sql`SELECT id,email,nome_completo,nome FROM montadores WHERE LOWER(email)=LOWER(${email}) LIMIT 1`)[0];if(!row)return res.status(200).json({ok:true,mensagem:generic});
    const recent=(await sql`SELECT id FROM redefinicoes_senha_montador WHERE montador_id=${row.id} AND criado_em>NOW()-INTERVAL '5 minutes' LIMIT 1`)[0];if(recent)return res.status(200).json({ok:true,mensagem:generic});
    const token=crypto.randomBytes(32).toString('base64url'),hash=crypto.createHash('sha256').update(token).digest('hex');
    await sql`UPDATE redefinicoes_senha_montador SET usado_em=COALESCE(usado_em,NOW()) WHERE montador_id=${row.id} AND usado_em IS NULL`;
    await sql`INSERT INTO redefinicoes_senha_montador (montador_id,token_hash,expira_em,solicitado_ip) VALUES (${row.id},${hash},NOW()+INTERVAL '30 minutes',${c.requestIp(req)})`;
    const protocol=String(req.headers['x-forwarded-proto']||'https').split(',')[0],host=String(req.headers['x-forwarded-host']||req.headers.host||'').split(',')[0],base=String(process.env.PUBLIC_SITE_URL||`${protocol}://${host}`).replace(/\/$/,'');
    const link=`${base}/area-do-montador/?redefinir=${encodeURIComponent(token)}`;
    await c.sendAssemblerEmail(row.id,row.email,'REDEFINICAO_SENHA','Área do Montador: redefinição de senha',c.emailLayout('Crie uma nova senha',`<p>Olá, ${c.clean(row.nome_completo||row.nome)}.</p><p>Recebemos uma solicitação para redefinir sua senha. O link abaixo é válido por 30 minutos e só pode ser usado uma vez.</p><p><a href="${link}" style="display:inline-block;padding:12px 18px;background:#1A2B4C;color:#fff;text-decoration:none;border-radius:7px">Criar nova senha</a></p><p>Se você não fez esta solicitação, ignore esta mensagem. Sua senha atual continuará válida.</p>`));
    return res.status(200).json({ok:true,mensagem:generic});
  }catch(error){console.error(error);return res.status(200).json({ok:true,mensagem:generic})}
};
