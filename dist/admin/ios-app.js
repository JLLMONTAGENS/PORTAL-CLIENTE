(() => {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!isIOS) return;
  const installed = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  document.documentElement.classList.toggle('ios-home-app', installed);
  window.jllIOSInstalled = installed;

  const instruction = 'No Safari, toque em Compartilhar, escolha “Adicionar à Tela de Início” e confirme “Abrir como App”, se aparecer. Depois, abra o JLL Atendimento pelo ícone.';
  const dashboard = document.querySelector('#dashboard-view');
  if (!installed) {
    const note = document.querySelector('#ios-install-note');
    note.textContent = instruction;
    note.hidden = false;
    const guide = document.createElement('details');
    guide.className = 'install-note';
    guide.innerHTML = '<summary>Instalar no iPhone</summary><p></p>';
    guide.querySelector('p').textContent = instruction;
    dashboard.prepend(guide);
  }

  if (!installed || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  const controls = document.createElement('div');
  controls.className = 'ios-push-controls';
  controls.innerHTML = '<button class="ghost" type="button" disabled>Ativar notificações</button><span role="status"></span>';
  document.querySelector('.queue-header').after(controls);
  const button = controls.querySelector('button');
  const status = controls.querySelector('span');
  const endpoint = '/api/admin/push-web';
  let registration;
  let publicKey;
  let task = Promise.resolve();
  const bytes = value => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
  const send = (method, body) => fetch(endpoint, {
    method, cache: 'no-store', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body),
  });

  async function configure() {
    button.disabled = true;
    try {
      registration = await navigator.serviceWorker.ready;
      const response = await fetch(endpoint, {cache: 'no-store'});
      if (!response.ok) throw new Error('Entre novamente para ativar as notificações.');
      ({publicKey} = await response.json());
      status.textContent = publicKey ? '' : 'Notificações para iPhone aguardando configuração da JLL.';
      button.disabled = !publicKey;
    } catch (error) {
      status.textContent = error.message;
    }
  }

  button.addEventListener('click', () => {
    button.disabled = true;
    task = (async () => {
      try {
        // A assinatura precisa começar no gesto do usuário para o Safari pedir permissão.
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: bytes(publicKey),
        });
        const response = await send('POST', subscription.toJSON());
        if (!response.ok) throw new Error((await response.json()).error);
        status.textContent = 'Notificações ativadas neste iPhone.';
      } catch (error) {
        status.textContent = Notification.permission === 'denied'
          ? 'Permita as notificações do JLL Atendimento nos Ajustes do iPhone.'
          : error.message || 'Tente ativar as notificações novamente.';
      } finally {
        button.disabled = false;
      }
    })();
  });

  window.jllDisableIOSPush = async () => {
    await task;
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    const body = {endpoint: subscription.endpoint};
    const revoked = await Promise.allSettled([subscription.unsubscribe(), send('DELETE', body)]);
    if (!revoked.some(result => result.status === 'fulfilled' && (result.value === true || result.value?.ok))) {
      console.warn('Não foi possível remover a inscrição de notificações deste iPhone.');
    }
  };

  new MutationObserver(() => {
    if (!dashboard.hidden) configure();
  }).observe(dashboard, {attributeFilter: ['hidden']});
})();
