const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

const formatMoney=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const formatDate=value=>new Date(value).toLocaleDateString('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'});
const moneyValue=value=>{const raw=String(value??'').trim().replace(/[^\d,.-]/g,'');const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const amount=Number(normalized);return Number.isFinite(amount)?amount.toFixed(2):null};

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||'');
    const descricaoServico=String(req.body?.descricaoServico||'').trim();
    const agendadoPara=String(req.body?.agendadoPara||'');
    const endereco=String(req.body?.endereco||'').trim();
    const bairro=String(req.body?.bairro||'').trim();
    const cidade=String(req.body?.cidade||'').trim();
    const referencia=String(req.body?.referencia||'').trim();
    const telefoneAlternativo=String(req.body?.telefoneAlternativo||'').trim();
    const montadorId=String(req.body?.montadorId||'').trim()||null;
    const valor=moneyValue(req.body?.valor);
    if(!atendimentoId||descricaoServico.length<5||!agendadoPara||Number.isNaN(new Date(agendadoPara).getTime())||endereco.length<5||bairro.length<2||cidade.length<2||valor===null||Number(valor)<0)return res.status(400).json({error:'Preencha descrição, valor, data de agendamento, endereço, bairro e cidade corretamente.'});
    const sql=getDatabase();
    const atendimentos=await sql`SELECT id,numero_atendimento,nome_cliente,telefone,atendente_id FROM atendimentos WHERE id=${atendimentoId} AND status <> 'SERVICO_FINALIZADO' LIMIT 1`;
    const atendimento=atendimentos[0];if(!atendimento)return res.status(404).json({error:'Atendimento não encontrado ou finalizado.'});
    if(user.perfil!=='ADMINISTRADOR'&&atendimento.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável pelo atendimento pode gerar o orçamento.'});
    let percentualRepasse=0;if(montadorId){const montador=await sql`SELECT id,percentual_repasse FROM montadores WHERE id=${montadorId} AND ativo=TRUE LIMIT 1`;if(!montador[0])return res.status(400).json({error:'Montador inválido ou inativo.'});percentualRepasse=Number(montador[0].percentual_repasse||0)}
    const valorMontador=(Number(valor)*percentualRepasse/100).toFixed(2);
    const status=montadorId?'ATRIBUIDO_MONTADOR':'GEROU_ORCAMENTO';
    const descricaoMensagem=descricaoServico.replace(/\s+/g,' ');
    const saudacao=`Olá, ${atendimento.nome_cliente}!\n\nTudo certo! Seu orçamento JLL Montagens foi preparado com sucesso.\n\nAtendimento: #${atendimento.numero_atendimento}\nServiço: ${descricaoMensagem}\nValor: ${formatMoney(valor)}\nData agendada: ${formatDate(agendadoPara)}\nEndereço: ${endereco}\nBairro: ${bairro}\nCidade: ${cidade}${referencia?`\nReferência: ${referencia}`:''}${telefoneAlternativo?`\nTelefone alternativo: ${telefoneAlternativo}`:''}\n\nConfira os dados acima. Se precisar alterar alguma informação, é só responder por aqui. Estamos à disposição!`;
    const statusOrcamento=montadorId?'MONTADOR_ATRIBUIDO':'GERADO';
    const rows=await sql`INSERT INTO orcamentos (atendimento_id,numero_atendimento,nome_cliente,telefone_cliente,telefone_alternativo,descricao_servico,valor,agendado_para,endereco,bairro,cidade,referencia,montador_id,gerado_por,status_orcamento,status_pag_cliente,status_pg_montador,valor_montador,montador_alterado_em) VALUES (${atendimentoId},${atendimento.numero_atendimento},${atendimento.nome_cliente},${atendimento.telefone},${telefoneAlternativo||null},${descricaoServico},${valor},${agendadoPara},${endereco},${bairro},${cidade},${referencia||null},${montadorId},${user.id},${statusOrcamento},'PENDENTE','PENDENTE',${valorMontador},CASE WHEN ${montadorId}::uuid IS NOT NULL THEN NOW() ELSE NULL END) ON CONFLICT (atendimento_id) DO UPDATE SET numero_atendimento=EXCLUDED.numero_atendimento,nome_cliente=EXCLUDED.nome_cliente,telefone_cliente=EXCLUDED.telefone_cliente,telefone_alternativo=EXCLUDED.telefone_alternativo,descricao_servico=EXCLUDED.descricao_servico,valor=EXCLUDED.valor,agendado_para=EXCLUDED.agendado_para,endereco=EXCLUDED.endereco,bairro=EXCLUDED.bairro,cidade=EXCLUDED.cidade,referencia=EXCLUDED.referencia,montador_alterado_em=CASE WHEN orcamentos.montador_id IS DISTINCT FROM EXCLUDED.montador_id THEN NOW() ELSE orcamentos.montador_alterado_em END,montador_id=EXCLUDED.montador_id,gerado_por=EXCLUDED.gerado_por,status_orcamento=CASE WHEN orcamentos.status_orcamento='FINALIZADO' THEN orcamentos.status_orcamento ELSE EXCLUDED.status_orcamento END,valor_montador=EXCLUDED.valor_montador,atualizado_em=NOW() RETURNING *`;
    await sql`UPDATE atendimentos SET status=${status},montador_id=${montadorId},detalhes_servico=${descricaoServico},agendado_para=${agendadoPara},valor_servico=${valor},atualizado_em=NOW() WHERE id=${atendimentoId}`;
    const message=await sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,remetente_id,texto) VALUES (${atendimentoId},'ATENDENTE',${user.id},${saudacao}) RETURNING id,tipo_remetente,remetente_id,texto,criado_em`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${atendimentoId},'ORCAMENTO_GERADO',${JSON.stringify({orcamentoId:rows[0].id,valor,montadorId,valorMontador})}::jsonb)`;
    return res.status(201).json({orcamento:rows[0],mensagem:message[0]});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível gerar o orçamento.'})}
};
