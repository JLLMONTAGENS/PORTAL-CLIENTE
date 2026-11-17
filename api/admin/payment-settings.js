const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {PROVIDERS,encryptSecrets,decryptSecrets,safeProvider,publicRow}=require('./_payment-config');

const cleanUrl=value=>{const text=String(value||'').trim();if(!text)return'';const url=new URL(text);if(!['http:','https:'].includes(url.protocol))throw new Error('URL inválida.');return url.toString()};
const PUBLIC_FIELDS={MERCADO_PAGO:['publicKey','notificationUrl','successUrl','failureUrl','pendingUrl'],PAGBANK:['publicKey','notificationUrl','redirectUrl'],REDE:['merchantId','returnUrl']};

module.exports=async function handler(req,res){
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  if(user.perfil!=='ADMINISTRADOR')return res.status(403).json({error:'Somente administradores podem configurar pagamentos.'});
  try{
    const sql=getDatabase();
    if(req.method==='GET'){
      const rows=await sql`SELECT * FROM configuracoes_pagamento ORDER BY provedor`;
      const byProvider=Object.fromEntries(rows.map(row=>[row.provedor,row]));
      const configuracoes=Object.keys(PROVIDERS).map(provedor=>publicRow(byProvider[provedor]||{provedor,ativo:false,ambiente:'SANDBOX',usar_3ds:false,configuracao_publica:{}}));
      return res.status(200).json({configuracoes});
    }
    if(req.method!=='PUT')return res.status(405).json({error:'Método não permitido'});
    const provider=safeProvider(req.body?.provedor),definition=PROVIDERS[provider];if(!definition)return res.status(400).json({error:'Provedor inválido.'});
    const ambiente=String(req.body?.ambiente||'SANDBOX').toUpperCase();if(!['SANDBOX','PRODUCAO'].includes(ambiente))return res.status(400).json({error:'Ambiente inválido.'});
    const existing=(await sql`SELECT * FROM configuracoes_pagamento WHERE provedor=${provider} LIMIT 1`)[0];
    let previousSecrets={};if(existing?.segredos_criptografados)previousSecrets=decryptSecrets(existing.segredos_criptografados);
    const submittedSecrets=req.body?.segredos&&typeof req.body.segredos==='object'?req.body.segredos:{};
    const secrets=Object.fromEntries(definition.secretFields.map(field=>[field,String(submittedSecrets[field]||previousSecrets[field]||'').trim()]));
    const publicInput=req.body?.configuracaoPublica&&typeof req.body.configuracaoPublica==='object'?req.body.configuracaoPublica:{};
    const publicConfig={};for(const field of PUBLIC_FIELDS[provider]){const value=String(publicInput[field]||'').trim();publicConfig[field]=field.toLowerCase().includes('url')&&value?cleanUrl(value):value}
    const active=Boolean(req.body?.ativo);if(active&&definition.secretFields.some(field=>!secrets[field]))return res.status(400).json({error:`Preencha as credenciais obrigatórias de ${definition.label} antes de ativar.`});
    const encrypted=definition.secretFields.some(field=>secrets[field])?encryptSecrets(secrets):null;
    const rows=await sql`INSERT INTO configuracoes_pagamento (provedor,ativo,ambiente,usar_3ds,configuracao_publica,segredos_criptografados,atualizado_por) VALUES (${provider},${active},${ambiente},${Boolean(req.body?.usar3ds)},${JSON.stringify(publicConfig)}::jsonb,${encrypted},${user.id}) ON CONFLICT (provedor) DO UPDATE SET ativo=EXCLUDED.ativo,ambiente=EXCLUDED.ambiente,usar_3ds=EXCLUDED.usar_3ds,configuracao_publica=EXCLUDED.configuracao_publica,segredos_criptografados=EXCLUDED.segredos_criptografados,atualizado_por=EXCLUDED.atualizado_por,atualizado_em=NOW() RETURNING *`;
    return res.status(200).json({configuracao:publicRow(rows[0])});
  }catch(error){console.error(error);return res.status(500).json({error:error.message.includes('PAYMENT_CONFIG_ENCRYPTION_KEY')?error.message:'Não foi possível salvar as configurações de pagamento.'})}
};
