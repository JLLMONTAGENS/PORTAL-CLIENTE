-- Execute uma única vez no Neon após o schema principal.
ALTER TABLE usuarios_atendimento DROP CONSTRAINT IF EXISTS staff_users_role_check;
ALTER TABLE usuarios_atendimento DROP CONSTRAINT IF EXISTS usuarios_atendimento_perfil_check;
ALTER TABLE usuarios_atendimento ADD CONSTRAINT usuarios_atendimento_perfil_check CHECK (perfil IN ('ADMINISTRADOR', 'ATENDENTE'));
-- Senha temporária: JLL-JMq-RQXMkq1giSvi! (altere após o primeiro acesso).
INSERT INTO usuarios_atendimento (nome,email,senha_hash,perfil) VALUES ('Administrador JLL Montagens','jjmelo-g@hotmail.com','scrypt$0fe8ee9e27cb80752666c8585083ec30$8aef93d0c4a66d3e8605fd628241b6b95708935f16fad579508590fa171b63cd1fc5aad77ba6348df1bdfd7db1be621bfac152a5a9d7226f1f3ab60c084d450e','ADMINISTRADOR') ON CONFLICT (email) DO NOTHING;

