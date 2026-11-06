const {getDatabase}=require('../_db');
const c=require('./_core');
const {notifyAttendance}=require('../admin/_push');

const cleanId=value=>String(value||'').trim();
const publicService=row=>{
  const accepted=['ACEITO','EM_EXECUCAO','CONCLUIDO'].includes(row.status_execucao_montador);
  const base={id:row.id,atendimentoId:row.atendimento_id,numeroAtendimento:row.numero_atendimento,descricaoServico:row.descricao_servico,bairro:row.bairro,cidade:row.cidade,valorRepasse:Number(row.valor_montador||0)+Number(row.adicional_montador||0),agendadoPara:row.agendado_para,status:row.status_execucao_montador,aceitoEm:row.aceito_montador_em,iniciadoEm:row.iniciado_montador_em,concluidoEm:row.concluido_montador_em,fotos:Number(row.fotos||0),pagamentoId:row.pagamento_id||null};
  if(!accepted)return base;
  return {...base,nomeCliente:row.nome_cliente,telefoneCliente:row.telefone_cliente,telefoneAlternativo:row.telefone_alternativo,endereco:row.endereco,referencia:row.referencia};
};

async function remember(sql,montadorId,key,type,resourceId,response){if(!key)return;await sql`INSERT INTO operacoes_montador (montador_id,chave_idempotencia,tipo,recurso_id,resposta) VALUES (${montadorId},${key},${type},${resourceId},${JSON.stringify(response)}::jsonb) ON CONFLICT (montador_id,chave_idempotencia) DO NOTHING`}

module.exports=async function(req,res){
  const assembler=await c.currentAssembler(req);if(!assembler)return res.status(401).json({error:'Sessão expirada.'});
  if(assembler.status_cadastro!=='APROVADO')return res.status(403).json({error:'Seu cadastro precisa estar aprovado para acessar serviços.'});
  const sql=getDatabase();
  try{
    if(req.method==='GET'){
      const view=String(req.query?.view||'TODOS').toUpperCase();
      const rows=await sql`SELECT o.*,a.nome_cliente,a.telefone AS telefone_cliente,(SELECT COUNT(*) FROM fotos_servico_montador f WHERE f.orcamento_id=o.id)::int AS fotos,pi.pagamento_id FROM orcamentos o JOIN atendimentos a ON a.id=o.atendimento_id LEFT JOIN pagamentos_montador_itens pi ON pi.orcamento_id=o.id WHERE o.montador_id=${assembler.id} ORDER BY o.agendado_para ASC,o.criado_em DESC`;
      const filtered=rows.filter(row=>view==='TODOS'||(view==='PENDENTES_ACEITE'&&row.status_execucao_montador==='PENDENTE_ACEITE')||(view==='PENDENTES_EXECUCAO'&&['ACEITO','EM_EXECUCAO'].includes(row.status_execucao_montador))||(view==='PENDENTES_REPASSE'&&row.status_execucao_montador==='CONCLUIDO'&&!row.pagamento_id));
      return res.status(200).json({servicos:filtered.map(publicService)});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
    const id=cleanId(req.body?.id),action=String(req.body?.acao||'').toUpperCase(),operationId=cleanId(req.body?.operacaoId||req.headers['x-idempotency-key']);
    if(!id||!['ACEITAR','RECUSAR','INICIAR_DESLOCAMENTO','CONFIRMAR_CHEGADA','FINALIZAR'].includes(action))return res.status(400).json({error:'Ação de serviço inválida.'});
    if(operationId){const previous=(await sql`SELECT resposta FROM operacoes_montador WHERE montador_id=${assembler.id} AND chave_idempotencia=${operationId} LIMIT 1`)[0];if(previous)return res.status(200).json({...previous.resposta,repetida:true})}
    const current=(await sql`SELECT o.*,a.nome_cliente,a.telefone AS telefone_cliente,a.atendente_id,a.numero_atendimento,(SELECT COUNT(*) FROM fotos_servico_montador f WHERE f.orcamento_id=o.id)::int AS fotos FROM orcamentos o JOIN atendimentos a ON a.id=o.atendimento_id WHERE o.id=${id} AND o.montador_id=${assembler.id} LIMIT 1`)[0];
    if(!current)return res.status(404).json({error:'Serviço não encontrado ou não atribuído a você.'});
    let row,eventType,message,changed=false;
    if(action==='ACEITAR'){
      if(!['PENDENTE_ACEITE','ACEITO'].includes(current.status_execucao_montador))return res.status(409).json({error:'Este serviço não está disponível para aceite.'});
      row=(await sql`UPDATE orcamentos SET status_execucao_montador='ACEITO',aceito_montador_em=COALESCE(aceito_montador_em,NOW()),recusado_montador_em=NULL,atualizado_em=NOW() WHERE id=${id} AND montador_id=${assembler.id} AND status_execucao_montador='PENDENTE_ACEITE' RETURNING *`)[0]||current;changed=current.status_execucao_montador==='PENDENTE_ACEITE';
      eventType='MONTADOR_SERVICO_ACEITO';message='Serviço aceito. Os dados completos do cliente foram liberados.';
    }else if(action==='RECUSAR'){
      if(current.status_execucao_montador!=='PENDENTE_ACEITE')return res.status(409).json({error:'Somente propostas pendentes podem ser recusadas.'});
      await sql`UPDATE orcamentos SET status_execucao_montador='RECUSADO',recusado_montador_em=NOW(),atualizado_em=NOW() WHERE id=${id} AND montador_id=${assembler.id} AND status_execucao_montador='PENDENTE_ACEITE'`;
      await sql`UPDATE atendimentos SET montador_id=NULL,status='GEROU_ORCAMENTO',atualizado_em=NOW() WHERE id=${current.atendimento_id}`;
      await sql`UPDATE orcamentos SET montador_id=NULL,status_orcamento='GERADO',atribuicao_versao=NULL,atualizado_em=NOW() WHERE id=${id}`;
      eventType='MONTADOR_SERVICO_RECUSADO';message='Serviço recusado e devolvido para nova atribuição.';row={...current,status_execucao_montador:'RECUSADO'};changed=true;
    }else if(action==='INICIAR_DESLOCAMENTO'){
      if(!['ACEITO','EM_EXECUCAO'].includes(current.status_execucao_montador))return res.status(409).json({error:'Aceite o serviço antes de iniciar o deslocamento.'});
      row=(await sql`UPDATE orcamentos SET status_execucao_montador='EM_EXECUCAO',iniciado_montador_em=COALESCE(iniciado_montador_em,NOW()),atualizado_em=NOW() WHERE id=${id} AND montador_id=${assembler.id} RETURNING *`)[0];changed=current.status_execucao_montador==='ACEITO';eventType='MONTADOR_A_CAMINHO';message='Deslocamento registrado.';
    }else if(action==='CONFIRMAR_CHEGADA'){
      if(current.status_execucao_montador!=='EM_EXECUCAO')return res.status(409).json({error:'Inicie o deslocamento antes de confirmar a chegada.'});
      row=current;eventType='MONTADOR_CHEGOU';message='Chegada registrada.';changed=true;
    }else{
      if(String(req.headers['x-jll-app']||'')!=='montador-mobile')return res.status(403).json({error:'A finalização do serviço é exclusiva do aplicativo JLL Montador.'});
      if(current.status_execucao_montador!=='EM_EXECUCAO')return res.status(409).json({error:'O serviço precisa estar em execução para ser finalizado.'});
      if(Number(current.fotos||0)<1)return res.status(409).json({error:'Anexe ao menos uma foto do serviço antes de finalizar.'});
      row=(await sql`UPDATE orcamentos SET status_execucao_montador='CONCLUIDO',concluido_montador_em=COALESCE(concluido_montador_em,NOW()),status_orcamento='FINALIZADO',atualizado_em=NOW() WHERE id=${id} AND montador_id=${assembler.id} RETURNING *`)[0];
      await sql`UPDATE atendimentos SET status='SERVICO_FINALIZADO',encerrado_em=COALESCE(encerrado_em,NOW()),atualizado_em=NOW() WHERE id=${current.atendimento_id}`;eventType='ATENDIMENTO_FINALIZADO';message='Serviço finalizado e enviado para repasse.';changed=true;
    }
    if(changed)await sql`INSERT INTO eventos_atendimento (atendimento_id,tipo_evento,detalhes) VALUES (${current.atendimento_id},${eventType},${JSON.stringify({orcamentoId:id,montadorId:assembler.id,operacaoId:operationId||null})}::jsonb)`;
    if(changed&&action==='RECUSAR')try{const nome=String(assembler.nome_completo||assembler.nome||'O montador').trim();await notifyAttendance({atendimentoId:current.atendimento_id,tipo:'MONTADOR_RECUSOU_SERVICO',titulo:'Serviço recusado pelo montador',mensagem:`${nome} recusou o atendimento #${current.numero_atendimento}. Faça uma nova atribuição.`,usuarioId:current.atendente_id||null})}catch(pushError){console.error('Push de recusa do montador não enviado',pushError)}
    const response={ok:true,mensagem:message,servico:publicService({...current,...row})};await remember(sql,assembler.id,operationId,action,id,response);
    return res.status(200).json(response);
  }catch(error){console.error(error);return res.status(500).json({error:'Não foi possível processar o serviço.'})}
};
