const express = require('express');
const fs = require('fs').promises; // Usar promises para operações não bloqueantes
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const SALT_ROUNDS = 10;

// Garantir que o diretório de dados existe (síncrono na inicialização é aceitável)
const fsSync = require('fs');
if (!fsSync.existsSync(DATA_DIR)) {
    fsSync.mkdirSync(DATA_DIR);
}

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// Middleware para garantir UTF-8 em todas as respostas JSON
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// 1. Endpoint de Registro
app.post('/api/register', async (req, res) => {
    try {
        const userData = req.body;
        const { matricula, tipo, senha, nome, email } = userData;

        // Validações Básicas
        if (!matricula || !/^[a-zA-Z0-9]+$/.test(matricula)) {
            return res.status(400).json({ error: 'Matrícula inválida (apenas letras e números)' });
        }
        if (!senha || senha.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres' });
        }
        if (!nome || nome.trim().length < 3) {
            return res.status(400).json({ error: 'Nome muito curto' });
        }
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'E-mail inválido' });
        }

        const filePath = path.join(DATA_DIR, `${matricula}.json`);

        // Verificar se o usuário já existe
        try {
            await fs.access(filePath);
            return res.status(400).json({ error: 'Usuário já cadastrado com esta matrícula' });
        } catch (err) {
            // Arquivo não existe, prosseguir
        }

        // Hash da senha antes de salvar
        const hashedPassword = await bcrypt.hash(senha, SALT_ROUNDS);
        userData.senha = hashedPassword;

        // Estrutura padrão para alunos
        if (tipo === 'aluno') {
            userData.statusAvaliacao = userData.statusAvaliacao || {
                foiAvaliado: false,
                mediaCHA: null,
                mediaSocioemocional: null,
                avaliadoPor: []
            };
        }

        await fs.writeFile(filePath, JSON.stringify(userData, null, 2), 'utf8');
        console.log(`Novo usuário cadastrado: ${nome} (${tipo}) - ${matricula}`);
        res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno ao processar cadastro' });
    }
});

// 2. Endpoint de Login
app.post('/api/login', async (req, res) => {
    try {
        const { matricula, senha } = req.body;
        if (!matricula || !/^[a-zA-Z0-9]+$/.test(matricula)) {
            return res.status(400).json({ error: 'Matrícula inválida' });
        }
        const filePath = path.join(DATA_DIR, `${matricula}.json`);

        try {
            const data = await fs.readFile(filePath, 'utf8');
            const user = JSON.parse(data);

            let isPasswordValid = false;
            
            // Tentar comparar com bcrypt
            try {
                isPasswordValid = await bcrypt.compare(senha, user.senha);
            } catch (e) {
                // Se der erro no bcrypt, pode ser que a senha esteja em texto plano (legado)
                isPasswordValid = (user.senha === senha);
                
                // Migrar para hash se for legado
                if (isPasswordValid) {
                    const hashed = await bcrypt.hash(senha, SALT_ROUNDS);
                    user.senha = hashed;
                    await fs.writeFile(filePath, JSON.stringify(user, null, 2), 'utf8');
                    console.log(`Senha do usuário ${matricula} migrada para hash com sucesso.`);
                }
            }

            // Fallback se o bcrypt.compare retornar false mas for plain text (caso raro onde bcrypt não lança erro mas falha)
            if (!isPasswordValid && user.senha === senha) {
                isPasswordValid = true;
                const hashed = await bcrypt.hash(senha, SALT_ROUNDS);
                user.senha = hashed;
                await fs.writeFile(filePath, JSON.stringify(user, null, 2), 'utf8');
                console.log(`Senha do usuário ${matricula} migrada para hash (fallback).`);
            }

            if (isPasswordValid) {
                console.log(`Login bem-sucedido: ${user.nome} (${user.tipo})`);
                res.json({ 
                    message: 'Login bem-sucedido',
                    student: {
                        matricula: user.matricula,
                        nome: user.nome,
                        turma: user.turma,
                        email: user.email,
                        tipo: user.tipo || 'aluno'
                    }
                });
            } else {
                console.warn(`Tentativa de login falhou (senha incorreta): ${matricula}`);
                res.status(401).json({ error: 'Credenciais inválidas' }); // Mensagem genérica por segurança
            }
        } catch (err) {
            console.warn(`Tentativa de login falhou (matricula não encontrada): ${matricula}`);
            res.status(401).json({ error: 'Credenciais inválidas' }); // Mensagem genérica por segurança
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno ao processar login' });
    }
});

// 3. Listar alunos por turma (Async/Non-blocking)
app.get('/api/students/:turma', async (req, res) => {
    try {
        const { turma } = req.params;
        const files = await fs.readdir(DATA_DIR);
        const jsonFiles = files.filter(file => file.endsWith('.json'));

        // Ler todos os arquivos em paralelo usando Promise.all para não bloquear o event loop
        const studentsData = await Promise.all(
            jsonFiles.map(async (file) => {
                try {
                    const filePath = path.join(DATA_DIR, file);
                    const data = await fs.readFile(filePath, 'utf8');
                    if (!data) return null;
                    return JSON.parse(data);
                } catch (err) {
                    console.error(`Erro ao processar arquivo ${file}:`, err);
                    return null;
                }
            })
        );

        // Filtrar apenas usuários do tipo 'aluno' (ou sem tipo), da turma correta e não nulos
        const filteredStudents = studentsData
            .filter(user => user && (user.tipo === 'aluno' || !user.tipo) && user.turma === turma)
            .map(student => ({
                matricula: student.matricula,
                nome: student.nome,
                turma: student.turma,
                statusAvaliacao: student.statusAvaliacao
            }));

        res.json(filteredStudents);
    } catch (error) {
        console.error('Erro ao listar alunos:', error);
        res.status(500).json({ error: 'Erro ao listar alunos' });
    }
});

// 4. Buscar um aluno específico
app.get('/api/student/:matricula', async (req, res) => {
    try {
        const { matricula } = req.params;
        if (!matricula || !/^[a-zA-Z0-9]+$/.test(matricula)) {
            return res.status(400).json({ error: 'Matrícula inválida' });
        }
        const filePath = path.join(DATA_DIR, `${matricula}.json`);

        try {
            const data = await fs.readFile(filePath, 'utf8');
            const student = JSON.parse(data);
            res.json(student);
        } catch (err) {
            res.status(404).json({ error: 'Estudante não encontrado' });
        }
    } catch (error) {
        console.error('Erro ao buscar estudante:', error);
        res.status(500).json({ error: 'Erro ao buscar estudante' });
    }
});

// 5. Atualizar avaliação (Avaliação 360 - Professores e Alunos)
app.post('/api/evaluate', async (req, res) => {
    try {
        const { matricula, detalhamento, avaliadorMatricula } = req.body;

        if (!matricula || !/^[a-zA-Z0-9]+$/.test(matricula) || !avaliadorMatricula || !/^[a-zA-Z0-9]+$/.test(avaliadorMatricula)) {
            return res.status(400).json({ error: 'Matrícula inválida' });
        }

        if (matricula === avaliadorMatricula) {
            return res.status(400).json({ error: 'Não é possível avaliar a si mesmo' });
        }

        if (!detalhamento || !detalhamento.cha || !detalhamento.soft) {
            return res.status(400).json({ error: 'Dados de avaliação incompletos' });
        }

        // Verificar se o avaliador existe
        const avaliadorPath = path.join(DATA_DIR, `${avaliadorMatricula}.json`);
        let avaliador;
        try {
            const avaliadorData = await fs.readFile(avaliadorPath, 'utf8');
            avaliador = JSON.parse(avaliadorData);
        } catch (err) {
            return res.status(404).json({ error: 'Avaliador não encontrado' });
        }

        const studentPath = path.join(DATA_DIR, `${matricula}.json`);
        try {
            const data = await fs.readFile(studentPath, 'utf8');
            const student = JSON.parse(data);
            
            // Inicializar estrutura de avaliações se não existir (Avaliação 360)
            if (!student.avaliacoesRecebidas) {
                student.avaliacoesRecebidas = [];
            }

            // Calcular médias para ESTA avaliação específica
            const cha = detalhamento.cha;
            const soft = detalhamento.soft;
            
            const mediaCHA = (cha.conhecimento.nota + cha.habilidade.nota + cha.atitude.nota) / 3;
            const mediaSocio = (soft.autogestao + soft.colaboracao + soft.resiliencia + soft.comunicacao) / 4;

            const novaAvaliacao = {
                avaliadorMatricula: avaliadorMatricula,
                avaliadorNome: avaliador.nome,
                avaliadorTipo: avaliador.tipo,
                data: new Date().toISOString(),
                detalhamento: detalhamento,
                mediaCHA: parseFloat(mediaCHA.toFixed(1)),
                mediaSocioemocional: parseFloat(mediaSocio.toFixed(1))
            };

            // Se já avaliou, atualiza, senão adiciona
            const index = student.avaliacoesRecebidas.findIndex(a => a.avaliadorMatricula === avaliadorMatricula);
            if (index !== -1) {
                student.avaliacoesRecebidas[index] = novaAvaliacao;
            } else {
                student.avaliacoesRecebidas.push(novaAvaliacao);
            }

            // Recalcular médias globais do aluno
            const totalAvaliacoes = student.avaliacoesRecebidas.length;
            const somaCHA = student.avaliacoesRecebidas.reduce((acc, curr) => acc + curr.mediaCHA, 0);
            const somaSocio = student.avaliacoesRecebidas.reduce((acc, curr) => acc + curr.mediaSocioemocional, 0);

            student.statusAvaliacao = {
                foiAvaliado: true,
                mediaCHA: parseFloat((somaCHA / totalAvaliacoes).toFixed(1)),
                mediaSocioemocional: parseFloat((somaSocio / totalAvaliacoes).toFixed(1)),
                totalAvaliacoes: totalAvaliacoes,
                avaliadoPor: student.avaliacoesRecebidas.map(a => a.avaliadorMatricula)
            };

            await fs.writeFile(studentPath, JSON.stringify(student, null, 2), 'utf8');
            console.log(`Avaliação 360 salva para ${student.nome} por ${avaliador.nome} (${avaliador.tipo})`);
            res.json({ message: 'Avaliação salva com sucesso', status: student.statusAvaliacao });
        } catch (err) {
            res.status(404).json({ error: 'Estudante não encontrado' });
        }
    } catch (error) {
        console.error('Erro na avaliação:', error);
        res.status(500).json({ error: 'Erro interno ao processar avaliação' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
