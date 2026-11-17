const crypto=require('crypto');
const {configuredProvider}=require('../admin/_payment-config');
const {completePayment}=require('./_complete');

function signatureIsValid(req,secret,paymentId){
  if(!secret)return true;
  const signature=String(req.headers?.['x-signature']||''),requestId=String(req.headers?.['x-request-id']||'');
  const parts=Object.fromEntries(signature.split(',').map(item=>item.trim().split('=')));
  if(!parts.ts||!parts.v1||!requestId)return false;
  const manifest=`id:${paymentId};request-id:${requestId};ts:${parts.ts};`;
  const expected=crypto.createHmac('sha256',secret).update(manifest).digest('hex');
  const actual=String(parts.v1);return actual.length===expected.length&&crypto.timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  try{
    const paymentId=String(req.body?.data?.id||req.query?.['data.id']||req.body?.id||'').trim();if(!paymentId)return res.status(200).json({ok:true,ignored:true});
    const config=await configuredProvider('MERCADO_PAGO');if(!config)return res.status(503).json({error:'Mercado Pago não está ativo.'});
    if(!signatureIsValid(req,config.segredos.webhookSecret,paymentId))return res.status(401).json({error:'Assinatura inválida.'});
    const response=await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,{headers:{Authorization:`Bearer ${config.segredos.accessToken}`}}),payment=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`Não foi possível consultar o pagamento (HTTP ${response.status}).`);
    if(payment.status!=='approved')return res.status(200).json({ok:true,finalizado:false,status:payment.status||'desconhecido'});
    const result=await completePayment({quoteId:String(payment.external_reference||''),provider:'MERCADO_PAGO',externalId:paymentId});
    return res.status(result.found?200:404).json({ok:result.found,finalizado:result.finalized});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível processar a notificação do Mercado Pago.'})}
};
