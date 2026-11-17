const $=selector=>document.querySelector(selector);
const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const formatDate=value=>value?new Date(value).toLocaleString('pt-BR'):'—';
let rows=[];

document.head.insertAdjacentHTML('beforeend','<style>button:disabled{cursor:not-allowed;opacity:.62}.secondary.action-complete{border-color:#75c893;background:#e9f8ee;color:#067647;opacity:1}#message.success,#detail-message.success{color:#067647;font-weight:750}</style>');

async function api(url,options={}){
  const response=await fetch(url,{cache:'no-store',...options});
  const data=await response.json().catch(()=>({}));
  if(response.status===401){location.href='/admin/';throw new Error('Sessão expirada.')}
  if(!response.ok)throw new Error(data.error||'Não foi possível concluir.');
  return data;
}

const statusLabel=status=>({PENDENTE_DOCUMENTO:'Pendente de certidão',CADASTRO_RECEBIDO:'Cadastro recebido',EM_ANALISE:'Em análise',APROVADO:'Aprovado',REJEITADO:'Não aprovado',SUSPENSO:'Suspenso',LEGADO:'Legado'}[status]||status);

async function load(){
  const list=$('#list');
  list.innerHTML='<p>Carregando…</p>';
  try{
    const query=new URLSearchParams({search:$('#search').value,status:$('#status').value});
    const data=await api('/api/admin/montador-cadastros?'+query);
    rows=data.montadores||[];
    list.innerHTML=rows.length?rows.map(row=>`<article class="card"><div><h2>${escapeHtml(row.nome_completo||row.nome)}</h2><p>${escapeHtml(row.email||'Sem e-mail')} · ${escapeHtml(row.whatsapp||'')}</p></div><div><small>CPF</small><br>${escapeHtml(row.cpf_mascarado)}</div><div><span class="badge ${row.status_cadastro==='APROVADO'?'approved':''}">${statusLabel(row.status_cadastro)}</span><br><small>Certidão: ${escapeHtml(row.certidao_status)}</small></div><button data-id="${row.id}">Analisar</button></article>`).join(''):'<p>Nenhum cadastro encontrado.</p>';
  }catch(error){list.innerHTML='';$('#message').textContent=error.message}
}

$('#list').addEventListener('click',event=>{const button=event.target.closest('[data-id]');if(button)openDetail(button.dataset.id)});
$('#refresh').onclick=load;
$('#status').onchange=load;
let timer;
$('#search').oninput=()=>{clearTimeout(timer);timer=setTimeout(load,250)};

function documentActions(item){
  const approved=item.status_revisao==='APROVADO';
  const rejected=item.status_revisao==='REJEITADO';
  return `<div class="doc"><a href="/api/admin/montador-documento?id=${item.id}" target="_blank" rel="noopener">${escapeHtml(item.tipo)} · ${escapeHtml(item.nome_arquivo)}</a><div><span class="badge ${approved?'approved':''}">${escapeHtml(item.status_revisao)}</span><button class="secondary review ${approved?'action-complete':''}" data-doc="${item.id}" data-status="APROVADO" ${approved?'disabled':''}>${approved?'✓ Documento aprovado':'Aprovar documento'}</button><button class="secondary review ${rejected?'action-complete':''}" data-doc="${item.id}" data-status="REJEITADO" ${rejected?'disabled':''}>${rejected?'✓ Documento rejeitado':'Rejeitar'}</button></div></div>`;
}

async function openDetail(id){
  try{
    const data=await api('/api/admin/montador-cadastros?id='+encodeURIComponent(id));
    const m=data.montador;
    $('#detail').innerHTML=`<h2>${escapeHtml(m.nome_completo||m.nome)}</h2><p>CPF ${escapeHtml(m.cpf)} · CNPJ ${escapeHtml(m.cnpj||'não informado')} · cadastro ${formatDate(m.criado_em)}</p><form id="detail-form" class="detail-form"><input name="id" type="hidden" value="${m.id}"><div class="detail-grid"><label>Nome completo<input name="nomeCompleto" value="${escapeHtml(m.nome_completo||m.nome)}" required></label><label>E-mail<input name="email" type="email" value="${escapeHtml(m.email||'')}" required></label><label>WhatsApp<input name="whatsapp" value="${escapeHtml(m.whatsapp||'')}"></label><label>Telefone alternativo<input name="telefoneAlternativo" value="${escapeHtml(m.telefone_alternativo||'')}"></label><label>CEP<input name="cep" value="${escapeHtml(m.cep||'')}"></label><label>Tipo logradouro<input name="tipoLogradouro" value="${escapeHtml(m.tipo_logradouro||'')}"></label><label class="span-3">Logradouro<input name="logradouro" value="${escapeHtml(m.logradouro||'')}"></label><label>Número<input name="numero" value="${escapeHtml(m.numero||'')}"></label><label>Complemento<input name="complemento" value="${escapeHtml(m.complemento||'')}"></label><label>Bairro<input name="bairro" value="${escapeHtml(m.bairro||'')}"></label><label>Cidade<input name="cidade" value="${escapeHtml(m.cidade||'')}"></label><label>UF<input name="uf" value="${escapeHtml(m.uf||'')}"></label><label>Banco código<input name="bancoCodigo" value="${escapeHtml(m.banco_codigo||'')}"></label><label class="span-3">Banco<input name="bancoNome" value="${escapeHtml(m.banco_nome||'')}"></label><label>Agência<input name="agencia" value="${escapeHtml(m.agencia||'')}"></label><label>Conta<input name="conta" value="${escapeHtml(m.conta||'')}"></label><label>Chave Pix<input name="chavePix" value="${escapeHtml(m.chave_pix||'')}"></label><label>Percentual de repasse<input name="percentualRepasse" type="number" min="0" max="100" step="0.01" value="${Number(m.percentual_repasse||0)}"></label><label>Status<select name="statusCadastro">${['PENDENTE_DOCUMENTO','EM_ANALISE','APROVADO','REJEITADO','SUSPENSO'].map(status=>`<option ${status===m.status_cadastro?'selected':''}>${status}</option>`).join('')}</select></label><label class="span-3">Observações internas<textarea name="observacoesInternas" rows="3">${escapeHtml(m.observacoes_internas||'')}</textarea></label></div><button type="submit">Salvar cadastro</button><p id="detail-message" role="status"></p></form><h3>Documentos privados</h3><div class="documents">${data.documentos.length?data.documentos.map(documentActions).join(''):'<p>Nenhum documento.</p>'}</div><h3>Termos aceitos</h3><div>${data.termos.map(term=>`<p>${escapeHtml(term.tipo)} · versão ${escapeHtml(term.versao)} · ${formatDate(term.aceito_em)}</p>`).join('')}</div><h3>Auditoria</h3><div class="audit">${data.auditoria.map(item=>`<div class="event"><span>${escapeHtml(item.acao)} · ${escapeHtml(item.ator_tipo)}</span><small>${formatDate(item.criado_em)}</small></div>`).join('')}</div>`;
    $('#modal').hidden=false;
    $('#detail-form').onsubmit=saveDetail;
    document.querySelectorAll('.review').forEach(button=>button.onclick=()=>review(button,id));
  }catch(error){$('#message').textContent=error.message}
}

async function saveDetail(event){
  event.preventDefault();
  const form=event.currentTarget,button=form.querySelector('button[type=submit]'),message=$('#detail-message');
  const values=Object.fromEntries(new FormData(form));
  button.disabled=true;
  button.textContent='Salvando…';
  message.textContent='';
  try{
    await api('/api/admin/montador-cadastros',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)});
    $('#modal').hidden=true;
    await load();
    $('#message').className='success';
    $('#message').textContent='Cadastro salvo e informações atualizadas.';
  }catch(error){message.textContent=error.message;button.disabled=false;button.textContent='Salvar cadastro'}
}

async function review(button,montadorId){
  const id=button.dataset.doc,status=button.dataset.status;
  const actions=button.closest('.doc').querySelectorAll('.review'),originalText=button.textContent;
  actions.forEach(action=>action.disabled=true);
  button.textContent=status==='APROVADO'?'Aprovando…':'Rejeitando…';
  $('#detail-message').textContent='';
  try{
    const data=await api('/api/admin/montador-documento-revisao',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status})});
    await openDetail(montadorId);
    $('#detail-message').className='success';
    $('#detail-message').textContent=data.mensagem||'Revisão concluída.';
  }catch(error){actions.forEach(action=>action.disabled=false);button.textContent=originalText;$('#detail-message').textContent=error.message}
}

$('#close').onclick=()=>$('#modal').hidden=true;
$('#modal').onclick=event=>{if(event.target===$('#modal'))$('#modal').hidden=true};
load();
