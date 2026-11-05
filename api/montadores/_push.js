const crypto=require('node:crypto');
const {getDatabase}=require('../_db');

const encode=value=>Buffer.from(value).toString('base64url');
let cachedToken=null;

function firebaseCredentials(){
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)return null;
  try{
    let credentials=JSON.parse(raw.trim());
    if(typeof credentials==='string')credentials=JSON.parse(credentials);
    return credentials&&typeof credentials==='object'?credentials:null;
  }catch(error){console.error('FIREBASE_SERVICE_ACCOUNT_JSON inválida:',error.message);return null}
}

async function accessToken(credentials){
  if(cachedToken&&cachedToken.expiresAt>Date.now()+60_000)return cachedToken.value;
  const now=Math.floor(Date.now()/1000),header=encode(JSON.stringify({alg:'RS256',typ:'JWT'})),payload=encode(JSON.stringify({iss:credentials.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600})),unsigned=`${header}.${payload}`,signature=crypto.sign('RSA-SHA256',Buffer.from(unsigned),String(credentials.private_key||'').replace(/\\n/g,'\n')).toString('base64url');
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${unsigned}.${signature}`})});
  const data=await response.json();if(!response.ok||!data.access_token)throw new Error(data.error_description||'Não foi possível autenticar no Firebase.');
  cachedToken={value:data.access_token,expiresAt:Date.now()+Number(data.expires_in||3600)*1000};return cachedToken.value;
}

async function notifyAssignment({montadorId,orcamentoId,numeroAtendimento,descricaoServico,bairro,cidade,valorRepasse,agendadoPara}){
  if(!montadorId||!orcamentoId)return;
  const sql=getDatabase(),credentials=firebaseCredentials(),notification=(await sql`INSERT INTO notificacoes_push_montador (montador_id,orcamento_id,tipo,titulo,mensagem,dados,status) VALUES (${montadorId},${orcamentoId},'NOVO_SERVICO','Novo serviço disponível','Você recebeu uma nova proposta de serviço.',${JSON.stringify({orcamentoId,numeroAtendimento:String(numeroAtendimento||''),descricaoServico:String(descricaoServico||''),bairro:String(bairro||''),cidade:String(cidade||''),valorRepasse:String(valorRepasse||0),agendadoPara:String(agendadoPara||'')})}::jsonb,${credentials?'PENDENTE':'AGUARDANDO_CONFIGURACAO'}) RETURNING id`)[0];
  if(!credentials?.project_id||!credentials?.client_email||!credentials?.private_key)return;
  try{
    const token=await accessToken(credentials),devices=await sql`SELECT id,push_token FROM dispositivos_montador WHERE montador_id=${montadorId} AND ativo=TRUE`;
    if(!devices.length){await sql`UPDATE notificacoes_push_montador SET status='SEM_DISPOSITIVO',atualizado_em=NOW() WHERE id=${notification.id}`;return}
    const results=[];
    for(const device of devices){
      const response=await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.project_id)}/messages:send`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({message:{token:device.push_token,notification:{title:'Novo serviço disponível',body:'Abra o JLL Montador para analisar a proposta.'},data:{tipo:'NOVO_SERVICO',orcamentoId:String(orcamentoId)}}})});
      const body=await response.text();results.push({deviceId:device.id,ok:response.ok,status:response.status,resposta:body.slice(0,300)});
      if([404,410].includes(response.status))await sql`UPDATE dispositivos_montador SET ativo=FALSE WHERE id=${device.id}`;
    }
    const sent=results.some(item=>item.ok);await sql`UPDATE notificacoes_push_montador SET status=${sent?'ENVIADA':'FALHOU'},resultado=${JSON.stringify(results)}::jsonb,enviado_em=CASE WHEN ${sent} THEN NOW() ELSE enviado_em END,atualizado_em=NOW() WHERE id=${notification.id}`;
  }catch(error){console.error('Push do montador falhou',error);await sql`UPDATE notificacoes_push_montador SET status='FALHOU',ultimo_erro=${String(error.message||error).slice(0,500)},atualizado_em=NOW() WHERE id=${notification.id}`}
}

module.exports={notifyAssignment};
