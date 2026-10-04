const {configuredProvider}=require('../admin/_payment-config');
const {completePayment}=require('./_complete');

const hasPaidStatus=value=>{if(!value||typeof value!=='object')return false;if(String(value.status||'').toUpperCase()==='PAID')return true;return Object.values(value).some(item=>Array.isArray(item)?item.some(hasPaidStatus):hasPaidStatus(item))};

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  try{
    const checkoutId=String(req.body?.id||'').trim();if(!checkoutId.startsWith('CHEC_'))return res.status(200).json({ok:true,ignored:true});
    const config=await configuredProvider('PAGBANK');if(!config)return res.status(503).json({error:'PagBank não está ativo.'});
    const base=config.ambiente==='PRODUCAO'?'https://api.pagseguro.com':'https://sandbox.api.pagseguro.com';
    const response=await fetch(`${base}/checkouts/${encodeURIComponent(checkoutId)}`,{headers:{Authorization:`Bearer ${config.segredos.token}`,Accept:'application/json'}}),checkout=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(`Não foi possível consultar o checkout (HTTP ${response.status}).`);
    if(!hasPaidStatus(checkout))return res.status(200).json({ok:true,finalizado:false,status:'PENDENTE'});
    const result=await completePayment({quoteId:String(checkout.reference_id||''),provider:'PAGBANK',externalId:checkoutId});
    return res.status(result.found?200:404).json({ok:result.found,finalizado:result.finalized});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível processar a notificação do PagBank.'})}
};
