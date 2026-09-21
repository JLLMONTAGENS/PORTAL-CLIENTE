const { neon } = require('@neondatabase/serverless');
function getDatabase(){const value=process.env.DATABASE_URL||process.env.POSTGRES_URL;if(!value)throw new Error('DATABASE_URL não configurada');return neon(value)}
function normalizePhone(value){const digits=String(value||'').replace(/\D/g,'');return digits.startsWith('55')?digits:`55${digits}`}
function publicConversation(row){return row?{id:row.id,ticketNumber:row.numero_atendimento,customerName:row.nome_cliente,phone:row.telefone,status:row.status,createdAt:row.criado_em,updatedAt:row.atualizado_em}:null}
module.exports={getDatabase,normalizePhone,publicConversation};
