const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatDate=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
const formatMoney=value=>value==null?'—':Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const labels={PENDENTE:'Pendente',GEROU_ORCAMENTO:'Orçamento gerado',ATRIBUIDO_MONTADOR:'Montador atribuído',SERVICO_FINALIZADO:'Serviço finalizado'};
const renderAdminMessageContent=message=>{const raw=String(message.texto||'');if(message.tipo_remetente!=='ATENDENTE'||!raw.includes('Seu orçamento JLL Montagens')||!raw.includes('Atendimento:'))return `<span class="admin-message-text">${escapeHtml(raw).replace(/\r?\n/g,'<br>')}</span>`;const lines=raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);const greeting=lines.find(line=>/^Olá[,!\s]/i.test(line))||'Orçamento do cliente';const fields={};const fieldLabels=['Atendimento','Serviço','Valor','Data agendada','Endereço','Telefone alternativo','Referência'];lines.forEach(line=>{const label=fieldLabels.find(item=>line.toLowerCase().startsWith(item.toLowerCase()+':'));if(label)fields[label]=line.slice(line.indexOf(':')+1).trim()});if(fields['Data agendada'])fields['Data agendada']=fields['Data agendada'].replace(/,\s*\d{1,2}:\d{2}(?::\d{2})?$/,'');const rows=fieldLabels.filter(label=>fields[label]).map(label=>`<div class="admin-quote-row ${label==='Serviço'||label==='Endereço'||label==='Referência'?'admin-quote-row-wide':''}"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(fields[label])}</dd></div>`).join('');return `<section class="admin-quote-summary" aria-label="Resumo do orçamento"><div class="admin-quote-header"><span aria-hidden="true">✓</span><div><strong>Orçamento gerado</strong><em>JLL Montagens</em></div></div><p class="admin-quote-greeting">${escapeHtml(greeting)}</p><dl>${rows}</dl><p class="admin-quote-footer">Confira os dados. Se precisar alterar alguma informação, responda por aqui.</p></section>`};

const state={status:'__NAO_RESPONDIDAS__',user:null,currentView:'attendances',currentConversation:null,staff:[],assemblers:[],users:[],quotes:[],quoteAssemblers:[],quoteAttendants:[],queueSignature:'',conversationSignature:'',quotesSignature:'',queueLoading:false,conversationLoading:false,quotesLoading:false,conversationTask:null,queueTimer:null,conversationTimer:null};
const sessionLoading=$('#session-loading'),loginView=$('#login-view'),dashboard=$('#dashboard-view'),list=$('#list'),conversationPane=$('#conversation-pane'),dashboardError=$('#dashboard-error');
const QUEUE_REFRESH_MS=4000,CONVERSATION_REFRESH_MS=3000;

async function api(url,options={}){
  const response=await fetch(url,{cache:'no-store',...options});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const error=new Error(data.error||'Não foi possível concluir a operação.');error.status=response.status;throw error}
  return data;
}

function showError(error){dashboardError.textContent=error?.message||String(error||'');}
function clearError(){dashboardError.textContent=''}
function applySearchFilter(){const term=$('#search').value.trim().toLowerCase();document.querySelectorAll('.attendance-card').forEach(card=>card.hidden=Boolean(term&&!card.textContent.toLowerCase().includes(term)))}
function stopLiveUpdates(){clearInterval(state.queueTimer);clearInterval(state.conversationTimer);state.queueTimer=null;state.conversationTimer=null}
function startLiveUpdates(){stopLiveUpdates();state.queueTimer=setInterval(()=>{if(!document.hidden&&state.user){loadConversations({silent:true});if(state.currentView==='quotes')loadQuotes({silent:true})}},QUEUE_REFRESH_MS);state.conversationTimer=setInterval(()=>{if(!document.hidden&&state.user&&state.currentConversation&&state.currentView==='attendances')openConversation(state.currentConversation,{initial:false,silent:true})},CONVERSATION_REFRESH_MS)}

async function loadConversations({silent=false}={}){
  if(state.queueLoading)return;
  state.queueLoading=true;if(!silent){clearError();list.innerHTML='<div class="empty">Carregando atendimentos…</div>'}
  try{
    const data=await api(`/api/admin/conversations?status=${encodeURIComponent(state.status)}`);
    state.user=data.usuario;
    $('#users-menu').hidden=state.user.perfil!=='ADMINISTRADOR';
    $('#quotes-menu').hidden=state.user.perfil!=='ADMINISTRADOR';
    $('#session-description').textContent=`${state.user.nomeExibicao||state.user.login} · ${state.user.perfil==='ADMINISTRADOR'?'Administrador':'Atendente'}`;
    const counts=Object.fromEntries((data.contagens||[]).map(item=>[item.status,item.quantidade]));
    document.querySelectorAll('[data-count]').forEach(item=>item.textContent=item.dataset.count==='naoRespondidas'?(data.naoRespondidas||0):(counts[item.dataset.count]||0));
    const rows=data.atendimentos||[];
    $('#summary').textContent=`${rows.length} atendimento${rows.length===1?'':'s'} encontrado${rows.length===1?'':'s'}`;
    const signature=JSON.stringify(rows.map(row=>[row.id,row.status,row.atendente_id,row.atualizado_em,row.ultimo_tipo_remetente,row.detalhes_servico,row.valor_servico]));
    if(!silent||signature!==state.queueSignature){list.innerHTML=rows.length?rows.map(row=>{
      const unanswered=row.ultimo_tipo_remetente==='CLIENTE'&&row.status!=='SERVICO_FINALIZADO';
      const canClaim=!row.atendente_id||row.atendente_id===state.user.id||state.user.perfil==='ADMINISTRADOR';
      return `<article data-id="${row.id}" class="attendance-card ${unanswered?'unanswered':''} ${row.id===state.currentConversation?'active':''}" ${row.id===state.currentConversation?'aria-current="true"':''}><div><h2>Atendimento #${row.numero_atendimento} · ${escapeHtml(row.nome_cliente)}</h2><p>${escapeHtml(row.telefone)} · atualizado em ${formatDate(row.atualizado_em)}</p><p>${row.atendente_nome?`Responsável: ${escapeHtml(row.atendente_nome)}`:'Na fila · aguardando atendente'}</p><p>${row.detalhes_servico?escapeHtml(row.detalhes_servico):'Sem detalhes de serviço informados'} · ${formatMoney(row.valor_servico)}</p></div><div class="card-actions"><span class="status status-${String(row.status||'').toLowerCase()}">${unanswered?'● Não respondida · ':''}${labels[row.status]||escapeHtml(row.status)}</span>${canClaim&&row.atendente_id!==state.user.id?`<button class="claim-button" data-claim="${row.id}">${state.user.perfil==='ADMINISTRADOR'&&row.atendente_id?'Transferir para mim':'Assumir atendimento'}</button>`:''}</div></article>`;
    }).join(''):'<div class="empty">Nenhum atendimento neste filtro.</div>';state.queueSignature=signature;applySearchFilter()}return true
  }catch(error){if(!silent){list.innerHTML='';showError(error)}if(error.status===401||error.message.includes('Sessão')){stopLiveUpdates();dashboard.hidden=true;loginView.hidden=false;state.user=null}return false}
  finally{state.queueLoading=false}
}

async function loadSupportData(){
  const [staffData,assemblerData]=await Promise.all([api('/api/admin/staff'),api('/api/admin/assemblers')]);
  state.staff=staffData.atendentes||[];state.assemblers=assemblerData.montadores||[];
}

async function claim(atendimentoId,atendenteId){
  await api('/api/admin/claim',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({atendimentoId,atendenteId})});
  await loadConversations();await openConversation(atendimentoId);
}

const localDateTime=value=>{if(!value)return'';const d=new Date(value);const offset=d.getTimezoneOffset()*60000;return new Date(d-offset).toISOString().slice(0,16)};

function quoteForm(atendimento,quote){
  const assemblerOptions=state.assemblers.map(item=>`<option value="${item.id}" ${quote?.montador_id===item.id?'selected':''}>${escapeHtml(item.nome)}</option>`).join('');
  return `<section class="quote-panel" hidden><div class="quote-title"><div><span class="eyebrow">Uso interno</span><h3>${quote?'Atualizar':'Gerar'} orçamento</h3></div><button type="button" class="ghost close-quote">Fechar</button></div><p class="internal-note">Este formulário não é exibido ao cliente. Ao salvar, ele receberá automaticamente o resumo do orçamento no chat.</p><form id="quote-form"><label>Descrição do serviço<textarea name="descricaoServico" rows="4" required>${escapeHtml(quote?.descricao_servico||atendimento.detalhes_servico||'')}</textarea></label><div class="form-grid"><label>Valor do serviço (R$)<input name="valor" inputmode="decimal" placeholder="0,00" value="${quote?String(Number(quote.valor).toFixed(2)).replace('.',','):''}" required></label><label>Data e hora do agendamento<input name="agendadoPara" type="datetime-local" value="${localDateTime(quote?.agendado_para||atendimento.agendado_para)}" required></label><label>Montador (opcional)<select name="montadorId"><option value="">Definir posteriormente</option>${assemblerOptions}</select></label><label>Telefone alternativo<input name="telefoneAlternativo" inputmode="tel" value="${escapeHtml(quote?.telefone_alternativo||'')}"></label><label class="full-field">Endereço completo<input name="endereco" value="${escapeHtml(quote?.endereco||'')}" required></label><label class="full-field">Referência para localizar o endereço<textarea name="referencia" rows="2">${escapeHtml(quote?.referencia||'')}</textarea></label></div><button type="submit">${quote?'Atualizar orçamento':'Gerar orçamento e avisar o cliente'}</button><p class="quote-message" role="status"></p></form></section>`;
}

async function openConversation(id,{initial=true,restoreScrollTop=null,silent=false}={}){
  if(state.conversationLoading){if(silent)return;await state.conversationTask}
  const openingNew=state.currentConversation!==id;if(openingNew){initial=true;state.conversationSignature=''}
  const currentBox=conversationPane.querySelector('.conversation-messages'),currentForm=conversationPane.querySelector('.conversation-form'),currentQuote=conversationPane.querySelector('.quote-panel');
  const preservedTop=restoreScrollTop??currentBox?.scrollTop??0,draft=currentForm?.elements.texto?.value||'',quoteOpen=Boolean(currentQuote&&!currentQuote.hidden);
  state.currentConversation=id;document.querySelectorAll('.attendance-card').forEach(card=>{const active=card.dataset.id===id;card.classList.toggle('active',active);if(active)card.setAttribute('aria-current','true');else card.removeAttribute('aria-current')});
  if(!silent)conversationPane.innerHTML='<div class="conversation-empty"><p>Carregando conversa…</p></div>';
  state.conversationLoading=true;let finishConversationTask;state.conversationTask=new Promise(resolve=>{finishConversationTask=resolve});
  try{
    if(!state.staff.length&&!state.assemblers.length)await loadSupportData();
    const data=await api(`/api/admin/conversation?id=${encodeURIComponent(id)}`);const a=data.atendimento;const permissions=data.permissoes||{};
    if(state.currentConversation!==id)return;
    const signature=JSON.stringify([a.id,a.status,a.atendente_id,a.atualizado_em,data.orcamento,permissions,(data.mensagens||[]).map(message=>[message.id,message.tipo_remetente,message.texto,message.criado_em,message.anexo_id])]);
    if(silent&&(signature===state.conversationSignature||quoteOpen))return;
    const staffOptions=state.staff.filter(item=>item.id!==a.atendente_id).map(item=>`<option value="${item.id}">${escapeHtml(item.nome_exibicao)} · ${item.perfil==='ADMINISTRADOR'?'Admin':'Atendente'}</option>`).join('');
    const messages=(data.mensagens||[]).map(message=>{const image=message.anexo_id&&String(message.tipo_mime||'').toLowerCase().startsWith('image/');const url=`/api/conversations/attachment?conversationId=${encodeURIComponent(id)}&messageId=${encodeURIComponent(message.id)}`;const content=image?`<a href="${url}" target="_blank" rel="noopener noreferrer" aria-label="Abrir imagem anexada"><img src="${url}" alt="${escapeHtml(message.nome_arquivo||'Imagem anexada')}" loading="lazy"></a>`:message.anexo_id?'<span>Anexo enviado</span>':renderAdminMessageContent(message);const quoteClass=content.includes('admin-quote-summary')?' quote-message-card':'';return `<div class="admin-message ${message.tipo_remetente==='ATENDENTE'?'from-staff':''}${quoteClass}">${content}<small>${message.tipo_remetente} · ${formatDate(message.criado_em)}</small></div>`}).join('');
    conversationPane.innerHTML=`<header class="conversation-head"><div><h2>Atendimento #${a.numero_atendimento} · ${escapeHtml(a.nome_cliente)}</h2><p>${escapeHtml(a.telefone)} · ${a.atendente_nome?`Responsável: ${escapeHtml(a.atendente_nome)}`:'Na fila'}</p><span class="conversation-status status-${String(a.status||'').toLowerCase()}">${labels[a.status]||escapeHtml(a.status)}</span></div><div class="conversation-actions">${permissions.podeGerarOrcamento?'<button type="button" class="quote-button">Gerar orçamento</button>':''}${permissions.podeFinalizar?'<button type="button" class="finalize-button">Finalizar atendimento</button>':''}${permissions.podeTransferir&&a.atendente_id?`<select class="transfer-select" aria-label="Transferir para"><option value="">Transferir para…</option>${staffOptions}</select><button type="button" class="transfer-button ghost">Transferir</button>`:''}</div></header><div class="conversation-messages">${messages||'<div class="empty">Nenhuma mensagem.</div>'}</div><button type="button" class="admin-jump-latest" aria-label="Ir para a mensagem mais recente" title="Mensagem mais recente" hidden>↓</button>${quoteForm(a,data.orcamento)}${permissions.podeResponder?'<form class="conversation-form"><input name="texto" placeholder="Digite uma resposta para o cliente…" maxlength="2000" required><button>Enviar</button></form>':'<div class="permission-note">Atendimento finalizado ou sem permissão para responder.</div>'}`;
    const messageBox=conversationPane.querySelector('.conversation-messages');
    const jumpButton=conversationPane.querySelector('.admin-jump-latest');
    let userNavigated=false;
    const distanceFromLatest=()=>messageBox.scrollHeight-messageBox.clientHeight-messageBox.scrollTop;
    const updateJumpButton=()=>{jumpButton.hidden=distanceFromLatest()<=12};
    const scrollToLatest=()=>{messageBox.scrollTo({top:messageBox.scrollHeight,left:0,behavior:'auto'});jumpButton.hidden=true};
    if(initial){scrollToLatest();requestAnimationFrame(()=>{if(!userNavigated)scrollToLatest()})}
    else{messageBox.scrollTop=Math.max(0,preservedTop);requestAnimationFrame(updateJumpButton)}
    messageBox.querySelectorAll('img').forEach(image=>image.addEventListener('load',()=>{if(initial&&!userNavigated)scrollToLatest();else updateJumpButton()},{once:true}));
    ['wheel','touchstart','pointerdown'].forEach(type=>messageBox.addEventListener(type,()=>{userNavigated=true},{passive:true}));
    messageBox.addEventListener('scroll',updateJumpButton,{passive:true});
    jumpButton.addEventListener('click',()=>{userNavigated=false;scrollToLatest()});
    state.conversationSignature=signature;const restoredInput=conversationPane.querySelector('.conversation-form input[name="texto"]');if(restoredInput&&draft)restoredInput.value=draft;
    conversationPane.querySelector('.quote-button')?.addEventListener('click',()=>{conversationPane.querySelector('.quote-panel').hidden=false});
    conversationPane.querySelector('.close-quote')?.addEventListener('click',()=>{conversationPane.querySelector('.quote-panel').hidden=true;openConversation(id,{initial:false,silent:true})});
    conversationPane.querySelector('.transfer-button')?.addEventListener('click',async event=>{const target=conversationPane.querySelector('.transfer-select').value;if(!target){showError(new Error('Selecione o usuário que receberá o atendimento.'));return}event.currentTarget.disabled=true;try{await claim(id,target)}catch(error){showError(error);event.currentTarget.disabled=false}});
    conversationPane.querySelector('.finalize-button')?.addEventListener('click',async event=>{if(!confirm('Confirmar o pagamento do cliente e finalizar este atendimento?'))return;event.currentTarget.disabled=true;try{await api('/api/admin/finalize',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({atendimentoId:id})});state.conversationSignature='';await openConversation(id,{initial:false,restoreScrollTop:messageBox.scrollTop});await loadConversations();if(state.user?.perfil==='ADMINISTRADOR')loadQuotes({silent:true})}catch(error){showError(error);event.currentTarget.disabled=false}});
    conversationPane.querySelector('.conversation-form')?.addEventListener('submit',async event=>{event.preventDefault();const input=event.currentTarget.elements.texto;const button=event.currentTarget.querySelector('button');const preservedTop=messageBox.scrollTop;button.disabled=true;try{await api('/api/admin/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({atendimentoId:id,texto:input.value})});await openConversation(id,{initial:false,restoreScrollTop:preservedTop});await loadConversations()}catch(error){showError(error);button.disabled=false}});
    conversationPane.querySelector('#quote-form')?.addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button[type=submit]'),message=event.currentTarget.querySelector('.quote-message'),preservedTop=messageBox.scrollTop;button.disabled=true;message.textContent='';try{const values=Object.fromEntries(new FormData(event.currentTarget));values.atendimentoId=id;values.agendadoPara=new Date(values.agendadoPara).toISOString();await api('/api/admin/quote',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});await openConversation(id,{initial:false,restoreScrollTop:preservedTop});await loadConversations()}catch(error){message.className='quote-message error';message.textContent=error.message;button.disabled=false}});
  }catch(error){if(!silent)conversationPane.innerHTML=`<div class="conversation-empty"><p class="error">${escapeHtml(error.message)}</p></div>`;if(error.message.includes('Sessão')){stopLiveUpdates();dashboard.hidden=true;loginView.hidden=false;state.user=null}}
  finally{state.conversationLoading=false;finishConversationTask();state.conversationTask=null}
}

function switchView(view){
  state.currentView=view;$('#attendances-view').hidden=view!=='attendances';$('#users-view').hidden=view!=='users';$('#quotes-view').hidden=view!=='quotes';
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===view));
  if(view==='users')loadUsers();if(view==='quotes')loadQuotes();
}

async function loadUsers(){
  const container=$('#users-list');container.innerHTML='<div class="empty">Carregando usuários…</div>';
  try{const data=await api('/api/admin/users');state.users=data.usuarios||[];container.innerHTML=state.users.map(user=>`<article class="user-card ${user.ativo?'':'inactive'}"><div><h3>${escapeHtml(user.nomeExibicao)}</h3><p>${escapeHtml(user.nomeCompleto)}</p><p>Login: <strong>${escapeHtml(user.login)}</strong></p></div><div class="user-card-meta"><span class="permission-badge">${user.perfil==='ADMINISTRADOR'?'Administrador':'Atendente'}</span><span class="${user.ativo?'active-label':'inactive-label'}">${user.ativo?'Ativo':'Inativo'}</span><button class="ghost edit-user" data-user-id="${user.id}">Editar</button></div></article>`).join('')||'<div class="empty">Nenhum usuário cadastrado.</div>'}catch(error){container.innerHTML='';showError(error)}
}

const formatDateOnly=value=>value?new Date(value).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
const quoteStatusLabel={GERADO:'Gerado',MONTADOR_ATRIBUIDO:'Montador atribuído',FINALIZADO:'Finalizado',PENDENTE:'Pendente',PAGO:'Pago'};
function populateQuoteFilters(){
  const assembler=$('#quote-assembler'),attendant=$('#quote-attendant'),currentAssembler=assembler.value,currentAttendant=attendant.value;
  assembler.innerHTML='<option value="">Todos</option>'+state.quoteAssemblers.map(item=>`<option value="${item.id}">${escapeHtml(item.nome)}</option>`).join('');
  attendant.innerHTML='<option value="">Todos</option>'+state.quoteAttendants.map(item=>`<option value="${item.id}">${escapeHtml(item.nome_exibicao)}</option>`).join('');
  assembler.value=currentAssembler;attendant.value=currentAttendant;
}
function renderQuotes(){
  const term=$('#quote-search').value.trim().toLowerCase(),quoteStatus=$('#quote-status').value,clientPayment=$('#quote-client-payment').value,assemblerPayment=$('#quote-assembler-payment').value,assemblerId=$('#quote-assembler').value,attendantId=$('#quote-attendant').value;
  const rows=state.quotes.filter(row=>{const searchable=`${row.numero_atendimento} ${row.nome_cliente} ${row.telefone_cliente} ${row.telefone_alternativo||''}`.toLowerCase();return(!term||searchable.includes(term))&&(!quoteStatus||row.status_orcamento===quoteStatus)&&(!clientPayment||row.status_pag_cliente===clientPayment)&&(!assemblerPayment||row.status_pg_montador===assemblerPayment)&&(!assemblerId||row.montador_id===assemblerId)&&(!attendantId||row.atendente_id===attendantId)});
  const totals=rows.reduce((sum,row)=>{const value=Number(row.valor||0),assembler=Number(row.valor_montador||0)+Number(row.adicional_montador||0);sum.gross+=value;if(row.status_pag_cliente==='PAGO'){sum.received+=value;sum.clientPaid+=1}else{sum.receivable+=value;sum.clientPending+=1}if(row.status_pg_montador==='PAGO'){sum.assemblerPaid+=assembler;sum.assemblerPaidCount+=1}else{sum.assemblerPending+=assembler;sum.assemblerPendingCount+=1}return sum},{gross:0,received:0,receivable:0,assemblerPaid:0,assemblerPending:0,clientPaid:0,clientPending:0,assemblerPaidCount:0,assemblerPendingCount:0});
  $('#quote-totals').innerHTML=`<article><span>Total orçado</span><strong>${formatMoney(totals.gross)}</strong><small>${rows.length} orçamento${rows.length===1?'':'s'}</small></article><article><span>Recebido de clientes</span><strong>${formatMoney(totals.received)}</strong><small>${totals.clientPaid} pagos · ${totals.clientPending} pendentes (${formatMoney(totals.receivable)})</small></article><article><span>Repasses pagos</span><strong>${formatMoney(totals.assemblerPaid)}</strong><small>${totals.assemblerPaidCount} pagos · ${totals.assemblerPendingCount} pendentes (${formatMoney(totals.assemblerPending)})</small></article><article><span>Resultado previsto</span><strong>${formatMoney(totals.gross-totals.assemblerPaid-totals.assemblerPending)}</strong><small>Antes de outras despesas</small></article>`;
  $('#quotes-list').innerHTML=rows.map(row=>`<tr><td><strong>#${row.numero_atendimento} · ${escapeHtml(row.nome_cliente)}</strong><small>${escapeHtml(row.telefone_cliente)}${row.telefone_alternativo?` · Alt.: ${escapeHtml(row.telefone_alternativo)}`:''}</small><small>${escapeHtml(row.endereco)}${row.referencia?` · Ref.: ${escapeHtml(row.referencia)}`:''}</small><small>Atendente: ${escapeHtml(row.atendente_nome||'Não atribuído')}</small></td><td>${formatDateOnly(row.agendado_para)}<small>${escapeHtml(row.descricao_servico)}</small></td><td><span class="finance-status status-${String(row.status_orcamento).toLowerCase()}">${quoteStatusLabel[row.status_orcamento]||row.status_orcamento}</span><small>Cliente: <b>${quoteStatusLabel[row.status_pag_cliente]}</b></small><small>Montador: <b>${quoteStatusLabel[row.status_pg_montador]}</b></small></td><td><strong>${formatMoney(row.valor)}</strong><small>Repasse: ${formatMoney(row.valor_montador)}</small><small>Adicional: ${formatMoney(row.adicional_montador)}</small><small>Total montador: ${formatMoney(Number(row.valor_montador||0)+Number(row.adicional_montador||0))}</small></td><td>${escapeHtml(row.montador_nome||'Não atribuído')}<small>${row.percentual_repasse!=null?`${Number(row.percentual_repasse).toLocaleString('pt-BR')}% de repasse`:''}</small></td><td><button type="button" class="manage-quote ghost" data-quote-id="${row.id}">Gerenciar</button></td></tr>`).join('');
  $('#quotes-empty').hidden=rows.length>0;$('.quote-table-wrap').hidden=rows.length===0;
}
async function loadQuotes({silent=false}={}){
  if(state.quotesLoading||state.user?.perfil!=='ADMINISTRADOR')return;state.quotesLoading=true;
  try{const data=await api('/api/admin/quotes'),signature=JSON.stringify(data.orcamentos||[]);if(!silent||signature!==state.quotesSignature){state.quotes=data.orcamentos||[];state.quoteAssemblers=data.montadores||[];state.quoteAttendants=data.atendentes||[];state.quotesSignature=signature;populateQuoteFilters();renderQuotes()}}
  catch(error){if(!silent)showError(error)}finally{state.quotesLoading=false}
}
function openQuoteManagement(id){
  const quote=state.quotes.find(item=>item.id===id);if(!quote)return;const form=$('#quote-management-form');form.reset();form.elements.id.value=quote.id;
  form.elements.montadorId.innerHTML='<option value="">Não atribuído</option>'+state.quoteAssemblers.map(item=>`<option value="${item.id}">${escapeHtml(item.nome)} · ${Number(item.percentual_repasse||0).toLocaleString('pt-BR')}%</option>`).join('');
  form.elements.montadorId.value=quote.montador_id||'';form.elements.adicionalMontador.value=Number(quote.adicional_montador||0).toFixed(2).replace('.',',');form.elements.statusPagCliente.value=quote.status_pag_cliente;form.elements.statusPgMontador.value=quote.status_pg_montador;
  $('#quote-management-title').textContent=`Orçamento do atendimento #${quote.numero_atendimento}`;$('#quote-management-customer').textContent=`${quote.nome_cliente} · ${quote.telefone_cliente}`;
  $('#quote-management-summary').innerHTML=`<div><span>Valor do orçamento</span><strong>${formatMoney(quote.valor)}</strong></div><div><span>Repasse calculado</span><strong>${formatMoney(quote.valor_montador)}</strong></div><div><span>Adicional atual</span><strong>${formatMoney(quote.adicional_montador)}</strong></div>`;
  $('#quote-management-message').textContent='';$('#quote-management-modal').hidden=false;
}

function openUserModal(user=null){
  const form=$('#user-form');form.reset();form.elements.id.value=user?.id||'';form.elements.nomeExibicao.value=user?.nomeExibicao||'';form.elements.nomeCompleto.value=user?.nomeCompleto||'';form.elements.login.value=user?.login||'';form.elements.perfil.value=user?.perfil||'ATENDENTE';form.elements.ativo.checked=user?.ativo!==false;form.elements.senha.required=!user;$('#active-field').hidden=!user;$('#password-hint').textContent=user?'(deixe vazio para manter a atual)':'(mínimo de 10 caracteres)';$('#user-modal-title').textContent=user?'Editar usuário':'Cadastrar usuário';$('#user-message').textContent='';$('#user-modal').hidden=false;
}

$('#login-form').addEventListener('submit',async event=>{event.preventDefault();const button=event.currentTarget.querySelector('button');button.disabled=true;$('#login-error').textContent='';try{await api('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});loginView.hidden=true;dashboard.hidden=false;await loadConversations();startLiveUpdates()}catch(error){$('#login-error').textContent=error.message}finally{button.disabled=false}});
list.addEventListener('click',async event=>{const claimButton=event.target.closest('[data-claim]');if(claimButton){claimButton.disabled=true;try{await claim(claimButton.dataset.claim)}catch(error){showError(error);claimButton.disabled=false}return}const card=event.target.closest('.attendance-card');if(card)openConversation(card.dataset.id)});
document.querySelectorAll('.filter').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(item=>item.classList.remove('active'));button.classList.add('active');state.status=button.dataset.status;$('#queue-title').textContent=button.querySelector('span').textContent;loadConversations()}));
document.querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>switchView(button.dataset.view)));
$('#refresh').addEventListener('click',()=>loadConversations());$('#search').addEventListener('input',applySearchFilter);$('.search-clear').addEventListener('click',()=>{$('#search').value='';applySearchFilter()});
$('#logout').addEventListener('click',async()=>{stopLiveUpdates();await fetch('/api/admin/logout',{method:'POST'});dashboard.hidden=true;loginView.hidden=false;state.user=null;state.currentConversation=null;state.queueSignature='';state.conversationSignature=''});
$('#change-password').addEventListener('click',()=>{$('#password-form').reset();$('#password-message').textContent='';$('#password-modal').hidden=false});$('#close-password').addEventListener('click',()=>$('#password-modal').hidden=true);
$('#password-form').addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));if(values.novaSenha!==values.confirmacao){$('#password-message').textContent='A confirmação não coincide com a nova senha.';return}const button=event.currentTarget.querySelector('button');button.disabled=true;try{await api('/api/admin/password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});$('#password-message').className='success';$('#password-message').textContent='Senha alterada com sucesso.';event.currentTarget.reset()}catch(error){$('#password-message').textContent=error.message}finally{button.disabled=false}});
$('#new-user').addEventListener('click',()=>openUserModal());$('#close-user').addEventListener('click',()=>$('#user-modal').hidden=true);$('#users-list').addEventListener('click',event=>{const button=event.target.closest('.edit-user');if(button)openUserModal(state.users.find(user=>user.id===button.dataset.userId))});
$('#user-form').addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));values.ativo=event.currentTarget.elements.ativo.checked;const editing=Boolean(values.id),button=event.currentTarget.querySelector('button[type=submit]');button.disabled=true;$('#user-message').textContent='';try{await api('/api/admin/users',{method:editing?'PATCH':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});$('#user-modal').hidden=true;await loadUsers();state.staff=[]}catch(error){$('#user-message').textContent=error.message}finally{button.disabled=false}});
['#quote-search','#quote-status','#quote-client-payment','#quote-assembler-payment','#quote-assembler','#quote-attendant'].forEach(selector=>$(selector).addEventListener(selector==='#quote-search'?'input':'change',renderQuotes));
$('#refresh-quotes').addEventListener('click',()=>loadQuotes());$('#quotes-list').addEventListener('click',event=>{const button=event.target.closest('.manage-quote');if(button)openQuoteManagement(button.dataset.quoteId)});$('#close-quote-management').addEventListener('click',()=>$('#quote-management-modal').hidden=true);
$('#quote-management-form').addEventListener('submit',async event=>{event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget)),button=event.currentTarget.querySelector('button[type="submit"]'),message=$('#quote-management-message');if(values.statusPagCliente==='PAGO'&&!confirm('Confirmar o pagamento do cliente? O atendimento será finalizado.'))return;button.disabled=true;message.textContent='';try{await api('/api/admin/quote-management',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});$('#quote-management-modal').hidden=true;state.quotesSignature='';await Promise.all([loadQuotes(),loadConversations({silent:true})]);if(state.currentConversation)openConversation(state.currentConversation,{initial:false,silent:true})}catch(error){message.textContent=error.message}finally{button.disabled=false}});
document.querySelectorAll('.modal').forEach(modal=>modal.addEventListener('click',event=>{if(event.target===modal)modal.hidden=true}));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.user){loadConversations({silent:true});if(state.currentView==='quotes')loadQuotes({silent:true});if(state.currentConversation&&state.currentView==='attendances')openConversation(state.currentConversation,{initial:false,silent:true})}});
async function restoreSession(){sessionLoading.hidden=false;loginView.hidden=true;dashboard.hidden=true;const restored=await loadConversations({silent:true});sessionLoading.hidden=true;if(restored&&state.user){loginView.hidden=true;dashboard.hidden=false;startLiveUpdates()}else{dashboard.hidden=true;loginView.hidden=false}}
restoreSession();
