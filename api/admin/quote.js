const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');
const {canManageAll}=require('./_permissions');
const {notifyAssignment}=require('../montadores/_push');

const formatMoney=value=>Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const formatDate=value=>new Date(value).toLocaleDateString('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'});
const moneyValue=value=>{const raw=String(value??'').trim().replace(/[^\d,.-]/g,'');if(!raw)return null;const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const amount=Number(normalized);return Number.isFinite(amount)?amount.toFixed(2):null};

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||'');
    const descricaoServico=String(req.body?.descricaoServico||'').trim();
    const agendadoInformado=String(req.body?.agendadoPara||'');
    const dataAgendamento=/^\d{4}-\d{2}-\d{2}/.exec(agendadoInformado)?.[0]||'';
    const agendadoPara=dataAgendamento?`${dataAgendamento}T12:00:00-03:00`:agendadoInformado;
    const endereco=String(req.body?.endereco||'').trim();
    const bairro=String(req.body?.bairro||'').trim();
    const cidade=String(req.body?.cidade||'').trim();
    const referencia=String(req.body?.referencia||'').trim();
    const telefoneAlternativo=String(req.body?.telefoneAlternativo||'').trim();
    const imagensSelecionadas=[...new Set((Array.isArray(req.body?.imagensSelecionadas)?req.body.imagensSelecionadas:[]).map(value=>String(value||'').trim()).filter(Boolean))].slice(0,30);
    const montadorId=null;
    const modoSolicitado=String(req.body?.modoValorMontador||'PERCENTUAL').toUpperCase();
    const modoValorMontador=montadorId&&modoSolicitado==='VALOR'?'VALOR':'PERCENTUAL';
    const valor=moneyValue(req.body?.valor);
    if(!atendimentoId||descricaoServico.length<5||!agendadoPara||Number.isNaN(new Date(agendadoPara).getTime())||endereco.length<5||bairro.length<2||cidade.length<2||valor===null||Number(valor)<0)return res.status(400).json({error:'Preencha descrição, valor, data de agendamento, endereço, bairro e cidade corretamente.'});
    const sql=getDatabase();
    const previousQuote=(await sql`SELECT id,montador_id,status_orcamento FROM orcamentos WHERE atendimento_id=${atendimentoId} LIMIT 1`)[0]||null;
    const atendimentos=await sql`SELECT id,numero_atendimento,nome_cliente,telefone,atendente_id FROM atendimentos WHERE id=${atendimentoId} AND status NOT IN ('SERVICO_FINALIZADO','CANCELADO') LIMIT 1`;
    const atendimento=atendimentos[0];if(!atendimento)return res.status(404).json({error:'Atendimento não encontrado ou finalizado.'});
    if(!canManageAll(user)&&atendimento.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável pelo atendimento pode gerar o orçamento.'});
    if(imagensSelecionadas.length){const validas=await sql`SELECT am.id FROM anexos_mensagem am JOIN mensagens m ON m.id=am.mensagem_id WHERE m.atendimento_id=${atendimentoId} AND m.tipo_remetente='CLIENTE' AND am.tipo_mime LIKE 'image/%' AND am.id IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(imagensSelecionadas)}::jsonb))`;if(validas.length!==imagensSelecionadas.length)return res.status(400).json({error:'Uma ou mais imagens selecionadas não pertencem a este cliente ou não são imagens válidas.'})}
    let percentualRepasse=null;if(montadorId){const montador=await sql`SELECT id,percentual_repasse FROM montadores WHERE id=${montadorId} AND ativo=TRUE LIMIT 1`;if(!montador[0])return res.status(400).json({error:'Montador inválido ou inativo.'});percentualRepasse=Number(montador[0].percentual_repasse??60)}
    const valorInformado=moneyValue(req.body?.valorMontadorInformado);
    if(montadorId&&modoValorMontador==='VALOR'&&(valorInformado===null||Number(valorInformado)<0))return res.status(400).json({error:'Informe corretamente o valor destinado ao montador.'});
    const valorMontador=!montadorId?'0.00':modoValorMontador==='VALOR'?valorInformado:(Number(valor)*percentualRepasse/100).toFixed(2);
    const percentualAplicado=montadorId&&modoValorMontador==='PERCENTUAL'?percentualRepasse:null;
    const status=montadorId?'ATRIBUIDO_MONTADOR':'GEROU_ORCAMENTO';
    const descricaoMensagem=descricaoServico.replace(/\s+/g,' ');
    const saudacao=`Olá, ${atendimento.nome_cliente}!\n\nTudo certo! Seu orçamento JLL Montagens foi preparado com sucesso.\n\nAtendimento: #${atendimento.numero_atendimento}\nServiço: ${descricaoMensagem}\nValor: ${formatMoney(valor)}\nData agendada: ${formatDate(agendadoPara)}\nEndereço: ${endereco}\nBairro: ${bairro}\nCidade: ${cidade}${referencia?`\nReferência: ${referencia}`:''}${telefoneAlternativo?`\nTelefone alternativo: ${telefoneAlternativo}`:''}\n\nConfira os dados acima. Se precisar alterar alguma informação, é só responder por aqui. Estamos à disposição!`;
    const statusOrcamento=montadorId?'MONTADOR_ATRIBUIDO':'GERADO';
    const rows=await sql`INSERT INTO orcamentos (atendimento_id,numero_atendimento,nome_cliente,telefone_cliente,telefone_alternativo,descricao_servico,valor,agendado_para,endereco,bairro,cidade,referencia,montador_id,gerado_por,status_orcamento,status_pag_cliente,status_pg_montador,valor_montador,modo_valor_montador,percentual_repasse_aplicado,montador_alterado_em,status_execucao_montador,atribuicao_versao) VALUES (${atendimentoId},${atendimento.numero_atendimento},${atendimento.nome_cliente},${atendimento.telefone},${telefoneAlternativo||null},${descricaoServico},${valor},${agendadoPara},${endereco},${bairro},${cidade},${referencia||null},${montadorId},${user.id},${statusOrcamento},'PENDENTE','PENDENTE',${valorMontador},${modoValorMontador},${percentualAplicado},CASE WHEN ${montadorId}::uuid IS NOT NULL THEN NOW() ELSE NULL END,CASE WHEN ${montadorId}::uuid IS NOT NULL THEN 'PENDENTE_ACEITE' ELSE NULL END,CASE WHEN ${montadorId}::uuid IS NOT NULL THEN gen_random_uuid() ELSE NULL END) ON CONFLICT (atendimento_id) DO UPDATE SET numero_atendimento=EXCLUDED.numero_atendimento,nome_cliente=EXCLUDED.nome_cliente,telefone_cliente=EXCLUDED.telefone_cliente,telefone_alternativo=EXCLUDED.telefone_alternativo,descricao_servico=EXCLUDED.descricao_servico,valor=EXCLUDED.valor,agendado_para=EXCLUDED.agendado_para,endereco=EXCLUDED.endereco,bairro=EXCLUDED.bairro,cidade=EXCLUDED.cidade,referencia=EXCLUDED.referencia,montador_alterado_em=CASE WHEN orcamentos.montador_id IS DISTINCT FROM EXCLUDED.montador_id THEN NOW() ELSE orcamentos.montador_alterado_em END,status_execucao_montador=CASE WHEN orcamentos.montador_id IS DISTINCT FROM EXCLUDED.montador_id THEN EXCLUDED.status_execucao_montador ELSE orcamentos.status_execucao_montador END,atribuicao_versao=CASE WHEN orcamentos.montador_id IS DISTINCT FROM EXCLUDED.montador_id THEN EXCLUDED.atribuicao_versao ELSE orcamentos.atribuicao_versao END,aceito_montador_em=NULL,aceito_cliente_em=NULL,montador_id=EXCLUDED.montador_id,gerado_por=EXCLUDED.gerado_por,status_orcamento=EXCLUDED.status_orcamento,status_pag_cliente='PENDENTE',status_pg_montador='PENDENTE',valor_montador=EXCLUDED.valor_montador,modo_valor_montador=EXCLUDED.modo_valor_montador,percentual_repasse_aplicado=EXCLUDED.percentual_repasse_aplicado,atualizado_em=NOW() RETURNING *`;
    await sql`DELETE FROM orcamento_imagens_cliente WHERE orcamento_id=${rows[0].id}`;
    for(let index=0;index<imagensSelecionadas.length;index+=1)await sql`INSERT INTO orcamento_imagens_cliente (orcamento_id,anexo_mensagem_id,ordem,selecionado_por) VALUES (${rows[0].id},${imagensSelecionadas[index]},${index+1},${user.id})`;
    await sql`UPDATE atendimentos SET status=${status},montador_id=${montadorId},detalhes_servico=${descricaoServico},agendado_para=${agendadoPara},valor_servico=${valor},atualizado_em=NOW() WHERE id=${atendimentoId}`;
    const message=await sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,remetente_id,texto) VALUES (${atendimentoId},'ATENDENTE',${user.id},${saudacao}) RETURNING id,tipo_remetente,remetente_id,texto,criado_em`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${atendimentoId},'ORCAMENTO_GERADO',${JSON.stringify({orcamentoId:rows[0].id,valor,montadorId,valorMontador,modoValorMontador,percentualAplicado,imagensSelecionadas:imagensSelecionadas.length})}::jsonb)`;
    if(montadorId&&previousQuote?.montador_id!==montadorId)await notifyAssignment({montadorId,orcamentoId:rows[0].id,numeroAtendimento:atendimento.numero_atendimento,descricaoServico,bairro,cidade,valorRepasse:valorMontador,agendadoPara});
    return res.status(201).json({orcamento:rows[0],mensagem:message[0]});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível gerar o orçamento.'})}
};
