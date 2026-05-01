// dashboard.js - Lógica principal do Dashboard e Relatórios 360

document.addEventListener('DOMContentLoaded', () => {
    // Verificar se o usuário está logado
    window.user = JSON.parse(localStorage.getItem('user'));
    if (!window.user) {
        window.location.href = 'login.html';
        return;
    }

    // Inicializar interface com dados do usuário
    const userNameDisplay = document.getElementById('userNameDisplay');
    const turmaDisplay = document.getElementById('turmaDisplay');
    const userRoleBadge = document.getElementById('userRoleBadge');

    if (userNameDisplay) userNameDisplay.textContent = window.user.nome;
    if (turmaDisplay) turmaDisplay.textContent = window.user.turma;
    if (userRoleBadge) userRoleBadge.textContent = window.user.tipo;

    // Carregamento inicial
    loadStudents();
    
    // Inicializar ícones
    if (window.lucide) lucide.createIcons();
});

// --- Estados de Carregamento ---
function setButtonLoading(buttonId, isLoading) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    if (isLoading) {
        btn.disabled = true;
        btn.dataset.originalHtml = btn.innerHTML;
        btn.innerHTML = '<i class="loader-spinner"></i> Processando...';
    } else {
        btn.disabled = false;
        btn.innerHTML = btn.dataset.originalHtml || btn.innerHTML;
    }
}

// --- Funções Principais ---

async function loadStudents() {
    const tbody = document.getElementById('studentTableBody');
    if (!tbody) return;

    try {
        const students = await fetchAPI(`/api/students/${window.user.turma}`);
        
        tbody.innerHTML = '';

        // Update Stats
        const total = students.length;
        const evaluated = students.filter(s => s.statusAvaliacao?.foiAvaliado).length;
        const pending = total - evaluated;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-evaluated').textContent = evaluated;
        document.getElementById('stat-pending').textContent = pending;

        // Guardar para uso no modal de pendências
        window.currentStudents = students;

        students.forEach(s => {
            const tr = document.createElement('tr');
            
            const foiAvaliado = s.statusAvaliacao?.foiAvaliado || false;
            const statusClass = foiAvaliado ? 'badge-success' : 'badge-warning';
            const statusText = foiAvaliado ? 'Avaliado' : 'Pendente';
            
            let medias = '- / -';
            if (foiAvaliado && s.statusAvaliacao.mediaCHA !== null) {
                medias = `${s.statusAvaliacao.mediaCHA.toFixed(1)} / ${s.statusAvaliacao.mediaSocioemocional.toFixed(1)}`;
            }
            
            const safeNome = s.nome.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const isSelf = s.matricula === window.user.matricula;
            const avaliadores = s.statusAvaliacao?.avaliadoPor || [];
            const avaliadoresCount = avaliadores.length;
            const avaliadoresNomes = avaliadores.join('\n');
            
            tr.innerHTML = `
                <td style="font-weight: 500;">
                    <div>${s.nome} ${isSelf ? '<span class="badge" style="background: var(--bg-color); color: var(--text-muted); font-size: 0.6rem;">VOCÊ</span>' : ''}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted); font-family: monospace;">${s.matricula}</div>
                </td>
                <td>
                    <div style="display: flex; flex-direction: column; gap: 0.25rem;">
                        <span class="badge ${statusClass}">${statusText}</span>
                        ${avaliadoresCount > 0 ? `
                            <button class="btn-secondary" 
                                    onclick="openEvaluationModal('${s.matricula}', '${safeNome}')" 
                                    data-tooltip="Avaliadores:\n${avaliadoresNomes}"
                                    style="padding: 0.15rem 0.4rem; font-size: 0.65rem; background: none; border: 1px solid var(--border-color); color: var(--text-muted);">
                                <i data-lucide="check-check" style="width: 0.7rem; height: 0.7rem;"></i> Ver ${avaliadoresCount} avaliadores
                            </button>
                        ` : ''}
                    </div>
                </td>
                <td>${medias}</td>
                <td style="text-align: right;">
                    ${!isSelf ? `
                        <button class="btn-primary" onclick="openEvaluationModal('${s.matricula}', '${safeNome}')" style="padding: 0.5rem 1rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.5rem;">
                            <i data-lucide="${foiAvaliado ? 'edit-3' : 'plus-circle'}" style="width: 1rem; height: 1rem;"></i> 
                            ${foiAvaliado ? 'Editar' : 'Avaliar'}
                        </button>
                    ` : `
                        <button class="btn-secondary" onclick="openEvaluationModal('${s.matricula}', '${safeNome}')" style="padding: 0.5rem 1rem; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 0.5rem;">
                            <i data-lucide="eye" style="width: 1rem; height: 1rem;"></i> Minha Ficha
                        </button>
                    `}
                </td>
            `;
            tbody.appendChild(tr);
        });
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        showToast('Erro ao carregar alunos: ' + error.message, 'error');
    }
}

async function openEvaluationModal(matricula, nome) {
    const modal = document.getElementById('evaluationModal');
    if (!modal) return;

    // Limpar campos
    document.getElementById('targetMatricula').value = matricula;
    document.getElementById('targetStudentName').textContent = nome;
    
    // Resetar formulário
    const form = document.getElementById('evaluationForm');
    form.reset();
    
    const inputs = form.querySelectorAll('input, select');
    inputs.forEach(i => i.disabled = false);
    
    const submitBtn = document.getElementById('btn-save-evaluation');
    if (submitBtn) submitBtn.style.display = 'flex';

    const isSelf = matricula === window.user.matricula;
    let evaluatorsListHtml = '';

    try {
        const student = await fetchAPI(`/api/student/${matricula}`);
        
        if (isSelf || window.user.tipo === 'professor') {
            const avaliadores = student.avaliacoesRecebidas || [];
            if (avaliadores.length > 0) {
                evaluatorsListHtml = `
                    <div style="margin-top: 1rem; padding: 1rem; background: var(--bg-color); border-radius: var(--radius-md); border: 1px solid var(--border-color);">
                        <h4 style="font-size: 0.85rem; color: var(--primary-color); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.25rem;">
                            <i data-lucide="users" style="width: 1rem;"></i> Avaliadores que já enviaram nota:
                        </h4>
                        <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                            ${avaliadores.map(a => `
                                <span class="badge" style="background: white; border: 1px solid var(--border-color); color: var(--text-color); font-weight: 500;">
                                    ${a.avaliadorNome} (${a.avaliadorTipo})
                                </span>
                            `).join('')}
                        </div>
                    </div>
                `;
            }
        }

        const minhaAvaliacao = student.avaliacoesRecebidas?.find(a => a.avaliadorMatricula === window.user.matricula);
        
        if (minhaAvaliacao && minhaAvaliacao.detalhamento) {
            const det = minhaAvaliacao.detalhamento;
            document.getElementById('cha_conhecimento').value = det.cha.conhecimento.nota;
            document.getElementById('obs_conhecimento').value = det.cha.conhecimento.obs;
            document.getElementById('cha_habilidade').value = det.cha.habilidade.nota;
            document.getElementById('obs_habilidade').value = det.cha.habilidade.obs;
            document.getElementById('cha_atitude').value = det.cha.atitude.nota;
            document.getElementById('obs_atitude').value = det.cha.atitude.obs;
            document.getElementById('soft_autogestao').value = det.soft.autogestao;
            document.getElementById('soft_colaboracao').value = det.soft.colaboracao;
            document.getElementById('soft_resiliencia').value = det.soft.resiliencia;
            document.getElementById('soft_comunicacao').value = det.soft.comunicacao;
        }
    } catch (error) {
        console.error('Erro ao carregar dados do aluno:', error);
    }

    const modalBody = modal.querySelector('.modal-body');
    const existingList = document.getElementById('modal-evaluators-list');
    if (existingList) existingList.remove();
    
    if (evaluatorsListHtml) {
        const div = document.createElement('div');
        div.id = 'modal-evaluators-list';
        div.innerHTML = evaluatorsListHtml;
        modalBody.prepend(div);
    }

    modal.style.display = 'block';
    if (window.lucide) lucide.createIcons();
}

function closeModal() {
    const modal = document.getElementById('evaluationModal');
    if (modal) modal.style.display = 'none';
}

function switchTab(tab) {
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    
    const navId = tab === 'dashboard' ? 'nav-dashboard' : 'nav-report';
    const navEl = document.getElementById(navId);
    if (navEl) navEl.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');

    const tabId = tab === 'dashboard' ? 'dashboard-tab' : 'report-tab';
    const targetTab = document.getElementById(tabId);
    if (targetTab) targetTab.style.display = 'block';
    
    if (tab === 'dashboard') loadStudents();
    else load360Report();
}

async function load360Report() {
    const tbody = document.getElementById('report360Body');
    const summaryBody = document.getElementById('reportSummaryBody');
    if (!tbody || !summaryBody) return;

    try {
        const evaluations = await fetchAPI(`/api/report360/${window.user.turma}`);
        
        tbody.innerHTML = '';
        summaryBody.innerHTML = '';

        if (evaluations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma avaliação realizada ainda.</td></tr>';
            summaryBody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem; color: var(--text-muted);">Nenhuma média calculada.</td></tr>';
            document.getElementById('avg-cha-turma').textContent = '0.0';
            document.getElementById('avg-soft-turma').textContent = '0.0';
            document.getElementById('total-evaluations-count').textContent = '0';
            return;
        }

        const studentSummary = {};
        let totalCHA = 0;
        let totalSoft = 0;

        evaluations.forEach(av => {
            const mediaCHA = Number(av.mediaCHA) || 0;
            const mediaSocio = Number(av.mediaSocioemocional) || 0;
            totalCHA += mediaCHA;
            totalSoft += mediaSocio;

            if (!studentSummary[av.alunoMatricula]) {
                studentSummary[av.alunoMatricula] = {
                    nome: av.alunoNome,
                    avaliadores: new Set(),
                    sumCHA: 0,
                    sumSoft: 0,
                    count: 0
                };
            }
            studentSummary[av.alunoMatricula].avaliadores.add(av.avaliadorMatricula);
            studentSummary[av.alunoMatricula].sumCHA += mediaCHA;
            studentSummary[av.alunoMatricula].sumSoft += mediaSocio;
            studentSummary[av.alunoMatricula].count++;
        });

        Object.values(studentSummary).forEach(s => {
            const avgCHA = s.sumCHA / s.count;
            const avgSoft = s.sumSoft / s.count;
            const overall = (avgCHA + avgSoft) / 2;
            const avaliadoresNomes = Array.from(s.avaliadores).join('\n'); // Aqui precisaríamos dos nomes, mas temos matrículas no Set do summary. 
            // Para simplificar, o summary está usando Set de matriculas. Vamos manter a consistência com o que temos disponível.
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-weight: 600;">${s.nome}</td>
                <td>
                    <span class="badge" 
                          data-tooltip="Matrículas:\n${avaliadoresNomes}"
                          style="background: var(--bg-color); color: var(--primary-color);">
                        <i data-lucide="users" style="width: 0.8rem; height: 0.8rem; margin-right: 0.25rem;"></i>
                        ${s.avaliadores.size} avaliadores
                    </span>
                </td>
                <td><strong>${avgCHA.toFixed(1)}</strong></td>
                <td><strong>${avgSoft.toFixed(1)}</strong></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div style="flex-grow: 1; height: 8px; background: var(--bg-color); border-radius: 4px; overflow: hidden;">
                            <div style="width: ${overall * 10}%; height: 100%; background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));"></div>
                        </div>
                        <span style="font-weight: 700; color: var(--primary-color);">${overall.toFixed(1)}</span>
                    </div>
                </td>
            `;
            summaryBody.appendChild(tr);
        });

        evaluations.sort((a, b) => new Date(b.data) - new Date(a.data));
        evaluations.forEach(av => {
            const mediaCHA = Number(av.mediaCHA) || 0;
            const mediaSocio = Number(av.mediaSocioemocional) || 0;

            const tr = document.createElement('tr');
            const date = av.data ? new Date(av.data).toLocaleDateString('pt-BR') : '---';
            const papelClass = av.avaliadorTipo === 'professor' ? 'badge-success' : 'badge-warning';
            
            tr.innerHTML = `
                <td style="font-weight: 600;">${av.alunoNome}</td>
                <td>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <i data-lucide="${av.avaliadorTipo === 'professor' ? 'shield-check' : 'user'}" style="width: 1rem; color: var(--text-muted);"></i>
                        ${av.avaliadorNome}
                    </div>
                </td>
                <td><span class="badge ${papelClass}">${av.avaliadorTipo}</span></td>
                <td><strong style="color: var(--primary-color)">${mediaCHA.toFixed(1)}</strong></td>
                <td><strong style="color: var(--secondary-color)">${mediaSocio.toFixed(1)}</strong></td>
                <td style="font-size: 0.8rem; color: var(--text-muted)">${date}</td>
                <td>
                    <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.7rem; display: flex; align-items: center; gap: 0.25rem;" onclick="showEvalDetails('${av.alunoMatricula}', '${av.avaliadorMatricula}', '${av.alunoNome}')">
                        <i data-lucide="eye" style="width: 0.8rem;"></i> Detalhes
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        const count = evaluations.length;
        document.getElementById('avg-cha-turma').textContent = (totalCHA / count).toFixed(1);
        document.getElementById('avg-soft-turma').textContent = (totalSoft / count).toFixed(1);
        document.getElementById('total-evaluations-count').textContent = count;

        if (window.lucide) lucide.createIcons();
    } catch (error) {
        showToast('Erro ao carregar relatório: ' + error.message, 'error');
    }
}

async function showEvalDetails(studentMatricula, avaliadorMatricula, studentNome) {
    await openEvaluationModal(studentMatricula, studentNome);
    
    const submitBtn = document.getElementById('btn-save-evaluation');
    if (window.user.matricula !== avaliadorMatricula && window.user.tipo !== 'professor') {
        const inputs = document.querySelectorAll('#evaluationForm input, #evaluationForm select');
        inputs.forEach(i => i.disabled = true);
        if (submitBtn) submitBtn.style.display = 'none';
    }
}

async function showMissingEvaluators() {
    const list = document.getElementById('missingEvaluatorsList');
    if (!list) return;
    list.innerHTML = '';
    
    try {
        const evaluations = await fetchAPI(`/api/report360/${window.user.turma}`);
        const whoEvaluated = new Set(evaluations.map(av => av.avaliadorMatricula));
        
        const missing = (window.currentStudents || []).filter(s => !whoEvaluated.has(s.matricula));
        
        if (missing.length === 0) {
            list.innerHTML = '<li style="padding: 1rem; text-align: center; color: var(--success-color); font-weight: 600;">🎉 Todos já avaliaram!</li>';
        } else {
            missing.forEach(s => {
                const li = document.createElement('li');
                li.style.padding = '0.75rem';
                li.style.borderBottom = '1px solid var(--border-color)';
                li.style.display = 'flex';
                li.style.justifyContent = 'space-between';
                li.style.alignItems = 'center';
                li.innerHTML = `
                    <span style="font-weight: 500;">${s.nome}</span>
                    <span style="font-size: 0.75rem; color: var(--danger-color); font-weight: 600;">Pendente</span>
                `;
                list.appendChild(li);
            });
        }
        
        document.getElementById('missingEvaluatorsModal').style.display = 'block';
        if (window.lucide) lucide.createIcons();
    } catch (error) {
        showToast('Erro ao carregar pendências', 'error');
    }
}

function closeMissingModal() {
    const modal = document.getElementById('missingEvaluatorsModal');
    if (modal) modal.style.display = 'none';
}

// --- Event Listeners ---

const evaluationForm = document.getElementById('evaluationForm');
if (evaluationForm) {
    evaluationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        setButtonLoading('btn-save-evaluation', true);

        const detalhamento = {
            cha: {
                conhecimento: {
                    nota: parseInt(document.getElementById('cha_conhecimento').value),
                    obs: document.getElementById('obs_conhecimento').value
                },
                habilidade: {
                    nota: parseInt(document.getElementById('cha_habilidade').value),
                    obs: document.getElementById('obs_habilidade').value
                },
                atitude: {
                    nota: parseInt(document.getElementById('cha_atitude').value),
                    obs: document.getElementById('obs_atitude').value
                }
            },
            soft: {
                autogestao: parseInt(document.getElementById('soft_autogestao').value),
                colaboracao: parseInt(document.getElementById('soft_colaboracao').value),
                resiliencia: parseInt(document.getElementById('soft_resiliencia').value),
                comunicacao: parseInt(document.getElementById('soft_comunicacao').value)
            }
        };

        const data = {
            matricula: document.getElementById('targetMatricula').value,
            detalhamento: detalhamento
        };

        try {
            await fetchAPI('/api/evaluate', {
                method: 'POST',
                body: JSON.stringify(data)
            });

            showToast('Avaliação salva com sucesso!');
            closeModal();
            loadStudents();
        } catch (error) {
            showToast(error.message, 'error');
        } finally {
            setButtonLoading('btn-save-evaluation', false);
        }
    });
}

function filterStudents() {
    const searchTerm = document.getElementById('studentSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#studentTableBody tr');
    let hasResults = false;

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            row.style.display = '';
            hasResults = true;
        } else {
            row.style.display = 'none';
        }
    });

    let noResultMsg = document.getElementById('no-results-msg');
    if (!hasResults) {
        if (!noResultMsg) {
            noResultMsg = document.createElement('div');
            noResultMsg.id = 'no-results-msg';
            noResultMsg.className = 'empty-state';
            noResultMsg.innerHTML = '<i data-lucide="search-x"></i> <p>Nenhum aluno encontrado.</p>';
            document.querySelector('.table-container').appendChild(noResultMsg);
            if (window.lucide) lucide.createIcons();
        }
    } else if (noResultMsg) {
        noResultMsg.remove();
    }
}

async function exportToCSV() {
    try {
        const students = await fetchAPI(`/api/students/${window.user.turma}`);
        
        let csv = 'Nome,Matricula,Turma,Status,Media CHA,Media Socioemocional\n';
        students.forEach(s => {
            const status = s.statusAvaliacao?.foiAvaliado ? 'Avaliado' : 'Pendente';
            const cha = s.statusAvaliacao?.mediaCHA || '';
            const socio = s.statusAvaliacao?.mediaSocioemocional || '';
            csv += `"${s.nome}","${s.matricula}","${s.turma}","${status}","${cha}","${socio}"\n`;
        });

        const blob = new Blob(["\ufeff" + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `relatorio_turma_${window.user.turma}.csv`;
        link.click();
        showToast('Dados exportados com sucesso!');
    } catch (error) {
        showToast('Erro ao exportar dados', 'error');
    }
}

// Fechar modal ao clicar fora dele
window.onclick = function(event) {
    const evalModal = document.getElementById('evaluationModal');
    const missingModal = document.getElementById('missingEvaluatorsModal');
    if (event.target == evalModal) closeModal();
    if (event.target == missingModal) closeMissingModal();
}

// Exportar para uso global (caso necessário via HTML)
window.switchTab = switchTab;
window.showMissingEvaluators = showMissingEvaluators;
window.closeMissingModal = closeMissingModal;
window.openEvaluationModal = openEvaluationModal;
window.closeModal = closeModal;
window.showEvalDetails = showEvalDetails;
window.exportToCSV = exportToCSV;
window.filterStudents = filterStudents;
