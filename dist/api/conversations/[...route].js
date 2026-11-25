global.__JLL_NEON_SERVERLESS=require('@neondatabase/serverless');
global.__JLL_VERCEL_BLOB=require('@vercel/blob');
global.__JLL_NODEMAILER=require('nodemailer');
global.__JLL_WEB_PUSH=require('web-push');

const handlers={
  'accept-quote':()=>require('../../../api/conversations/accept-quote'),
  attachment:()=>require('../../../api/conversations/attachment'),
  create:()=>require('../../../api/conversations/create'),
  message:()=>require('../../../api/conversations/message'),
  photo:()=>require('../../../api/conversations/photo'),
  resume:()=>require('../../../api/conversations/resume'),
  tracking:()=>require('../../../api/conversations/tracking')
};

module.exports=(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname
    .split('/').filter(Boolean).slice(2).join('/').toLowerCase();
  const loadHandler=handlers[route];
  if(!loadHandler)return res.status(404).json({error:'Rota de atendimento não encontrada.'});
  return loadHandler()(req,res);
};
