const crypto=require('crypto');
const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {safeProvider,configuredProvider}=require('./_payment-config');

async function mercadoPago(config,quote){
  const publicConfig=config.configuracaoPublica,payload={items:[{id:quote.id,title:`Orçamento JLL #${quote.numero_atendimento}`,description:quote.descricao_servico.slice(0,250),quantity:1,currency_id:'BRL',unit_price:Number(quote.valor)}],external_reference:quote.id,metadata:{orcamento_id:quote.id,atendimento_id:quote.atendimento_id}};
  if(publicConfig.notificationUrl)payload.notification_url=publicConfig.notificationUrl;
  const backUrls={success:publicConfig.successUrl,failure:publicConfig.failureUrl,pending:publicConfig.pendingUrl};if(Object.values(backUrls).some(Boolean))payload.back_urls=backUrls;
  if(publicConfig.successUrl)payload.auto_return='approved';
  const response=await fetch('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${config.segredos.accessToken}`,'Content-Type':'application/json','X-Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||`Mercado Pago retornou HTTP ${response.status}.`);
  return{id:String(data.id),url:config.ambiente==='SANDBOX'?(data.sandbox_init_point||data.init_point):data.init_point};
}

async function pagBank(config,quote){
  const base=config.ambiente==='PRODUCAO'?'https://api.pagseguro.com':'https://sandbox.api.pagseguro.com',publicConfig=config.configuracaoPublica;
  const payload={reference_id:quote.id,customer:{name:quote.nome_cliente},items:[{reference_id:quote.id,name:`Orçamento JLL #${quote.numero_atendimento}`,description:quote.descricao_servico.slice(0,250),quantity:1,unit_amount:Math.round(Number(quote.valor)*100)}]};
  if(publicConfig.redirectUrl)payload.redirect_url=publicConfig.redirectUrl;
  if(publicConfig.notificationUrl){payload.notification_urls=[publicConfig.notificationUrl];payload.payment_notification_urls=[publicConfig.notificationUrl]}
  const response=await fetch(`${base}/checkouts`,{method:'POST',headers:{Authorization:`Bearer ${config.segredos.token}`,'Content-Type':'application/json',Accept:'application/json','x-idempotency-key':crypto.randomUUID()},body:JSON.stringify(payload)});
  const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error_messages?.[0]?.description||`PagBank retornou HTTP ${response.status}.`);
  const payLink=(data.links||[]).find(link=>String(link.rel).toUpperCase()==='PAY');if(!payLink?.href)throw new Error('O PagBank não retornou o link de pagamento.');
  return{id:String(data.id),url:payLink.href};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const quoteId=String(req.body?.orcamentoId||''),provider=safeProvider(req.body?.provedor),sql=getDatabase();
    if(!quoteId||!['MERCADO_PAGO','PAGBANK','REDE'].includes(provider))return res.status(400).json({error:'Informe o orçamento e o provedor.'});
    if(provider==='REDE')return res.status(409).json({error:'A Rede usa checkout direto. A geração será liberada após o credenciamento e a certificação PCI/3DS; não serão coletados dados de cartão antes dessa etapa.'});
    const rows=await sql`SELECT o.*,a.atendente_id FROM orcamentos o JOIN atendimentos a ON a.id=o.atendimento_id WHERE o.id=${quoteId} LIMIT 1`,quote=rows[0];if(!quote)return res.status(404).json({error:'Orçamento não encontrado.'});
    if(user.perfil!=='ADMINISTRADOR'&&quote.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável pelo atendimento pode gerar o link.'});
    if(quote.status_pag_cliente==='PAGO')return res.status(409).json({error:'Este orçamento já está pago.'});
    const config=await configuredProvider(provider);if(!config)return res.status(409).json({error:'Ative e configure esse provedor no menu Pagamentos.'});
    const payment=provider==='MERCADO_PAGO'?await mercadoPago(config,quote):await pagBank(config,quote);
    await sql`UPDATE orcamentos SET provedor_pagamento=${provider},id_pagamento_externo=${payment.id},link_pagamento=${payment.url},atualizado_em=NOW() WHERE id=${quote.id}`;
    const message=`Link seguro para pagamento do orçamento #${quote.numero_atendimento}:\n${payment.url}\n\nApós a confirmação do pagamento, o atendimento será finalizado automaticamente.`;
    await sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,remetente_id,texto) VALUES (${quote.atendimento_id},'ATENDENTE',${user.id},${message})`;
    await sql`UPDATE atendimentos SET atualizado_em=NOW() WHERE id=${quote.atendimento_id}`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${quote.atendimento_id},'LINK_PAGAMENTO_GERADO',${JSON.stringify({orcamentoId:quote.id,provedor:provider,idPagamentoExterno:payment.id,usuario:user.id})}::jsonb)`;
    return res.status(201).json({ok:true,provedor:provider,idPagamentoExterno:payment.id,linkPagamento:payment.url});
  }catch(error){console.error(error);return res.status(502).json({error:error.message||'Não foi possível gerar o link de pagamento.'})}
};
