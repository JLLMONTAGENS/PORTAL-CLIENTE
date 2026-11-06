const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {ensureChatSchema}=require('./_chat-schema');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    await ensureChatSchema(sql);
    const origem=String(req.body?.origem||'WEB').toUpperCase();
    const platform=['WEB','ANDROID','IOS'].includes(origem)?origem:'WEB';
    const sql=getDatabase();
    await sql`INSERT INTO usuarios_presenca (usuario_id,origem,ultima_atividade_em,atualizado_em) VALUES (${user.id},${platform},NOW(),NOW()) ON CONFLICT (usuario_id) DO UPDATE SET origem=EXCLUDED.origem,ultima_atividade_em=NOW(),atualizado_em=NOW()`;
    return res.status(200).json({ok:true});
  }catch(error){console.error('Presence heartbeat failed',error);return res.status(500).json({error:'Não foi possível atualizar a presença.'})}
};
