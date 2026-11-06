const {put}=require('@vercel/blob');
const {getDatabase}=require('../_db');
const {authenticatedUser}=require('./_auth');

const allowedTypes=new Set(['image/jpeg','image/png','image/webp']);
const validImage=(buffer,mime)=>mime==='image/jpeg'?(buffer[0]===0xff&&buffer[1]===0xd8&&buffer[2]===0xff):mime==='image/png'?buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])):mime==='image/webp'?(buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP'):false;

module.exports=async function handler(req,res){
  const user=await authenticatedUser(req);if(!user)return res.status(401).json({error:'Sessão expirada.'});
  const sql=getDatabase();
  try{
    if(req.method==='GET'){
      const contacts=await sql`SELECT u.id,u.nome_exibicao,u.login,u.perfil,(p.ultima_atividade_em>NOW()-INTERVAL '90 seconds') AS online,p.ultima_atividade_em,last_message.texto AS ultima_mensagem,last_message.criado_em AS ultima_mensagem_em,COALESCE(unread.quantidade,0)::int AS nao_lidas FROM usuarios_atendimento u LEFT JOIN usuarios_presenca p ON p.usuario_id=u.id LEFT JOIN LATERAL (SELECT mi.texto,mi.criado_em FROM mensagens_internas mi WHERE (mi.remetente_id=${user.id} AND mi.destinatario_id=u.id) OR (mi.remetente_id=u.id AND mi.destinatario_id=${user.id}) ORDER BY mi.criado_em DESC LIMIT 1) last_message ON TRUE LEFT JOIN LATERAL (SELECT COUNT(*)::int AS quantidade FROM mensagens_internas mi WHERE mi.remetente_id=u.id AND mi.destinatario_id=${user.id} AND mi.lida_em IS NULL) unread ON TRUE WHERE u.ativo=TRUE AND u.id<>${user.id} ORDER BY (last_message.criado_em IS NOT NULL) DESC,last_message.criado_em DESC NULLS LAST,online DESC,u.nome_exibicao`;
      const contactId=String(req.query?.contatoId||'');if(!contactId)return res.status(200).json({contatos:contacts});
      const contact=contacts.find(item=>String(item.id)===contactId);if(!contact)return res.status(404).json({error:'Contato não encontrado.'});
      const messages=await sql`SELECT mi.id,mi.remetente_id,mi.destinatario_id,mi.texto,mi.atendimento_origem_id,mi.mensagem_origem_id,mi.lida_em,mi.criado_em,a.numero_atendimento,COALESCE(ai.id,ae.id) AS anexo_id,COALESCE(ai.nome_arquivo,ae.nome_arquivo) AS nome_arquivo,COALESCE(ai.tipo_mime,ae.tipo_mime) AS tipo_mime FROM mensagens_internas mi LEFT JOIN atendimentos a ON a.id=mi.atendimento_origem_id LEFT JOIN anexos_mensagem_interna ai ON ai.mensagem_id=mi.id LEFT JOIN anexos_mensagem ae ON ae.mensagem_id=mi.mensagem_origem_id WHERE (mi.remetente_id=${user.id} AND mi.destinatario_id=${contactId}) OR (mi.remetente_id=${contactId} AND mi.destinatario_id=${user.id}) ORDER BY mi.criado_em ASC`;
      await sql`UPDATE mensagens_internas SET lida_em=NOW() WHERE remetente_id=${contactId} AND destinatario_id=${user.id} AND lida_em IS NULL`;
      contact.nao_lidas=0;
      return res.status(200).json({contatos:contacts,contato:contact,mensagens:messages});
    }
    if(req.method==='POST'){
      const contactId=String(req.body?.contatoId||''),text=String(req.body?.texto||'').trim(),forwardId=String(req.body?.mensagemAtendimentoId||''),mime=String(req.body?.mimeType||'').toLowerCase(),encoded=String(req.body?.data||''),fileName=String(req.body?.fileName||'imagem').replace(/[^a-zA-Z0-9._-]/g,'-').slice(0,100);
      const contact=(await sql`SELECT id,nome_exibicao FROM usuarios_atendimento WHERE id=${contactId} AND ativo=TRUE AND id<>${user.id} LIMIT 1`)[0];if(!contact)return res.status(404).json({error:'Contato não encontrado.'});
      let finalText=text,source=null,buffer=null;
      if(forwardId){source=(await sql`SELECT m.id,m.texto,m.atendimento_id,a.numero_atendimento,am.id AS anexo_id FROM mensagens m JOIN atendimentos a ON a.id=m.atendimento_id LEFT JOIN anexos_mensagem am ON am.mensagem_id=m.id WHERE m.id=${forwardId} AND (a.atendente_id=${user.id} OR ${user.perfil}='ADMINISTRADOR') LIMIT 1`)[0];if(!source)return res.status(404).json({error:'Mensagem de origem não encontrada ou sem permissão.'});finalText=`Encaminhado do atendimento #${source.numero_atendimento}: ${String(source.texto||'Anexo').trim()}`}
      if(encoded){if(!allowedTypes.has(mime))return res.status(400).json({error:'Envie uma imagem JPEG, PNG ou WebP.'});buffer=Buffer.from(encoded,'base64');if(!buffer.length||buffer.length>4*1024*1024||!validImage(buffer,mime))return res.status(400).json({error:'Imagem inválida ou maior que 4 MB.'});if(!finalText)finalText='Imagem enviada'}
      if(!finalText&&!source)return res.status(400).json({error:'Mensagem vazia.'});
      const message=(await sql`INSERT INTO mensagens_internas (remetente_id,destinatario_id,texto,atendimento_origem_id,mensagem_origem_id) VALUES (${user.id},${contactId},${finalText},${source?.atendimento_id||null},${source?.id||null}) RETURNING *`)[0];
      if(buffer){const blob=await put(`chat-interno/${user.id}/${Date.now()}-${fileName}`,buffer,{access:'private',contentType:mime,addRandomSuffix:true});await sql`INSERT INTO anexos_mensagem_interna (mensagem_id,url_armazenamento,nome_arquivo,tipo_mime,tamanho_bytes) VALUES (${message.id},${blob.url},${fileName},${mime},${buffer.length})`}
      try{const {notifyUser}=require('./_push');await notifyUser({usuarioId:contactId,mensagemInternaId:message.id,tipo:'CHAT_INTERNO',titulo:user.nome_exibicao,mensagem:finalText.slice(0,140),dados:{contatoId:String(user.id)}})}catch(pushError){console.error('Push interno não enviado',pushError)}
      return res.status(201).json({mensagem:message,contato:contact});
    }
    return res.status(405).json({error:'Método não permitido'});
  }catch(error){console.error('Internal chat failed',error);return res.status(500).json({error:'Não foi possível concluir o chat interno.'})}
};
