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

// API Wrapper for common logic and security
async function fetchAPI(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const defaultHeaders = {
        'Content-Type': 'application/json; charset=utf-8',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };

    const config = {
        ...options,
        headers: {
            ...defaultHeaders,
            ...options.headers
        }
    };

    try {
        const response = await fetch(endpoint, config);
        
        // Handle 401/403 (Unauthorized/Forbidden)
        if (response.status === 401 || response.status === 403) {
            const isLoginPage = window.location.pathname.includes('login.html');
            const isIndexPage = window.location.pathname.endsWith('/') || window.location.pathname.includes('index.html');
            
            if (!isLoginPage && !isIndexPage) {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                showToast('Sessão expirada. Redirecionando...', 'error');
                setTimeout(() => window.location.href = 'login.html', 1500);
                return;
            }
        }

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || `Erro ${response.status}: Falha na requisição`);
        }
        return data;
    } catch (error) {
        console.error(`API Error (${endpoint}):`, error);
        if (error.message.includes('Failed to fetch')) {
            showToast('Erro de conexão com o servidor', 'error');
        }
        throw error;
    }
}

// Export for global use
window.fetchAPI = fetchAPI;
window.showToast = showToast;

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
            await fetchAPI('/api/register', {
                method: 'POST',
                body: JSON.stringify(studentData)
            });

            showToast('Cadastro realizado com sucesso!');
            setTimeout(() => window.location.href = 'login.html', 1500);
        } catch (error) {
            showToast(error.message, 'error');
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

        try {
            const result = await fetchAPI('/api/login', {
                method: 'POST',
                body: JSON.stringify({ matricula, senha })
            });

            localStorage.setItem('user', JSON.stringify(result.user));
            localStorage.setItem('token', result.token);
            
            showToast('Login bem-sucedido! Redirecionando...');
            setTimeout(() => window.location.href = 'dashboard.html', 1000);
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

function logout() {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}
window.logout = logout;
