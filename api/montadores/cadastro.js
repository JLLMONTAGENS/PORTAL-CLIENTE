const {getDatabase}=require('../_db');
const c=require('./_core');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido'});
  try{
    const b=req.body||{},nome=c.clean(b.nomeCompleto),cpf=c.digits(b.cpf),possuiCnpj=Boolean(b.possuiCnpj),cnpj=c.digits(b.cnpj),email=c.clean(b.email).toLowerCase(),senha=String(b.senha||''),whatsapp=c.digits(b.whatsapp),telefoneAlternativo=c.digits(b.telefoneAlternativo),cep=c.digits(b.cep),uf=c.clean(b.uf).toUpperCase(),bancoCodigo=c.clean(b.bancoCodigo),bancoNome=c.clean(b.bancoNome);
    if(!c.validFullName(nome))return res.status(400).json({error:'Informe nome e sobrenome completos, sem abreviações.'});
    if(!c.validCpf(cpf))return res.status(400).json({error:'CPF inválido.'});
    if(possuiCnpj&&!c.validCnpj(cnpj))return res.status(400).json({error:'Informe um CNPJ válido.'});
    if(!c.validEmail(email))return res.status(400).json({error:'E-mail inválido.'});
    if(senha.length<10)return res.status(400).json({error:'A senha deve ter pelo menos 10 caracteres.'});
    if(whatsapp.length<10||whatsapp.length>13)return res.status(400).json({error:'WhatsApp inválido.'});
    if(cep.length!==8||!c.clean(b.logradouro)||!c.clean(b.numero)||!c.clean(b.bairro)||!c.clean(b.cidade)||!/^[A-Z]{2}$/.test(uf))return res.status(400).json({error:'Preencha o endereço completo.'});
    if(!bancoCodigo||!bancoNome||!c.clean(b.agencia)||!c.clean(b.conta)||!c.clean(b.chavePix))return res.status(400).json({error:'Preencha todos os dados bancários.'});
    if(b.aceiteLgpd!==true||b.aceiteAutonomo!==true||b.aceiteAntecedentes!==true)return res.status(400).json({error:'Os três aceites são necessários para enviar o cadastro.'});
    const sql=getDatabase();
    const rows=await sql`INSERT INTO montadores (nome,nome_completo,cpf,possui_cnpj,cnpj,cep,tipo_logradouro,logradouro,numero,complemento,bairro,cidade,uf,telefone,whatsapp,telefone_alternativo,email,banco_codigo,banco_nome,agencia,conta,chave_pix,senha_hash,status_cadastro,certidao_status,ativo,atualizado_em) VALUES (${nome},${nome},${cpf},${possuiCnpj},${possuiCnpj?cnpj:null},${cep},${c.clean(b.tipoLogradouro)},${c.clean(b.logradouro)},${c.clean(b.numero)},${c.clean(b.complemento)||null},${c.clean(b.bairro)},${c.clean(b.cidade)},${uf},${whatsapp},${whatsapp},${telefoneAlternativo||null},${email},${bancoCodigo},${bancoNome},${c.clean(b.agencia)},${c.clean(b.conta)},${c.clean(b.chavePix)},${c.hashPassword(senha)},'PENDENTE_DOCUMENTO','PENDENTE',FALSE,NOW()) RETURNING *`;
    const row=rows[0],ip=c.requestIp(req),ua=String(req.headers['user-agent']||'').slice(0,500);
    for(const tipo of ['PRIVACIDADE_LGPD','PRESTACAO_AUTONOMA','ANTECEDENTES'])await sql`INSERT INTO termos_montador (montador_id,tipo,versao,hash_conteudo,ip_origem,user_agent) VALUES (${row.id},${tipo},${c.TERM_VERSION},${c.TERM_HASHES[tipo]},${ip},${ua})`;
    await sql`INSERT INTO auditoria_montador (montador_id,ator_tipo,ator_id,acao,detalhes,ip_origem) VALUES (${row.id},'MONTADOR',${row.id},'CADASTRO_ENVIADO',${JSON.stringify({termoVersao:c.TERM_VERSION,certidaoPendente:true})}::jsonb,${ip})`;
    await c.sendAssemblerEmail(row.id,email,'CADASTRO_RECEBIDO','Recebemos seu cadastro na Área do Montador',c.emailLayout('Cadastro recebido',`<p>Olá, ${nome}.</p><p>Recebemos seu cadastro. Ele está <strong>pendente do envio da certidão de antecedentes criminais</strong>. Você já pode entrar na Área do Montador e anexar o documento.</p><p>A aprovação somente ocorrerá depois do envio e da revisão humana do documento. Não realizamos consulta criminal automatizada.</p>`));
    await c.sendAssemblerEmail(row.id,email,'TERMO_ACEITO','Confirmação dos termos aceitos',c.emailLayout('Termos registrados',`<p>Registramos em ${new Date().toLocaleString('pt-BR')} os aceites da versão <strong>${c.TERM_VERSION}</strong> do Aviso de Privacidade/LGPD, do Termo de Prestação Autônoma e da autorização específica para análise da certidão.</p><p>Você poderá solicitar informações e exercer seus direitos pelos canais informados no Aviso de Privacidade.</p>`));
    res.setHeader('Set-Cookie',`jll_montador_session=${encodeURIComponent(c.sessionToken(row.id))}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200`);
    return res.status(201).json({montador:c.publicAssembler(row),mensagem:'Cadastro recebido. Envie a certidão para liberar a análise.'});
  }catch(error){console.error(error);const msg=String(error.message||'');if(msg.includes('unique'))return res.status(409).json({error:'CPF, CNPJ ou e-mail já cadastrado.'});return res.status(500).json({error:'Não foi possível concluir o cadastro.'})}
};
