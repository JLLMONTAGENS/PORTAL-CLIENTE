global.__JLL_NEON_SERVERLESS=require('@neondatabase/serverless');
global.__JLL_VERCEL_BLOB=require('@vercel/blob');
global.__JLL_NODEMAILER=require('nodemailer');

const handlers={
  login:()=>require('../../../api/admin/login'),
  logout:()=>require('../../_admin-legacy/logout'),
  password:()=>require('../../_admin-legacy/password'),
  'senha-solicitar':()=>require('../../../api/admin/senha-solicitar'),
  'senha-redefinir':()=>require('../../../api/admin/senha-redefinir'),
  conversations:()=>require('../../../api/admin/conversations'),
  conversation:()=>require('../../../api/admin/conversation'),
  message:()=>require('../../_admin-legacy/message'),
  attachment:()=>require('../../_admin-legacy/attachment'),
  claim:()=>require('../../_admin-legacy/claim'),
  staff:()=>require('../../_admin-legacy/staff'),
  users:()=>require('../../../api/admin/users'),
  dispositivo:()=>require('../../../api/admin/dispositivo'),
  assemblers:()=>require('../../_admin-legacy/assemblers'),
  quote:()=>require('../../../api/admin/quote'),
  quotes:()=>require('../../../api/admin/quotes'),
  'quote-management':()=>require('../../../api/admin/quote-management'),
  'payment-settings':()=>require('../../_admin-legacy/payment-settings'),
  'payment-test':()=>require('../../_admin-legacy/payment-test'),
  'payment-link':()=>require('../../_admin-legacy/payment-link'),
  'assign-assembler':()=>require('../../../api/admin/assign-assembler'),
  finalize:()=>require('../../_admin-legacy/finalize'),
  cancel:()=>require('../../_admin-legacy/cancel'),
  'montador-cadastros':()=>require('../../_admin-legacy/montador-cadastros'),
  'montador-documento':()=>require('../../_admin-legacy/montador-documento'),
  'montador-documento-revisao':()=>require('../../_admin-legacy/montador-documento-revisao'),
  'servico-foto':()=>require('../../../api/admin/servico-foto'),
  'smtp-settings':()=>require('../../_admin-legacy/smtp-settings'),
  'montador-pagamentos':()=>require('../../../api/admin/montador-pagamentos'),
  'montador-cnab':()=>require('../../../api/admin/montador-cnab')
};

module.exports=(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname
    .split('/').filter(Boolean).slice(2).join('/').toLowerCase();
  const loadHandler=handlers[route];
  if(!loadHandler)return res.status(404).json({error:'Rota administrativa não encontrada.'});
  return loadHandler()(req,res);
};
