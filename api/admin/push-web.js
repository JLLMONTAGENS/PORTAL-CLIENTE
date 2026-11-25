const {getDatabase} = require('../_db');
const {authenticatedUser} = require('./_auth');
const {validAppleEndpoint, vapidDetails} = require('./_push-web');

module.exports = async function(req, res) {
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).end();
  res.setHeader('Cache-Control', 'private, no-store');
  const user = await authenticatedUser(req);
  if (!user) return res.status(401).json({error: 'Sessão expirada.'});

  const vapid = vapidDetails();
  if (req.method === 'GET') return res.status(200).json({publicKey: vapid?.publicKey || null});
  const {endpoint, keys} = req.body || {};
  if (!validAppleEndpoint(endpoint)) return res.status(400).json({error: 'Inscrição do iPhone inválida.'});
  try {
    const sql = getDatabase();
    if (req.method === 'DELETE') {
      await sql`DELETE FROM dispositivos_push_web_atendimento WHERE endpoint=${endpoint} AND usuario_id=${user.id}`;
    } else {
      if (!vapid) return res.status(503).json({error: 'As notificações para iPhone ainda não foram configuradas.'});
      if (!/^[\w-]{87}$/.test(keys?.p256dh || '') || !/^[\w-]{22}$/.test(keys?.auth || '')) {
        return res.status(400).json({error: 'Inscrição do iPhone inválida.'});
      }
      await sql`INSERT INTO dispositivos_push_web_atendimento (endpoint,usuario_id,p256dh,auth)
        VALUES (${endpoint},${user.id},${keys.p256dh},${keys.auth})
        ON CONFLICT (endpoint) DO UPDATE SET usuario_id=EXCLUDED.usuario_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth`;
    }
    return res.status(200).json({ok: true});
  } catch (error) {
    console.warn('Inscrição Web Push indisponível', error.code || 'ERRO');
    return res.status(503).json({error: 'Não foi possível alterar as notificações neste aparelho.'});
  }
};
