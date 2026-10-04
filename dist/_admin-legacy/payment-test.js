const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {PROVIDERS,safeProvider,configuredProvider}=require('./_payment-config');

async function testProvider(config){
  if(config.provedor==='MERCADO_PAGO'){
    const response=await fetch('https://api.mercadopago.com/v1/payment_methods',{headers:{Authorization:`Bearer ${config.segredos.accessToken}`}});
    if(!response.ok)throw new Error(`Mercado Pago recusou as credenciais (HTTP ${response.status}).`);
    return 'Credenciais aceitas pelo Mercado Pago.';
  }
  if(config.provedor==='PAGBANK'){
    const base=config.ambiente==='PRODUCAO'?'https://api.pagseguro.com':'https://sandbox.api.pagseguro.com';
    const response=await fetch(`${base}/checkouts/JLL_CONNECTION_TEST`,{headers:{Authorization:`Bearer ${config.segredos.token}`,Accept:'application/json'}});
    if(response.status===401||response.status===403)throw new Error(`PagBank recusou o token (HTTP ${response.status}).`);
    return 'Token aceito pelo PagBank. O checkout de teste não foi criado.';
  }
  const base=config.ambiente==='PRODUCAO'?'https://api.userede.com.br/redelabs':'https://rl7-sandbox-api.useredecloud.com.br';
  const authorization=Buffer.from(`${config.segredos.clientId}:${config.segredos.clientSecret}`).toString('base64');
  const response=await fetch(`${base}/oauth2/token`,{method:'POST',headers:{Authorization:`Basic ${authorization}`,'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=client_credentials'});
  if(!response.ok)throw new Error(`Rede recusou as credenciais OAuth (HTTP ${response.status}).`);
  return 'Credenciais OAuth aceitas pela Rede.';
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  if(user.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'Somente administradores podem testar pagamentos.'});
  const provider=safeProvider(req.body?.provedor);if(!PROVIDERS[provider])return res.status(400).json({error:'Provedor inválido.'});
  let ok=false,message='';
  try{const config=await configuredProvider(provider,{requireActive:false});if(!config)throw new Error('Salve as credenciais antes de testar.');message=await testProvider(config);ok=true}
  catch(error){message=error.message||'Falha ao testar o provedor.'}
  try{const sql=getDatabase();await sql`UPDATE configuracoes_pagamento SET ultimo_teste_em=NOW(),ultimo_teste_ok=${ok},ultimo_teste_mensagem=${message},atualizado_por=${user.id},atualizado_em=NOW() WHERE provedor=${provider}`}
  catch(error){console.error(error)}
  return res.status(ok?200:422).json({ok,mensagem:message});
};
