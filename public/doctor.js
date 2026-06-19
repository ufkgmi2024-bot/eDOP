// ==================== ГЛОБАЛДЫК ====================
let currentPatientId = null;
let allPatients = [];

// ==================== ТОКЕН ТЕКШЕРҮҮ ====================
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!token || user.role !== 'doctor') {
        window.location.href = '/login.html';
        return null;
    }
    
    document.getElementById('doctorName').textContent = user.fullName || 'Врач';
    return token;
}

// ==================== API СУРАМДАРЫ ====================
async function apiRequest(url, options = {}) {
    const token = localStorage.getItem('token');
    const response = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...options.headers
        }
    });
    
    if (response.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login.html';
        throw new Error('Кирүү мүмкүн эмес');
    }
    
    return response.json();
}

// ==================== СТАТИСТИКА ====================
async function loadStats() {
    try {
        const data = await apiRequest('/api/doctor/stats');
        
        if (data.success) {
            const stats = data.stats;
            document.getElementById('statPatients').textContent = stats.totalPatients || 0;
            document.getElementById('statVisits').textContent = stats.totalVisits || 0;
            document.getElementById('statRecent').textContent = stats.recentVisits || 0;
            document.getElementById('statAvgBP').textContent = 
                `${stats.avgBP?.systolic || 0}/${stats.avgBP?.diastolic || 0}`;
        }
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// ==================== ПАЦИЕНТТЕР ====================
async function loadPatients() {
    try {
        const data = await apiRequest('/api/doctor/patients');
        
        if (data.success) {
            allPatients = data.patients || [];
            displayPatients(allPatients);
        }
    } catch (error) {
        console.error('Load patients error:', error);
    }
}

function displayPatients(patients) {
    const tbody = document.getElementById('patientsTable');
    
    if (!patients || patients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Пациенттер жок</td></tr>';
        return;
    }

    tbody.innerHTML = patients.map(p => {
        const lastBP = p.lastVisit ? `${p.lastVisit.systolic}/${p.lastVisit.diastolic}` : '-';
        const status = p.lastVisit?.aiRiskLevel || 'normal';
        return `
            <tr>
                <td><strong>${p.fullName}</strong></td>
                <td>${p.inn}</td>
                <td>${p.phone || '-'}</td>
                <td><span class="badge bg-info">${p.totalVisits || 0}</span></td>
                <td><span class="badge-status ${status}">${lastBP}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="showPatient('${p.id}')">
                        <i class="bi bi-eye"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// ==================== ИЗДӨӨ ====================
async function searchPatients() {
    const query = document.getElementById('searchInput').value.trim();
    
    if (!query) {
        loadPatients();
        return;
    }

    try {
        const data = await apiRequest(`/api/doctor/patients/search?q=${encodeURIComponent(query)}`);
        
        if (data.success) {
            displayPatients(data.patients);
            if (data.patients.length === 0) {
                showMessage('Пациент табылган жок', 'info');
            }
        }
    } catch (error) {
        console.error('Search error:', error);
        showMessage('Издөөдө ката кетти', 'danger');
    }
}

// ==================== ПАЦИЕНТ КОШУУ ====================
async function savePatient() {
    const data = {
        inn: document.getElementById('patInn').value.trim(),
        fullName: document.getElementById('patFullName').value.trim(),
        birthDate: document.getElementById('patBirthDate').value,
        gender: document.getElementById('patGender').value,
        phone: document.getElementById('patPhone').value.trim(),
        address: document.getElementById('patAddress').value.trim(),
        bloodGroup: document.getElementById('patBloodGroup').value,
        height: parseInt(document.getElementById('patHeight').value) || null,
        weight: parseFloat(document.getElementById('patWeight').value) || null,
        allergy: document.getElementById('patAllergy').value.trim(),
        chronicDiseases: document.getElementById('patChronic').value.split(',').map(s => s.trim()).filter(Boolean),
        currentMedicines: document.getElementById('patMedicines').value.split(',').map(s => s.trim()).filter(Boolean)
    };

    if (!data.inn || !data.fullName) {
        showMessage('ИНН жана аты-жөнү милдеттүү!', 'warning');
        return;
    }

    if (data.inn.length !== 14 || !/^\d+$/.test(data.inn)) {
        showMessage('ИНН 14 сандан турушу керек!', 'warning');
        return;
    }

    try {
        const result = await apiRequest('/api/doctor/patients', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (result.success) {
            showMessage('✅ Пациент ийгиликтүү кошулду!', 'success');
            document.getElementById('addPatientForm').reset();
            const modal = bootstrap.Modal.getInstance(document.getElementById('addPatientModal'));
            modal.hide();
            loadPatients();
            loadStats();
        } else {
            showMessage('❌ ' + (result.error || 'Ката кетти'), 'danger');
        }
    } catch (error) {
        console.error('Save patient error:', error);
        showMessage('❌ Сервер менен байланыш жок!', 'danger');
    }
}

// ==================== ПАЦИЕНТТИ КӨРСӨТҮҮ ====================
async function showPatient(id) {
    currentPatientId = id;
    
    try {
        const data = await apiRequest(`/api/doctor/patients/${id}/history`);
        
        if (data.success) {
            const patient = data.patient;
            const visits = data.visits || [];
            
            // Пациент маалыматы
            document.getElementById('patientFullName').textContent = patient.fullName;
            document.getElementById('patientInn').textContent = patient.inn;
            document.getElementById('patientPhone').textContent = patient.phone || '-';
            document.getElementById('patientAddress').textContent = patient.address || '-';
            
            // Тарых
            const tbody = document.getElementById('historyTable');
            if (visits.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Визиттер жок</td></tr>';
            } else {
                tbody.innerHTML = visits.map(v => {
                    const status = v.aiRiskLevel || 'normal';
                    return `
                        <tr>
                            <td>${new Date(v.visitDate).toLocaleString('ky-KG')}</td>
                            <td><strong>${v.systolic}</strong></td>
                            <td><strong>${v.diastolic}</strong></td>
                            <td>${v.pulse || '-'}</td>
                            <td><span class="badge-status ${status}">${v.aiMessage || status}</span></td>
                            <td>${v.diagnosis || '-'}</td>
                        </tr>
                    `;
                }).join('');
            }
            
            // AI анализди тазалоо
            document.getElementById('aiAnalysis').innerHTML = '';
            
            document.getElementById('patientDetails').style.display = 'block';
            document.getElementById('patientDetails').scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('Show patient error:', error);
        showMessage('Пациентти көрсөтүүдө ката', 'danger');
    }
}

function closePatientDetails() {
    document.getElementById('patientDetails').style.display = 'none';
    currentPatientId = null;
    document.getElementById('aiAnalysis').innerHTML = '';
}

// ==================== ВИЗИТ КОШУУ ====================
async function addVisit() {
    if (!currentPatientId) {
        showMessage('Алгач пациентти тандаңыз!', 'warning');
        return;
    }

    const systolic = parseInt(document.getElementById('systolic').value);
    const diastolic = parseInt(document.getElementById('diastolic').value);
    const pulse = parseInt(document.getElementById('pulse').value);
    const temperature = parseFloat(document.getElementById('temperature').value);
    const spo2 = parseInt(document.getElementById('spo2').value);
    const glucose = parseFloat(document.getElementById('glucose').value);
    const complaints = document.getElementById('complaints').value.trim();
    const diagnosis = document.getElementById('diagnosis').value.trim();
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

    const data = {
        patientId: currentPatientId,
        systolic,
        diastolic,
        pulse: pulse || null,
        temperature: temperature || null,
        spo2: spo2 || null,
        glucose: glucose || null,
        complaints,
        diagnosis,
        notes
    };

    try {
        const result = await apiRequest('/api/doctor/visits', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (result.success) {
            // AI анализди көрсөтүү
            const ai = result.ai;
            document.getElementById('aiAnalysis').innerHTML = `
                <div class="ai-analysis-box ${ai.riskLevel}">
                    <strong>🤖 AI анализи:</strong> ${ai.message}
                </div>
            `;

            showMessage('✅ Визит ийгиликтүү кошулду!', 'success');
            
            // Форманы тазалоо
            document.getElementById('systolic').value = '';
            document.getElementById('diastolic').value = '';
            document.getElementById('pulse').value = '';
            document.getElementById('temperature').value = '';
            document.getElementById('spo2').value = '';
            document.getElementById('glucose').value = '';
            document.getElementById('complaints').value = '';
            document.getElementById('diagnosis').value = '';
            document.getElementById('notes').value = '';

            // Жаңыртуу
            await showPatient(currentPatientId);
            loadPatients();
            loadStats();
        } else {
            showMessage('❌ ' + (result.error || 'Визит кошууда ката'), 'danger');
        }
    } catch (error) {
        console.error('Add visit error:', error);
        showMessage('❌ Сервер менен байланыш жок!', 'danger');
    }
}

// ==================== БИЛДИРҮҮ ====================
function showMessage(text, type = 'info') {
    const box = document.getElementById('messageBox');
    box.textContent = text;
    box.className = `alert alert-${type} d-block position-fixed top-0 end-0 m-3`;
    box.style.maxWidth = '400px';
    
    clearTimeout(window.messageTimeout);
    window.messageTimeout = setTimeout(() => {
        box.className = 'alert d-none';
    }, 5000);
}

// ==================== ЧЫГУУ ====================
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login.html';
}

// ==================== БАШТАПКЫ ЖҮКТӨӨ ====================
document.addEventListener('DOMContentLoaded', function() {
    const token = checkAuth();
    if (token) {
        loadStats();
        loadPatients();
    }
});