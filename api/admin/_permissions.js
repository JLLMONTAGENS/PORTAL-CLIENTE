const MANAGER_PROFILES=new Set(['ADMINISTRADOR','GESTOR']);

const canManageAll=user=>Boolean(user&&MANAGER_PROFILES.has(String(user.perfil||'').toUpperCase()));
const isAdministrator=user=>String(user?.perfil||'').toUpperCase()==='ADMINISTRADOR';

module.exports={canManageAll,isAdministrator};
