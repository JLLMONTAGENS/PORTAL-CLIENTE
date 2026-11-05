const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {notifyAttendance}=require('./_push');

function firebaseSummary(){
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)return {configurado:false,motivo:'Variável FIREBASE_SERVICE_ACCOUNT_JSON ausente neste deploy.'};
  try{
    let credentials=JSON.parse(raw.trim());
    if(typeof credentials==='string')credentials=JSON.parse(credentials);
    const configurado=Boolean(credentials?.project_id&&credentials?.client_email&&credentials?.private_key);
    return {configurado,projectId:configurado?credentials.project_id:null,motivo:configurado?null:'O JSON não possui project_id, client_email e private_key.'};
  }catch(error){return {configurado:false,motivo:`JSON inválido: ${error.message}`}}
}

module.exports=async function handler(req,res){
  const user=await authenticatedUser(req);
  if(!user)return res.status(401).json({error:'Sessão expirada.'});
  if(user.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'Somente administradores podem consultar notificações.'});
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método não permitido.'});
  const sql=getDatabase();
  try{
    if(req.method==='POST'){
      const attendance=(await sql`SELECT id FROM atendimentos ORDER BY criado_em DESC LIMIT 1`)[0];
      if(!attendance)return res.status(400).json({error:'Crie ao menos um atendimento antes de testar o push.'});
      await notifyAttendance({atendimentoId:attendance.id,tipo:'TESTE_PUSH',titulo:'Teste JLL Atendimento',mensagem:'As notificações do JLL Atendimento estão funcionando.',usuarioId:user.id});
    }
    const devices=await sql`SELECT d.id,d.plataforma,d.identificador_dispositivo,d.ativo,d.ultimo_acesso_em,u.nome_exibicao,u.login FROM dispositivos_usuario d JOIN usuarios_atendimento u ON u.id=d.usuario_id ORDER BY d.ultimo_acesso_em DESC LIMIT 20`;
    const notifications=await sql`SELECT n.id,n.tipo,n.titulo,n.status,n.resultado,n.ultimo_erro,n.enviado_em,n.criado_em,a.numero_atendimento FROM notificacoes_push_atendimento n LEFT JOIN atendimentos a ON a.id=n.atendimento_id ORDER BY n.criado_em DESC LIMIT 20`;
    return res.status(200).json({firebase:firebaseSummary(),dispositivos:devices,notificacoes:notifications});
  }catch(error){console.error('Diagnóstico de push falhou',error);return res.status(500).json({error:'Não foi possível consultar o diagnóstico de notificações.'})}
};
