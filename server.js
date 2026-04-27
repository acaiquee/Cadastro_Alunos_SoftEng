const express = require('express');
const fs = require('fs').promises; // Usar promises para operações não bloqueantes
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');

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
        const { matricula, tipo } = userData;

        if (!matricula || !/^[a-zA-Z0-9]+$/.test(matricula)) {
            return res.status(400).json({ error: 'Matrícula inválida (apenas letras e números)' });
        }

        const filePath = path.join(DATA_DIR, `${matricula}.json`);

        // Verificar se o usuário já existe
        try {
            await fs.access(filePath);
            return res.status(400).json({ error: 'Usuário já cadastrado com esta matrícula' });
        } catch (err) {
            // Se cair aqui, o arquivo não existe, o que é o esperado para um novo registro
        }

        // Estrutura padrão para alunos
        if (tipo === 'aluno' && !userData.statusAvaliacao) {
            userData.statusAvaliacao = {
                foiAvaliado: false,
                mediaCHA: null,
                mediaSocioemocional: null,
                avaliadoPor: []
            };
        }

        await fs.writeFile(filePath, JSON.stringify(userData, null, 2), 'utf8');
        res.status(201).json({ message: 'Usuário cadastrado com sucesso' });
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro ao salvar os dados' });
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

            if (user.senha === senha) {
                console.log(`Login bem-sucedido: ${user.nome} (${user.tipo})`);
                // Sucesso - retornar informações do usuário (exceto senha)
                res.json({ 
                    message: 'Login bem-sucedido',
                    student: {
                        matricula: user.matricula,
                        nome: user.nome,
                        turma: user.turma,
                        email: user.email,
                        tipo: user.tipo || 'aluno' // Default para aluno se não houver tipo
                    }
                });
            } else {
                console.warn(`Tentativa de login falhou (senha incorreta): ${matricula}`);
                res.status(401).json({ error: 'Senha incorreta' });
            }
        } catch (err) {
            console.warn(`Tentativa de login falhou (matricula não encontrada): ${matricula}`);
            res.status(404).json({ error: 'Matrícula não encontrada' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro ao processar login' });
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

// 5. Atualizar avaliação (Apenas Professores)
app.post('/api/evaluate', async (req, res) => {
    try {
        const { matricula, detalhamento, avaliadorMatricula } = req.body;

        if (!matricula || !/^[a-zA-Z0-9]+$/.test(matricula) || !avaliadorMatricula || !/^[a-zA-Z0-9]+$/.test(avaliadorMatricula)) {
            return res.status(400).json({ error: 'Matrícula inválida' });
        }

        // Validar se o avaliador é um professor
        const avaliadorPath = path.join(DATA_DIR, `${avaliadorMatricula}.json`);
        try {
            const avaliadorData = await fs.readFile(avaliadorPath, 'utf8');
            const avaliador = JSON.parse(avaliadorData);

            if (avaliador.tipo !== 'professor') {
                return res.status(403).json({ error: 'Apenas professores podem realizar avaliações' });
            }
        } catch (err) {
            return res.status(404).json({ error: 'Avaliador não encontrado' });
        }

        const studentPath = path.join(DATA_DIR, `${matricula}.json`);
        try {
            const data = await fs.readFile(studentPath, 'utf8');
            const student = JSON.parse(data);
            
            if (student.tipo === 'professor') {
                return res.status(400).json({ error: 'Não é possível avaliar um professor' });
            }

            // Inicializar statusAvaliacao se não existir
            if (!student.statusAvaliacao) {
                student.statusAvaliacao = {
                    foiAvaliado: false,
                    mediaCHA: null,
                    mediaSocioemocional: null,
                    detalhamento: null,
                    avaliadoPor: []
                };
            }

            // Calcular médias baseadas no detalhamento
            const cha = detalhamento.cha;
            const soft = detalhamento.soft;
            
            const mediaCHA = (cha.conhecimento.nota + cha.habilidade.nota + cha.atitude.nota) / 3;
            const mediaSocio = (soft.autogestao + soft.colaboracao + soft.resiliencia + soft.comunicacao) / 4;

            student.statusAvaliacao.foiAvaliado = true;
            student.statusAvaliacao.mediaCHA = parseFloat(mediaCHA.toFixed(1));
            student.statusAvaliacao.mediaSocioemocional = parseFloat(mediaSocio.toFixed(1));
            student.statusAvaliacao.detalhamento = detalhamento;
            
            if (!student.statusAvaliacao.avaliadoPor.includes(avaliadorMatricula)) {
                student.statusAvaliacao.avaliadoPor.push(avaliadorMatricula);
            }

            await fs.writeFile(studentPath, JSON.stringify(student, null, 2), 'utf8');
            res.json({ message: 'Avaliação salva com sucesso', status: student.statusAvaliacao });
        } catch (err) {
            res.status(404).json({ error: 'Estudante não encontrado' });
        }
    } catch (error) {
        console.error('Erro na avaliação:', error);
        res.status(500).json({ error: 'Erro ao processar avaliação' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});
