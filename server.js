require('dotenv').config();
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, process.env.DATA_DIR || 'data');
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';
const SALT_ROUNDS = 10;

// Garantir que o diretório de dados existe
const fsSync = require('fs');
if (!fsSync.existsSync(DATA_DIR)) {
    fsSync.mkdirSync(DATA_DIR);
}

// Security & Utility Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Desativar para facilitar desenvolvimento local com scripts externos
}));
app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// Rate Limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // Limite de 100 requisições por IP
    message: { error: 'Muitas tentativas de acesso, tente novamente mais tarde.' }
});

// Middleware para garantir UTF-8
app.use((req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    next();
});

// Auth Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
        req.user = user;
        next();
    });
};

// In-memory locks para evitar race conditions em arquivos JSON
const locks = new Set();
const acquireLock = async (id) => {
    while (locks.has(id)) {
        await new Promise(resolve => setTimeout(resolve, 50));
    }
    locks.add(id);
};
const releaseLock = (id) => locks.delete(id);

// --- Helpers ---

const filterSensitiveData = (user) => {
    const filtered = { ...user };
    delete filtered.senha;
    return filtered;
};

// --- Rotas de Autenticação ---

app.post('/api/register', authLimiter, async (req, res) => {
    try {
        let { matricula, tipo, senha, nome, email, turma } = req.body;
        matricula = matricula ? matricula.trim() : '';
        nome = nome ? nome.trim() : '';
        email = email ? email.trim() : '';
        turma = turma ? turma.trim() : '';

        if (!matricula || !/^[a-zA-Z0-9]+$/.test(matricula)) {
            return res.status(400).json({ error: 'Matrícula inválida.' });
        }
        if (!senha || senha.length < 6) {
            return res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
        }

        const filePath = path.join(DATA_DIR, `${matricula}.json`);
        
        await acquireLock(matricula);
        try {
            if (fsSync.existsSync(filePath)) {
                return res.status(400).json({ error: 'Usuário já cadastrado.' });
            }

            const hashedPassword = await bcrypt.hash(senha, SALT_ROUNDS);
            const userData = {
                matricula,
                nome,
                email,
                turma,
                tipo: tipo || 'aluno',
                senha: hashedPassword,
                avaliacoesRecebidas: [],
                statusAvaliacao: tipo === 'aluno' ? {
                    foiAvaliado: false,
                    mediaCHA: null,
                    mediaSocioemocional: null,
                    avaliadoPor: []
                } : undefined
            };

            await fs.writeFile(filePath, JSON.stringify(userData, null, 2), 'utf8');
            res.status(201).json({ message: 'Usuário cadastrado com sucesso.' });
        } finally {
            releaseLock(matricula);
        }
    } catch (error) {
        console.error('Erro no registro:', error);
        res.status(500).json({ error: 'Erro interno ao cadastrar.' });
    }
});

app.post('/api/login', authLimiter, async (req, res) => {
    try {
        let { matricula, senha } = req.body;
        matricula = matricula ? matricula.trim() : '';
        
        if (!matricula || !senha) {
            return res.status(400).json({ error: 'Matrícula e senha são obrigatórios.' });
        }

        const filePath = path.join(DATA_DIR, `${matricula}.json`);

        if (!fsSync.existsSync(filePath)) {
            console.log(`Login failed: File not found for matricula ${matricula} at ${filePath}`);
            return res.status(401).json({ error: 'Credenciais inválidas.' });
        }

        const data = await fs.readFile(filePath, 'utf8');
        const user = JSON.parse(data);

        // Primeiro tenta comparação por bcrypt
        let isPasswordValid = await bcrypt.compare(senha, user.senha).catch(() => false);
        
        // Se falhar, tenta comparação direta para senhas legado
        if (!isPasswordValid && user.senha === senha) {
            isPasswordValid = true;
            // Migra para hash
            user.senha = await bcrypt.hash(senha, SALT_ROUNDS);
            await fs.writeFile(filePath, JSON.stringify(user, null, 2), 'utf8');
            console.log(`Password migrated to hash for user ${matricula}`);
        }

        if (isPasswordValid) {
            const token = jwt.sign(
                { matricula: user.matricula, tipo: user.tipo, turma: user.turma, nome: user.nome },
                JWT_SECRET,
                { expiresIn: '8h' }
            );

            res.json({
                message: 'Login bem-sucedido',
                token,
                user: {
                    matricula: user.matricula,
                    nome: user.nome,
                    turma: user.turma,
                    tipo: user.tipo
                }
            });
        } else {
            res.status(401).json({ error: 'Credenciais inválidas.' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ error: 'Erro interno no login.' });
    }
});

// --- Rotas Protegidas ---

app.get('/api/students/:turma', authenticateToken, async (req, res) => {
    try {
        const { turma } = req.params;
        const files = await fs.readdir(DATA_DIR);
        
        const students = [];
        for (const file of files.filter(f => f.endsWith('.json'))) {
            try {
                const data = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
                const user = JSON.parse(data);
                
                // Normaliza o tipo para garantir que cadastros antigos e novos funcionem
                const userTipo = user.tipo ? user.tipo.toLowerCase() : 'aluno';
                
                if (userTipo === 'aluno' && user.turma === turma) {
                    students.push({
                        matricula: user.matricula,
                        nome: user.nome,
                        turma: user.turma,
                        statusAvaliacao: user.statusAvaliacao
                    });
                }
            } catch (err) {
                console.error(`Erro ao ler arquivo ${file}:`, err);
            }
        }

        res.json(students);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao listar alunos.' });
    }
});

app.get('/api/student/:matricula', authenticateToken, async (req, res) => {
    try {
        const { matricula } = req.params;
        const filePath = path.join(DATA_DIR, `${matricula}.json`);
        
        if (!fsSync.existsSync(filePath)) return res.status(404).json({ error: 'Não encontrado.' });
        
        const data = await fs.readFile(filePath, 'utf8');
        const student = JSON.parse(data);
        res.json(filterSensitiveData(student));
    } catch (error) {
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

app.post('/api/evaluate', authenticateToken, async (req, res) => {
    const { matricula, detalhamento } = req.body;
    const avaliadorMatricula = req.user.matricula;
    const avaliadorTipo = req.user.tipo;
    const avaliadorTurma = req.user.turma;

    if (matricula === avaliadorMatricula) {
        return res.status(400).json({ error: 'Auto-avaliação não permitida.' });
    }

    try {
        await acquireLock(matricula);
        try {
            const studentPath = path.join(DATA_DIR, `${matricula}.json`);
            if (!fsSync.existsSync(studentPath)) return res.status(404).json({ error: 'Estudante não encontrado.' });

            const data = await fs.readFile(studentPath, 'utf8');
            const student = JSON.parse(data);

            // Regra: Alunos só avaliam colegas da mesma turma. Professores avaliam qualquer um.
            if (avaliadorTipo !== 'professor' && student.turma !== avaliadorTurma) {
                return res.status(403).json({ error: 'Você só pode avaliar alunos da sua própria turma.' });
            }

            const { cha, soft } = detalhamento;
            const mediaCHA = (cha.conhecimento.nota + cha.habilidade.nota + cha.atitude.nota) / 3;
            const mediaSocio = (soft.autogestao + soft.colaboracao + soft.resiliencia + soft.comunicacao) / 4;

            const novaAvaliacao = {
                avaliadorMatricula,
                avaliadorNome: req.user.nome,
                avaliadorTipo: req.user.tipo,
                data: new Date().toISOString(),
                detalhamento,
                mediaCHA: parseFloat(mediaCHA.toFixed(1)),
                mediaSocioemocional: parseFloat(mediaSocio.toFixed(1))
            };

            student.avaliacoesRecebidas = student.avaliacoesRecebidas || [];
            const idx = student.avaliacoesRecebidas.findIndex(a => a.avaliadorMatricula === avaliadorMatricula);
            
            if (idx !== -1) student.avaliacoesRecebidas[idx] = novaAvaliacao;
            else student.avaliacoesRecebidas.push(novaAvaliacao);

            const total = student.avaliacoesRecebidas.length;
            const avgCHA = student.avaliacoesRecebidas.reduce((a, b) => a + b.mediaCHA, 0) / total;
            const avgSocio = student.avaliacoesRecebidas.reduce((a, b) => a + b.mediaSocioemocional, 0) / total;

            student.statusAvaliacao = {
                foiAvaliado: true,
                mediaCHA: parseFloat(avgCHA.toFixed(1)),
                mediaSocioemocional: parseFloat(avgSocio.toFixed(1)),
                totalAvaliacoes: total,
                avaliadoPor: student.avaliacoesRecebidas.map(a => a.avaliadorMatricula)
            };

            await fs.writeFile(studentPath, JSON.stringify(student, null, 2), 'utf8');
            res.json({ message: 'Avaliação salva!', status: student.statusAvaliacao });
        } finally {
            releaseLock(matricula);
        }
    } catch (error) {
        res.status(500).json({ error: 'Erro ao salvar avaliação.' });
    }
});

app.get('/api/report360/:turma', authenticateToken, async (req, res) => {
    try {
        const { turma } = req.params;
        const files = await fs.readdir(DATA_DIR);
        
        const evaluations = [];
        for (const file of files.filter(f => f.endsWith('.json'))) {
            try {
                const data = await fs.readFile(path.join(DATA_DIR, file), 'utf8');
                const student = JSON.parse(data);
                
                // Normaliza o tipo para garantir que cadastros antigos e novos funcionem
                const userTipo = student.tipo ? student.tipo.toLowerCase() : 'aluno';
                
                // Se não tiver turma mas for um aluno antigo, podemos tentar inferir ou apenas aceitar se o filtro for compatível
                const studentTurma = student.turma || '';
                
                if (userTipo === 'aluno' && (studentTurma === turma || !turma) && student.avaliacoesRecebidas) {
                    student.avaliacoesRecebidas.forEach(av => {
                        evaluations.push({
                            alunoNome: student.nome || 'Aluno sem nome',
                            alunoMatricula: student.matricula,
                            avaliadorNome: av.avaliadorNome || 'Avaliador',
                            avaliadorMatricula: av.avaliadorMatricula,
                            avaliadorTipo: av.avaliadorTipo || 'estudante',
                            data: av.data || new Date().toISOString(),
                            mediaCHA: Number(av.mediaCHA) || 0,
                            mediaSocioemocional: Number(av.mediaSocioemocional) || 0
                        });
                    });
                }
            } catch (err) {
                console.error(`Erro ao processar arquivo no relatório 360: ${file}`, err);
            }
        }

        res.json(evaluations);
    } catch (error) {
        res.status(500).json({ error: 'Erro ao gerar relatório 360.' });
    }
});

app.listen(PORT, () => {
    console.log(`\n🚀 Servidor Rodando!`);
    console.log(`🔗 Local: http://localhost:${PORT}`);
    console.log(`📁 Dados: ${DATA_DIR}\n`);
});
