const nodemailer=global.__JLL_NODEMAILER||require('nodemailer');
const {getDatabase}=require('../_db');
const {decrypt,emailLayout}=require('../montadores/_core');

async function sendAdminEmail(to,subject,html){
  const sql=getDatabase();
  const config=(await sql`SELECT * FROM configuracao_smtp WHERE id=1 AND ativo=TRUE LIMIT 1`)[0];
  if(!config)throw new Error('SMTP ainda não configurado ou inativo');
  const transporter=nodemailer.createTransport({host:config.host,port:config.port,secure:config.seguro,auth:{user:config.usuario,pass:decrypt(config.senha_criptografada)}});
  await transporter.sendMail({from:{name:config.remetente_nome,address:config.remetente_email},replyTo:config.responder_para||undefined,to,subject,html});
}

module.exports={sendAdminEmail,emailLayout};
