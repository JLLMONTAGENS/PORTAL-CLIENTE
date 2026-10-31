const handlers={
  cadastro:require('../../../api/montadores/cadastro'),
  documento:require('../../../api/montadores/documento'),
  login:require('../../../api/montadores/login'),
  logout:require('../../../api/montadores/logout'),
  status:require('../../../api/montadores/status')
};

module.exports=(req,res)=>{
  const route=new URL(req.url,'http://localhost').pathname
    .split('/').filter(Boolean).slice(2).join('/').toLowerCase();
  const handler=handlers[route];
  if(!handler)return res.status(404).json({error:'Rota da Área do Montador não encontrada.'});
  return handler(req,res);
};
