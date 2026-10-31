const test=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
// Evita carregar integrações externas: as funções puras ficam no mesmo módulo, mas o require só instancia clientes quando usados.
const core=require('../api/montadores/_core');
test('valida CPF com dígitos verificadores',()=>{assert.equal(core.validCpf('529.982.247-25'),true);assert.equal(core.validCpf('111.111.111-11'),false);assert.equal(core.validCpf('529.982.247-24'),false)});
test('valida CNPJ com dígitos verificadores',()=>{assert.equal(core.validCnpj('42.172.099/0001-59'),true);assert.equal(core.validCnpj('11.111.111/1111-11'),false)});
test('nome completo exige sobrenome e rejeita abreviações',()=>{assert.equal(core.validFullName('Maria das Dores Silva'),true);assert.equal(core.validFullName('Maria'),false);assert.equal(core.validFullName('Maria S.'),false)});
test('termos usam versão e hashes estáveis',()=>{assert.match(core.TERM_VERSION,/^\d{4}-\d{2}-\d{2}\.\d+$/);for(const hash of Object.values(core.TERM_HASHES))assert.match(hash,/^[a-f0-9]{64}$/)});
test('login preserva a referência do formulário durante a chamada assíncrona',()=>{const source=fs.readFileSync(path.join(__dirname,'..','dist','area-do-montador','montador.js'),'utf8');assert.match(source,/const loginForm=e\.currentTarget/);assert.doesNotMatch(source,/e\.currentTarget\.reset\(\)/)});
test('cadastro do montador aceita senha a partir de seis caracteres',()=>{assert.equal(core.MIN_PASSWORD_LENGTH,6)});
test('revisão de documento evita notificações duplicadas',()=>{const source=fs.readFileSync(path.join(__dirname,'..','api','admin','montador-documento-revisao.js'),'utf8');assert.match(source,/status_revisao IS DISTINCT FROM/);assert.match(source,/alterado:false/)});
test('admin confirma ações e fecha o formulário depois de salvar',()=>{const source=fs.readFileSync(path.join(__dirname,'..','dist','admin','montadores.js'),'utf8');assert.match(source,/✓ Documento aprovado/);assert.match(source,/\$\('#modal'\)\.hidden=true;\s+await load\(\)/)});
test('acompanhamento renderiza o orçamento com o mesmo cartão do modal',()=>{const source=fs.readFileSync(path.join(__dirname,'..','dist','acompanhe-seu-atendimento','tracking.js'),'utf8');assert.match(source,/class="chat-quote-summary"/);assert.match(source,/Seu orçamento JLL Montagens/);assert.match(source,/function quoteMessage/)});
