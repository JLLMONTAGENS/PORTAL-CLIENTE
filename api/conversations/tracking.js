const {getDatabase,normalizePhone,publicConversation}=require('../_db');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  const phone=normalizePhone(req.body?.phone);
  if(phone.length<12)return res.status(400).json({error:'Informe um telefone válido, com DDD.'});
  try{
    const sql=getDatabase();
    const conversations=await sql`SELECT * FROM atendimentos WHERE telefone=${phone} ORDER BY (status NOT IN ('SERVICO_FINALIZADO','CANCELADO')) DESC,atualizado_em DESC LIMIT 1`;
    if(!conversations[0])return res.status(404).json({error:'Não encontramos atendimento para este telefone.'});
    const conversation=conversations[0];
    const [messages,quotes,events]=await Promise.all([
      sql`SELECT m.id,m.tipo_remetente AS sender_type,m.texto AS body,m.criado_em AS created_at,u.nome_exibicao AS sender_name,a.id AS attachment_id,a.tipo_mime AS attachment_mime,a.nome_arquivo AS attachment_name FROM mensagens m LEFT JOIN usuarios_atendimento u ON u.id=m.remetente_id LEFT JOIN anexos_mensagem a ON a.mensagem_id=m.id WHERE m.atendimento_id=${conversation.id} ORDER BY m.criado_em ASC`,
      sql`SELECT id,numero_atendimento,descricao_servico,valor,agendado_para,endereco,bairro,cidade,referencia,status_orcamento,status_pag_cliente,criado_em,atualizado_em FROM orcamentos WHERE atendimento_id=${conversation.id} LIMIT 1`,
      sql`SELECT tipo_evento,criado_em FROM eventos_atendimento WHERE atendimento_id=${conversation.id} AND tipo_evento IN ('ORCAMENTO_GERADO','MONTADOR_ATRIBUIDO','MONTADOR_A_CAMINHO','MONTADOR_CHEGOU','ATENDIMENTO_FINALIZADO','ATENDIMENTO_CANCELADO') ORDER BY criado_em ASC`
    ]);
    const quote=quotes[0]||null,eventTime=type=>events.find(event=>event.tipo_evento===type)?.criado_em||null;
    const onTheWay=eventTime('MONTADOR_A_CAMINHO'),arrived=eventTime('MONTADOR_CHEGOU'),finished=eventTime('ATENDIMENTO_FINALIZADO')||(conversation.status==='SERVICO_FINALIZADO'?conversation.atualizado_em:null),cancelled=eventTime('ATENDIMENTO_CANCELADO')||(conversation.status==='CANCELADO'?conversation.atualizado_em:null);
    const tracking=[
      {key:'received',label:'Atendimento recebido',description:'Seu atendimento está registrado na JLL Montagens.',state:'complete',occurredAt:conversation.criado_em},
      {key:'scheduled',label:'Orçamento e agendamento',description:quote?'Orçamento preparado e data registrada.':'Aguardando a preparação do orçamento.',state:quote?'complete':'current',occurredAt:quote?.criado_em||null},
      {key:'assigned',label:'Profissional definido',description:eventTime('MONTADOR_ATRIBUIDO')?'O profissional responsável já foi definido.':'Aguardando a definição do profissional.',state:eventTime('MONTADOR_ATRIBUIDO')?'complete':quote?'current':'pending',occurredAt:eventTime('MONTADOR_ATRIBUIDO')},
      {key:'on_the_way',label:'A caminho',description:onTheWay?'O profissional informou que está se dirigindo ao endereço.':'O acompanhamento do trajeto aparecerá aqui quando o deslocamento começar.',state:onTheWay?'complete':eventTime('MONTADOR_ATRIBUIDO')?'current':'pending',occurredAt:onTheWay},
      {key:'arrived',label:'Chegou ao local',description:arrived?'Chegada ao endereço confirmada.':'Aguardando chegada ao endereço.',state:arrived?'complete':onTheWay?'current':'pending',occurredAt:arrived},
      cancelled
        ?{key:'cancelled',label:'Atendimento cancelado',description:'Este atendimento foi encerrado sem a conclusão do serviço.',state:'complete',occurredAt:cancelled}
        :{key:'finished',label:'Serviço concluído',description:finished?'Atendimento finalizado.':'Aguardando a conclusão do serviço.',state:finished?'complete':arrived?'current':'pending',occurredAt:finished}
    ];
    let currentStatus='Atendimento em andamento';
    if(cancelled)currentStatus='Atendimento cancelado';else if(finished)currentStatus='Serviço concluído';else if(arrived)currentStatus='Profissional no local';else if(onTheWay)currentStatus='Profissional a caminho';else if(eventTime('MONTADOR_ATRIBUIDO'))currentStatus='Profissional definido';else if(quote)currentStatus='Agendamento confirmado';
    return res.status(200).json({conversation:{...publicConversation(conversation),canInteract:!['SERVICO_FINALIZADO','CANCELADO'].includes(conversation.status)},messages,quote,tracking,currentStatus,trackingLive:Boolean(onTheWay&&!arrived&&!finished&&!cancelled)});
  }catch(error){console.error('Tracking load failed',error);return res.status(500).json({error:'Não foi possível carregar o acompanhamento.'})}
};
