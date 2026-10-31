const test=require('node:test');const assert=require('node:assert/strict');
// Evita carregar integrações externas: as funções puras ficam no mesmo módulo, mas o require só instancia clientes quando usados.
const core=require('../api/montadores/_core');
test('valida CPF com dígitos verificadores',()=>{assert.equal(core.validCpf('529.982.247-25'),true);assert.equal(core.validCpf('111.111.111-11'),false);assert.equal(core.validCpf('529.982.247-24'),false)});
test('valida CNPJ com dígitos verificadores',()=>{assert.equal(core.validCnpj('42.172.099/0001-59'),true);assert.equal(core.validCnpj('11.111.111/1111-11'),false)});
test('nome completo exige sobrenome e rejeita abreviações',()=>{assert.equal(core.validFullName('Maria das Dores Silva'),true);assert.equal(core.validFullName('Maria'),false);assert.equal(core.validFullName('Maria S.'),false)});
test('termos usam versão e hashes estáveis',()=>{assert.match(core.TERM_VERSION,/^\d{4}-\d{2}-\d{2}\.\d+$/);for(const hash of Object.values(core.TERM_HASHES))assert.match(hash,/^[a-f0-9]{64}$/)});
test('cadastro do montador aceita senha a partir de seis caracteres',()=>{assert.equal(core.MIN_PASSWORD_LENGTH,6)});
