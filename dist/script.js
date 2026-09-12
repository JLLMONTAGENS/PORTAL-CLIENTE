const areas={
  capital:{kicker:'RIO DE JANEIRO — CAPITAL',title:'Da Zona Sul à Zona Oeste',copy:'Atendimento em bairros residenciais e comerciais de toda a cidade.',places:['Barra da Tijuca','Recreio dos Bandeirantes','Jacarepaguá','Tijuca','Vila Isabel','Méier','Madureira','Campo Grande','Bangu','Copacabana','Ipanema','Leblon','Botafogo','Flamengo','Laranjeiras','Centro','Santa Teresa','Ilha do Governador']},
  metropolitana:{kicker:'REGIÃO METROPOLITANA',title:'Grande Rio conectado',copy:'Serviços agendados nas principais cidades ao redor da capital.',places:['Niterói','São Gonçalo','Itaboraí','Maricá','Tanguá','Rio Bonito','Cachoeiras de Macacu','Magé','Guapimirim','Duque de Caxias','São João de Meriti','Nilópolis']},
  baixada:{kicker:'BAIXADA FLUMINENSE',title:'Atendimento na Baixada',copy:'Deslocamento planejado para residências, condomínios e empresas.',places:['Nova Iguaçu','Duque de Caxias','Belford Roxo','São João de Meriti','Nilópolis','Mesquita','Queimados','Japeri','Seropédica','Paracambi','Itaguaí','Magé']},
  norte:{kicker:'NORTE FLUMINENSE',title:'Da costa ao interior',copy:'Atendimento sob consulta e agendamento nas cidades do Norte Fluminense.',places:['Campos dos Goytacazes','Macaé','Rio das Ostras','Carapebus','Quissamã','São João da Barra','São Francisco de Itabapoana','Conceição de Macabu']}
};

const renderArea=(key)=>{const area=areas[key];if(!area)return;document.querySelector('#area-kicker').textContent=area.kicker;document.querySelector('#area-title').textContent=area.title;document.querySelector('#area-copy').textContent=area.copy;document.querySelector('#area-list').innerHTML=area.places.map(place=>`<li>${place}</li>`).join('');document.querySelectorAll('.area-tabs button').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.area===key)))};

document.querySelectorAll('.area-tabs button').forEach(button=>button.addEventListener('click',()=>renderArea(button.dataset.area)));
renderArea('capital');

const menuButton=document.querySelector('.menu-toggle');
menuButton.addEventListener('click',()=>{const header=document.querySelector('.site-header');const open=header.classList.toggle('open');menuButton.setAttribute('aria-expanded',String(open))});
document.querySelectorAll('#main-nav a').forEach(link=>link.addEventListener('click',()=>{document.querySelector('.site-header').classList.remove('open');menuButton.setAttribute('aria-expanded','false')}));

fetch('/config.json').then(response=>response.json()).then(config=>{
  document.querySelector('#cnpj').textContent=`CNPJ: ${config.cnpj}`;
  const number=String(config.whatsappNumber||'').replace(/\D/g,'');
  const message=encodeURIComponent(config.whatsappMessage||'Olá! Gostaria de solicitar um orçamento.');
  if(number){const schema=document.querySelector('#business-schema');const data=JSON.parse(schema.textContent);data.telephone=`+${number}`;schema.textContent=JSON.stringify(data)}
  document.querySelectorAll('.whatsapp-link').forEach(link=>{link.href=number?`https://wa.me/${number}?text=${message}`:'#';if(number){link.target='_blank'}else{link.addEventListener('click',event=>{event.preventDefault();const alert=document.querySelector('#config-alert');alert.hidden=false;clearTimeout(window.configTimer);window.configTimer=setTimeout(()=>alert.hidden=true,5000)})}});
}).catch(()=>{});

document.querySelector('#year').textContent=new Date().getFullYear();
const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('visible');observer.unobserve(entry.target)}}),{threshold:.12});
document.querySelectorAll('.reveal').forEach(el=>observer.observe(el));

document.querySelectorAll('details').forEach(item=>item.addEventListener('toggle',()=>{if(item.open)document.querySelectorAll('details[open]').forEach(other=>{if(other!==item)other.open=false})}));
