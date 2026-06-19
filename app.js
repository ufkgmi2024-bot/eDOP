// ==================== ГЛОБАЛДЫК ӨЗГӨРМӨЛӨР ====================
let currentPatient = null;
let currentPage = 1;
const LIMIT = 50;

// ==================== API КЫЛМАТТАРЫ ====================

const API_URL = window.location.origin;

// ==================== СТАТИСТИКАНЫ ЖҮКТӨӨ ====================

async function loadStats() {
    try {
        const response = await fetch(`${API_URL}/api/stats`);
        const data = await response.json();
        
        if (data.success) {
            const stats = data.stats;
            document.getElementById('statTotal').textContent = stats.total_patients || 0;
            document.getElementById('statWarning').textContent = stats.warning_count || 0;
            document.getElementById('statDanger').textContent = stats.critical_count || 0;
            document.getElementById('statNormal').textContent = stats.normal_count || 0;
            document.getElementById('totalPatients').textContent = stats.total_patients || 0;
        }
    } catch (error) {
        console.error('Статистиканы жүктөөдө ката:', error);
    }
}

// ==================== ИЗДӨӨ ====================

async function searchPatient() {
    const searchValue = document.getElementById('searchInput').value.trim();
    
    if (!searchValue) {
        showMessage('Сураныч, ИНН же аты-жөнүн терүү', 'warning');
        return;
    }

    showLoading(true);

    try {
        // ИНН менен издөө (эгер 14 сан болсо)
        if (searchValue.length === 14 && /^\d+$/.test(searchValue)) {
            const response = await fetch(`${API_URL}/api/patients/search/${searchValue}`);
            const data = await response.json();
            
            if (data.success) {
                currentPatient = data.patient;
                displayPatientInfo(currentPatient);
                document.getElementById('patientInfo').classList.remove('d-none');
                showMessage(`Пациент табылды: ${currentPatient.full_name}`, 'success');
            } else {
                showMessage('Пациент табылган жок. Жаңы пациент кошуңуз.', 'info');
                document.getElementById('patientInfo').classList.add('d-none');
            }
        } else {
            // Жалпы издөө (беттөө менен)
            const response = await fetch(`${API_URL}/api/patients?search=${encodeURIComponent(searchValue)}&page=${currentPage}&limit=${LIMIT}`);
            const data = await response.json();
            
            if (data.success && data.patients.length > 0) {
                // Биринчи пациентти көрсөтүү
                const patient = data.patients[0];
                currentPatient = patient;
                displayPatientInfo(patient);
                document.getElementById('patientInfo').classList.remove('d-none');
                showMessage(`${data.pagination.total} пациент табылды`, 'success');
            } else {
                showMessage('Пациент табылган жок', 'info');
                document.getElementById('patientInfo').classList.add('d-none');
            }
        }
    } catch (error) {
        console.error('Издөөдө ката:', error);
        showMessage('Сервер менен байланыш жок!', 'danger');
    }

    showLoading(false);
}

// ==================== ПАЦИЕНТТИ КӨРСӨТҮҮ ====================

function displayPatientInfo(patient) {
    document.getElementById('patientName').textContent = patient.full_name || patient.fullName;
    document.getElementById('patientBirth').textContent = patient.birth_date || patient.birthDate || 'Көрсөтүлө элек';
    document.getElementById('patientPhone').textContent = patient.phone || 'Көрсөтүлө элек';
    document.getElementById('patientAddress').textContent = patient.address || 'Көрсөтүлө элек';
    document.getElementById('patientInn').textContent = patient.inn;

    // Акыркы басым
    const lastBP = patient.lastBP;
    if (lastBP) {
        document.getElementById('lastCheckInfo').innerHTML = `
            <strong>${lastBP.systolic}/${lastBP.diastolic}</strong> 
            (${lastBP.pulse || '?'} уд/мин)
            <br><small class="text-muted">${new Date(lastBP.date).toLocaleString('ky-KG')}</small>
        `;
        const statusBadge = getStatusBadge(lastBP.status);
        document.getElementById('lastCheckStatus').innerHTML = statusBadge;
    } else {
        document.getElementById('lastCheckInfo').textContent = 'Текшерүү жок';
        document.getElementById('lastCheckStatus').innerHTML = '';
    }

    // Тарых
    const history = patient.history || [];
    displayHistory(history);
    
    // Тренд
    analyzeTrend(patient);
    
    // AI анализин тазалоо
    document.getElementById('aiAnalysis').innerHTML = '';
}

function displayHistory(history) {
    const tbody = document.getElementById('historyTable');
    
    if (!history || history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Текшерүүлөр жок</td></tr>';
        return;
    }

    tbody.innerHTML = history.map(record => {
        const statusBadge = getStatusBadge(record.ai_status);
        return `
            <tr>
                <td>${new Date(record.check_date).toLocaleString('ky-KG')}</td>
                <td><strong>${record.systolic}</strong></td>
                <td><strong>${record.diastolic}</strong></td>
                <td>${record.pulse || '-'}</td>
                <td>${statusBadge}</td>
                <td>${record.notes || '-'}</td>
            </tr>
        `;
    }).join('');
}

// ==================== AI ФУНКЦИЯЛАР ====================

function getStatusBadge(status) {
    const badges = {
        'normal': '<span class="badge-status normal">✅ Норма</span>',
        'warning': '<span class="badge-status warning">⚠️ Эскертүү</span>',
        'danger': '<span class="badge-status danger">🚨 Кооптуу!</span>'
    };
    return badges[status] || badges.normal;
}

function analyzeTrend(patient) {
    const container = document.getElementById('trendAnalysis');
    const history = patient.history || [];
    
    if (history.length < 2) {
        container.innerHTML = '<p class="text-muted mb-0">📊 Трендди көрсөтүү үчүн 2 же андан көп текшерүү керек.</p>';
        return;
    }

    // Трендди эсептөө
    const sorted = [...history].sort((a, b) => new Date(a.check_date) - new Date(b.check_date));
    const last = sorted[sorted.length - 1];
    const prev = sorted[sorted.length - 2];
    
    const diffSystolic = last.systolic - prev.systolic;
    const diffDiastolic = last.diastolic - prev.diastolic;
    
    let trendText = '';
    let trendClass = '';
    
    if (Math.abs(diffSystolic) < 5 && Math.abs(diffDiastolic) < 5) {
        trendText = '➡️ Басым туруктуу';
        trendClass = 'trend-stable';
    } else if (diffSystolic > 5 || diffDiastolic > 5) {
        trendText = '📈 Басым көтөрүлүп жатат!';
        trendClass = 'trend-up';
    } else if (diffSystolic < -5 || diffDiastolic < -5) {
        trendText = '📉 Басым түшүп жатат!';
        trendClass = 'trend-down';
    }
    
    container.innerHTML = `
        <h6 class="mb-1">📊 Тренд анализи</h6>
        <p class="${trendClass} mb-0">
            ${trendText}
            <small class="text-muted ms-2">
                (${prev.systolic}/${prev.diastolic} → ${last.systolic}/${last.diastolic})
            </small>
        </p>
        <small class="text-muted">
            ${diffSystolic > 0 ? '+' : ''}${diffSystolic} мм рт.ст. (жогорку) | 
            ${diffDiastolic > 0 ? '+' : ''}${diffDiastolic} мм рт.ст. (төмөнкү)
        </small>
    `;
}

// ==================== БАСЫМ КОШУУ ====================

async function addBloodPressure() {
    if (!currentPatient) {
        showMessage('Алгач пациентти табыңыз!', 'warning');
        return;
    }

    const systolic = parseInt(document.getElementById('systolic').value);
    const diastolic = parseInt(document.getElementById('diastolic').value);
    const pulse = parseInt(document.getElementById('pulse').value);
    const notes = document.getElementById('notes').value.trim();

    if (!systolic || !diastolic) {
        showMessage('Жогорку жана төмөнкү басымды толтуруңуз!', 'warning');
        return;
    }

    if (systolic < 60 || systolic > 250) {
        showMessage('Жогорку басым 60-250 аралыгында болушу керек!', 'warning');
        return;
    }

    if (diastolic < 30 || diastolic > 150) {
        showMessage('Төмөнкү басым 30-150 аралыгында болушу керек!', 'warning');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`${API_URL}/api/blood-pressure`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inn: currentPatient.inn,
                systolic,
                diastolic,
                pulse: pulse || 0,
                notes
            })
        });

        const data = await response.json();

        if (data.success) {
            // AI анализди көрсөтүү
            const ai = data.ai;
            document.getElementById('aiAnalysis').innerHTML = `
                <div class="ai-analysis-box ${ai.status}">
                    <strong>🤖 AI анализи:</strong> ${ai.message}
                    ${data.trend ? `<br><small>📊 ${data.trend.message}</small>` : ''}
                </div>
            `;

            showMessage('✅ Басым ийгиликтүү кошулду!', 'success');
            
            // Форманы тазалоо
            document.getElementById('systolic').value = '';
            document.getElementById('diastolic').value = '';
            document.getElementById('pulse').value = '';
            document.getElementById('notes').value = '';

            // Пациентти жаңыртуу
            await searchPatient();
            loadStats();
        } else {
            showMessage(data.error || 'Басым кошууда ката!', 'danger');
        }
    } catch (error) {
        console.error('Ката:', error);
        showMessage('Сервер менен байланыш жок!', 'danger');
    }

    showLoading(false);
}

// ==================== ЖАҢЫ ПАЦИЕНТ ====================

function showNewPatientForm() {
    document.getElementById('newPatientForm').classList.remove('d-none');
    document.getElementById('searchInput').value = '';
    document.getElementById('patientInfo').classList.add('d-none');
    hideMessage();
}

function hideNewPatientForm() {
    document.getElementById('newPatientForm').classList.add('d-none');
    document.getElementById('newInn').value = '';
    document.getElementById('newName').value = '';
    document.getElementById('newBirth').value = '';
    document.getElementById('newPhone').value = '';
    document.getElementById('newAddress').value = '';
}

async function saveNewPatient() {
    const inn = document.getElementById('newInn').value.trim();
    const fullName = document.getElementById('newName').value.trim();
    const birthDate = document.getElementById('newBirth').value;
    const phone = document.getElementById('newPhone').value.trim();
    const address = document.getElementById('newAddress').value.trim();

    if (!inn || !fullName) {
        showMessage('ИНН жана аты-жөнү милдеттүү!', 'warning');
        return;
    }

    if (inn.length !== 14 || !/^\d+$/.test(inn)) {
        showMessage('ИНН 14 сандан турушу керек!', 'warning');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`${API_URL}/api/patients`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inn, fullName, birthDate, phone, address })
        });

        const data = await response.json();

        if (data.success) {
            showMessage(`✅ Пациент "${fullName}" ийгиликтүү кошулду!`, 'success');
            hideNewPatientForm();
            document.getElementById('searchInput').value = inn;
            await searchPatient();
            loadStats();
        } else {
            showMessage(data.error || 'Сактоодо ката!', 'danger');
        }
    } catch (error) {
        console.error('Ката:', error);
        showMessage('Сервер менен байланыш жок!', 'danger');
    }

    showLoading(false);
}

// ==================== РЕЗЕРВДИК КӨЧҮРМӨ ====================

async function createBackup() {
    showLoading(true);
    try {
        const response = await fetch(`${API_URL}/api/backup`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            const sizeMB = (data.size / 1024 / 1024).toFixed(2);
            showMessage(`✅ Резервдик көчүрмө алынды! (${sizeMB} MB)`, 'success');
        } else {
            showMessage('Резервдөөдө ката!', 'danger');
        }
    } catch (error) {
        console.error('Ката:', error);
        showMessage('Резервдөөдө ката!', 'danger');
    }
    showLoading(false);
}

// ==================== ЖАРДАМЧЫ ФУНКЦИЯЛАР ====================

function showMessage(text, type = 'info') {
    const box = document.getElementById('messageBox');
    box.textContent = text;
    box.className = `alert alert-${type} d-block`;
    
    // Автоматтык жашыруу (5 секунддан кийин)
    clearTimeout(window.messageTimeout);
    window.messageTimeout = setTimeout(() => {
        hideMessage();
    }, 5000);
}

function hideMessage() {
    document.getElementById('messageBox').className = 'alert d-none';
}

function showLoading(show) {
    document.getElementById('loading').style.display = show ? 'block' : 'none';
}

// Enter баскычы
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('searchInput').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchPatient();
        }
    });
    
    // Сандарды гана терүү
    document.getElementById('searchInput').addEventListener('input', function(e) {
        // ИНН үчүн сандарды гана калтыруу (14 сан)
        if (this.value.length <= 14) {
            this.value = this.value.replace(/[^0-9]/g, '');
        }
    });
    
    document.getElementById('newInn').addEventListener('input', function(e) {
        this.value = this.value.replace(/\D/g, '').slice(0, 14);
    });

    // Баштапкы жүктөө
    loadStats();
});