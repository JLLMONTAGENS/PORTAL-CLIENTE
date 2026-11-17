// A função vive dentro de dist, mas reutiliza os handlers-fonte da raiz.
// Os módulos são resolvidos no contexto de dist e compartilhados com os
// handlers externos, pois /var/task/api não enxerga /var/task/dist/node_modules.
global.__JLL_NEON_SERVERLESS=require('@neondatabase/serverless');
global.__JLL_VERCEL_BLOB=require('@vercel/blob');
global.__JLL_NODEMAILER=require('nodemailer');

const handlers={
  cadastro:require('../../../api/montadores/cadastro'),
  documento:require('../../../api/montadores/documento'),
  login:require('../../../api/montadores/login'),
  logout:require('../../../api/montadores/logout'),
  'senha-solicitar':require('../../../api/montadores/senha-solicitar'),
  'senha-redefinir':require('../../../api/montadores/senha-redefinir'),
  status:require('../../../api/montadores/status'),
  servicos:require('../../../api/montadores/servicos'),
  'servico-foto':require('../../../api/montadores/servico-foto'),
  pagamentos:require('../../../api/montadores/pagamentos'),
  'pagamento-documento':require('../../../api/montadores/pagamento-documento'),
  dispositivo:require('../../../api/montadores/dispositivo')
};

module.exports=(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname
    .split('/').filter(Boolean).slice(2).join('/').toLowerCase();
  const handler=handlers[route];
  if(!handler)return res.status(404).json({error:'Rota da Área do Montador não encontrada.'});
  return handler(req,res);
};
