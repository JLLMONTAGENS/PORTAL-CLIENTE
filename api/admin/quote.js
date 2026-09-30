const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

const formatMoney=cents=>(Number(cents)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const formatDate=value=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'});
const moneyToCents=value=>{const normalized=String(value??'').trim().replace(/\./g,'').replace(',','.');const amount=Number(normalized);return Number.isFinite(amount)?Math.round(amount*100):NaN};

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  try{
    const atendimentoId=String(req.body?.atendimentoId||'');
    const descricaoServico=String(req.body?.descricaoServico||'').trim();
    const agendadoPara=String(req.body?.agendadoPara||'');
    const endereco=String(req.body?.endereco||'').trim();
    const referencia=String(req.body?.referencia||'').trim();
    const telefoneAlternativo=String(req.body?.telefoneAlternativo||'').trim();
    const montadorId=String(req.body?.montadorId||'').trim()||null;
    const valorCentavos=moneyToCents(req.body?.valor);
    if(!atendimentoId||descricaoServico.length<5||!agendadoPara||Number.isNaN(new Date(agendadoPara).getTime())||endereco.length<5||!Number.isInteger(valorCentavos)||valorCentavos<0)return res.status(400).json({error:'Preencha descrição, valor, data de agendamento e endereço corretamente.'});
    const sql=getDatabase();
    const atendimentos=await sql`SELECT id,numero_atendimento,nome_cliente,telefone,atendente_id FROM atendimentos WHERE id=${atendimentoId} AND status <> 'SERVICO_FINALIZADO' LIMIT 1`;
    const atendimento=atendimentos[0];if(!atendimento)return res.status(404).json({error:'Atendimento não encontrado ou finalizado.'});
    if(user.perfil!=='ADMINISTRADOR'&&atendimento.atendente_id!==user.id)return res.status(403).json({error:'Somente o responsável pelo atendimento pode gerar o orçamento.'});
    if(montadorId){const montador=await sql`SELECT id FROM montadores WHERE id=${montadorId} AND ativo=TRUE LIMIT 1`;if(!montador[0])return res.status(400).json({error:'Montador inválido ou inativo.'})}
    const status=montadorId?'ATRIBUIDO_MONTADOR':'GEROU_ORCAMENTO';
    const saudacao=`Olá, ${atendimento.nome_cliente}!\n\nTudo certo! Seu orçamento JLL Montagens foi preparado com sucesso.\n\nAtendimento: #${atendimento.numero_atendimento}\nServiço: ${descricaoServico}\nValor: ${formatMoney(valorCentavos)}\nData agendada: ${formatDate(agendadoPara)}\nEndereço: ${endereco}${referencia?`\nReferência: ${referencia}`:''}${telefoneAlternativo?`\nTelefone alternativo: ${telefoneAlternativo}`:''}\n\nConfira os dados acima. Se precisar alterar alguma informação, é só responder por aqui. Estamos à disposição!`;
    const rows=await sql`INSERT INTO orcamentos (atendimento_id,numero_atendimento,nome_cliente,telefone_cliente,telefone_alternativo,descricao_servico,valor_centavos,agendado_para,endereco,referencia,montador_id,gerado_por) VALUES (${atendimentoId},${atendimento.numero_atendimento},${atendimento.nome_cliente},${atendimento.telefone},${telefoneAlternativo||null},${descricaoServico},${valorCentavos},${agendadoPara},${endereco},${referencia||null},${montadorId},${user.id}) ON CONFLICT (atendimento_id) DO UPDATE SET numero_atendimento=EXCLUDED.numero_atendimento,nome_cliente=EXCLUDED.nome_cliente,telefone_cliente=EXCLUDED.telefone_cliente,telefone_alternativo=EXCLUDED.telefone_alternativo,descricao_servico=EXCLUDED.descricao_servico,valor_centavos=EXCLUDED.valor_centavos,agendado_para=EXCLUDED.agendado_para,endereco=EXCLUDED.endereco,referencia=EXCLUDED.referencia,montador_id=EXCLUDED.montador_id,gerado_por=EXCLUDED.gerado_por,atualizado_em=NOW() RETURNING *`;
    await sql`UPDATE atendimentos SET status=${status},montador_id=${montadorId},detalhes_servico=${descricaoServico},agendado_para=${agendadoPara},valor_servico_centavos=${valorCentavos},atualizado_em=NOW() WHERE id=${atendimentoId}`;
    const message=await sql`INSERT INTO mensagens (atendimento_id,tipo_remetente,remetente_id,texto) VALUES (${atendimentoId},'ATENDENTE',${user.id},${saudacao}) RETURNING id,tipo_remetente,remetente_id,texto,criado_em`;
    await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${atendimentoId},'ORCAMENTO_GERADO',${JSON.stringify({orcamentoId:rows[0].id,valorCentavos,montadorId})}::jsonb)`;
    return res.status(201).json({orcamento:rows[0],mensagem:message[0]});
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível gerar o orçamento.'})}
};
