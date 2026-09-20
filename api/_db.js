const { neon } = require('@neondatabase/serverless');

function getDatabase() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL não configurada');
  return neon(connectionString);
}

function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

function publicConversation(row) {
  if (!row) return null;
  return { id: row.id, ticketNumber: row.ticket_number, customerName: row.customer_name, phone: row.phone, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at };
}

module.exports = { getDatabase, normalizePhone, publicConversation };
