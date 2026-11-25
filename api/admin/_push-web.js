const {getDatabase} = require('../_db');

function validAppleEndpoint(value) {
  if (typeof value !== 'string' || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.endsWith('.push.apple.com')
      && !url.port && !url.username && !url.password && !url.hash && url.pathname !== '/';
  } catch {
    return false;
  }
}

function vapidDetails() {
  const {JLL_WEB_PUSH_PUBLIC_KEY: publicKey, JLL_WEB_PUSH_PRIVATE_KEY: privateKey} = process.env;
  if (!/^[\w-]{87}$/.test(publicKey || '') || !/^[\w-]{43}$/.test(privateKey || '')) return null;
  return {publicKey, privateKey, subject: 'mailto:admin@jllmontagens.com.br'};
}

async function notifyWeb({usuarioId, payload}) {
  const vapid = vapidDetails();
  if (!vapid) return;
  try {
    const sql = getDatabase();
    const devices = await sql`SELECT d.endpoint,d.p256dh,d.auth,d.usuario_id
      FROM dispositivos_push_web_atendimento d JOIN usuarios_atendimento u ON u.id=d.usuario_id
      WHERE u.ativo=TRUE AND (${usuarioId || null}::uuid IS NULL OR u.id=${usuarioId || null}::uuid)`;
    const webPush = global.__JLL_WEB_PUSH || require('web-push');
    const body = JSON.stringify({
      body: payload.tipo === 'CHAT_INTERNO' ? 'Você recebeu uma mensagem no chat interno.' : 'Há uma atualização de atendimento.',
      target: payload,
    });
    await Promise.allSettled(devices.filter(device => validAppleEndpoint(device.endpoint)).map(async device => {
      try {
        await webPush.sendNotification(
          {endpoint: device.endpoint, keys: {p256dh: device.p256dh, auth: device.auth}},
          body, {vapidDetails: vapid, TTL: 300, timeout: 2500},
        );
      } catch (error) {
        if ([404, 410].includes(error.statusCode)) {
          await sql`DELETE FROM dispositivos_push_web_atendimento
            WHERE endpoint=${device.endpoint} AND usuario_id=${device.usuario_id}
              AND p256dh=${device.p256dh} AND auth=${device.auth}`;
        } else {
          console.warn('Entrega de Web Push falhou', error.statusCode || error.code || 'ERRO');
        }
      }
    }));
  } catch (error) {
    console.warn('Web Push indisponível', error.code || 'ERRO');
  }
}

module.exports = {notifyWeb, validAppleEndpoint, vapidDetails};
