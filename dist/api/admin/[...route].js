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
  message:()=>require('../../../api/admin/message'),
  attachment:()=>require('../../../api/admin/attachment'),
  claim:()=>require('../../../api/admin/claim'),
  staff:()=>require('../../_admin-legacy/staff'),
  users:()=>require('../../../api/admin/users'),
  dispositivo:()=>require('../../../api/admin/dispositivo'),
  presenca:()=>require('../../../api/admin/presenca'),
  supervisao:()=>require('../../../api/admin/supervisao'),
  'chat-interno':()=>require('../../../api/admin/chat-interno'),
  'chat-interno-anexo':()=>require('../../../api/admin/chat-interno-anexo'),
  'push-status':()=>require('../../../api/admin/push-status'),
  assemblers:()=>require('../../_admin-legacy/assemblers'),
  quote:()=>require('../../../api/admin/quote'),
  quotes:()=>require('../../../api/admin/quotes'),
  'quote-management':()=>require('../../../api/admin/quote-management'),
  'payment-settings':()=>require('../../_admin-legacy/payment-settings'),
  'payment-test':()=>require('../../_admin-legacy/payment-test'),
  'payment-link':()=>require('../../../api/admin/payment-link'),
  'assign-assembler':()=>require('../../../api/admin/assign-assembler'),
  finalize:()=>require('../../../api/admin/finalize'),
  cancel:()=>require('../../../api/admin/cancel'),
  'montador-cadastros':()=>require('../../../api/admin/montador-cadastros'),
  'montador-documento':()=>require('../../../api/admin/montador-documento'),
  'montador-documento-revisao':()=>require('../../../api/admin/montador-documento-revisao'),
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
