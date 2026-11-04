const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

module.exports=async function(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const platform=String(req.body?.plataforma||'').toUpperCase(),token=String(req.body?.pushToken||'').trim(),device=String(req.body?.identificadorDispositivo||'').trim()||null;
    if(!['ANDROID','IOS'].includes(platform)||!token)return res.status(400).json({error:'Dispositivo inválido.'});
    const sql=getDatabase(),row=(await sql`INSERT INTO dispositivos_usuario (usuario_id,plataforma,push_token,identificador_dispositivo) VALUES (${user.id},${platform},${token},${device}) ON CONFLICT (push_token) DO UPDATE SET usuario_id=EXCLUDED.usuario_id,plataforma=EXCLUDED.plataforma,identificador_dispositivo=EXCLUDED.identificador_dispositivo,ativo=TRUE,ultimo_acesso_em=NOW() RETURNING id`)[0];
    return res.status(200).json({ok:true,id:row.id});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível registrar o dispositivo.'})}
};
