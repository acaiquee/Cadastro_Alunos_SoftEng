// Theme Management
const themeToggle = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'light';

document.documentElement.setAttribute('data-theme', currentTheme);
if (themeToggle && currentTheme === 'dark') {
    themeToggle.checked = true;
}

if (themeToggle) {
    themeToggle.addEventListener('change', (e) => {
        const theme = e.target.checked ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    });
}

// Toast Notification System
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'check-circle';
    let color = 'var(--success-color)';
    if (type === 'error') {
        icon = 'alert-circle';
        color = 'var(--danger-color)';
    }

    toast.style.borderLeftColor = color;
    toast.innerHTML = `
        <i data-lucide="${icon}" style="width: 1.25rem; color: ${color}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Registration Logic
const registrationForm = document.getElementById('registrationForm');
if (registrationForm) {
    registrationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const nome = document.getElementById('nome').value.trim();
        const senha = document.getElementById('senha').value;
        const email = document.getElementById('email').value.trim();
        const matricula = document.getElementById('matricula').value.trim();

        // Validações no Front-end
        if (nome.length < 3) {
            showToast('O nome deve ter pelo menos 3 caracteres', 'error');
            return;
        }
        if (senha.length < 6) {
            showToast('A senha deve ter pelo menos 6 caracteres', 'error');
            return;
        }
        if (!email.includes('@')) {
            showToast('Insira um e-mail válido', 'error');
            return;
        }
        if (!/^[a-zA-Z0-9]+$/.test(matricula)) {
            showToast('A matrícula deve conter apenas letras e números', 'error');
            return;
        }
        
        const studentData = {
            nome: nome,
            tipo: document.getElementById('tipo').value,
            turma: document.getElementById('turma').value,
            matricula: matricula,
            email: email,
            senha: senha
        };

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(studentData)
            });

            const result = await response.json();

            if (response.ok) {
                showToast('Cadastro realizado com sucesso!');
                setTimeout(() => window.location.href = 'login.html', 1500);
            } else {
                showToast(result.error || 'Erro ao realizar cadastro', 'error');
            }
        } catch (error) {
            console.error('Erro no registro:', error);
            showToast('Erro ao conectar com o servidor', 'error');
        }
    });
}

// Login Logic
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const matricula = document.getElementById('matricula').value.trim();
        const senha = document.getElementById('senha').value;

        if (!matricula || !senha) {
            showToast('Preencha todos os campos', 'error');
            return;
        }

        const loginData = {
            matricula: matricula,
            senha: senha
        };

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                body: JSON.stringify(loginData)
            });

            const result = await response.json();

            if (response.ok) {
                localStorage.setItem('user', JSON.stringify(result.student));
                showToast('Login bem-sucedido! Redirecionando...');
                setTimeout(() => window.location.href = 'dashboard.html', 1000);
            } else {
                showToast(result.error || 'Credenciais inválidas', 'error');
            }
        } catch (error) {
            console.error('Erro no login:', error);
            showToast('Erro ao conectar com o servidor', 'error');
        }
    });
}

function logout() {
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}
