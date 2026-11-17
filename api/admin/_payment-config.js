const crypto=require('crypto');
const {getDatabase}=require('../_db');

const PROVIDERS={
  MERCADO_PAGO:{label:'Mercado Pago',secretFields:['accessToken','webhookSecret']},
  PAGBANK:{label:'PagBank / PagSeguro',secretFields:['token']},
  REDE:{label:'Rede',secretFields:['clientId','clientSecret']}
};

const encryptionKey=()=>{
  const value=String(process.env.PAYMENT_CONFIG_ENCRYPTION_KEY||'');
  if(value.length<32)throw new Error('PAYMENT_CONFIG_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.');
  return crypto.createHash('sha256').update(value).digest();
};

function encryptSecrets(secrets){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(secrets),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),encrypted.toString('base64url')].join('.');
}

function decryptSecrets(value){
  if(!value)return{};
  const [version,iv,tag,payload]=String(value).split('.');
  if(version!=='v1'||!iv||!tag||!payload)throw new Error('Configuração criptografada inválida.');
  const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload,'base64url')),decipher.final()]).toString('utf8'));
}

const safeProvider=value=>String(value||'').toUpperCase();
const publicRow=row=>{
  const provider=PROVIDERS[row.provedor];let configured=[];
  try{const secrets=decryptSecrets(row.segredos_criptografados);configured=provider.secretFields.filter(field=>Boolean(secrets[field]))}catch{configured=[]}
  return {provedor:row.provedor,nome:provider.label,ativo:row.ativo,ambiente:row.ambiente,usar3ds:row.usar_3ds,configuracaoPublica:row.configuracao_publica||{},segredosConfigurados:configured,ultimoTesteEm:row.ultimo_teste_em,ultimoTesteOk:row.ultimo_teste_ok,ultimoTesteMensagem:row.ultimo_teste_mensagem,atualizadoEm:row.atualizado_em};
};

async function configuredProvider(providerName,{requireActive=true}={}){
  const provider=safeProvider(providerName);if(!PROVIDERS[provider])return null;
  const sql=getDatabase(),rows=await sql`SELECT * FROM configuracoes_pagamento WHERE provedor=${provider} LIMIT 1`,row=rows[0];
  if(!row||(requireActive&&!row.ativo))return null;
  return {...row,configuracaoPublica:row.configuracao_publica||{},segredos:decryptSecrets(row.segredos_criptografados)};
}

module.exports={PROVIDERS,encryptSecrets,decryptSecrets,safeProvider,publicRow,configuredProvider};
