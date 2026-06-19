// ==================== ГЛОБАЛДЫК ====================
let currentTab = 'dashboard';

// ==================== ТОКЕН ТЕКШЕРҮҮ ====================
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!token || user.role !== 'admin') {
        window.location.href = '/login.html';
        return null;
    }
    
    document.getElementById('adminName').textContent = user.fullName || 'Админ';
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
        const data = await apiRequest('/api/admin/stats');
        
        if (data.success) {
            const stats = data.stats;
            document.getElementById('statDoctors').textContent = stats.totalDoctors || 0;
            document.getElementById('statPatients').textContent = stats.totalPatients || 0;
            document.getElementById('statVisits').textContent = stats.totalVisits || 0;
            document.getElementById('statDanger').textContent = stats.aiStats.danger || 0;
            
            // Врачтардын статистикасы
            const tbody = document.getElementById('doctorStatsTable');
            if (stats.doctors && stats.doctors.length > 0) {
                tbody.innerHTML = stats.doctors.map(doc => `
                    <tr>
                        <td><strong>${doc.doctorName}</strong></td>
                        <td>${doc.specialty || '-'}</td>
                        <td><span class="badge bg-info">${doc.totalPatients}</span></td>
                        <td><span class="badge bg-primary">${doc.totalVisits}</span></td>
                        <td>${doc.lastVisit ? new Date(doc.lastVisit).toLocaleString('ky-KG') : 'Активдүү эмес'}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// ==================== ВРАЧТАР ====================
async function loadDoctors() {
    try {
        const data = await apiRequest('/api/admin/doctors');
        
        if (data.success) {
            const tbody = document.getElementById('doctorsTable');
            if (data.doctors && data.doctors.length > 0) {
                tbody.innerHTML = data.doctors.map(doc => `
                    <tr>
                        <td><strong>${doc.fullName}</strong></td>
                        <td>${doc.username}</td>
                        <td>${doc.specialty || '-'}</td>
                        <td>${doc.cabinet || '-'}</td>
                        <td>
                            <span class="badge-status ${doc.isActive ? 'active' : 'inactive'}">
                                ${doc.isActive ? '✅ Активдүү' : '⛔ Активдүү эмес'}
                            </span>
                        </td>
                        <td>
                            <button class="btn btn-sm btn-danger" onclick="deleteDoctor('${doc.id}')">
                                <i class="bi bi-trash"></i>
                            </button>
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Load doctors error:', error);
    }
}

// ==================== ВРАЧ КОШУУ ====================
async function saveDoctor() {
    const data = {
        fullName: document.getElementById('docFullName').value.trim(),
        username: document.getElementById('docUsername').value.trim(),
        password: document.getElementById('docPassword').value.trim(),
        specialty: document.getElementById('docSpecialty').value.trim(),
        phone: document.getElementById('docPhone').value.trim(),
        email: document.getElementById('docEmail').value.trim(),
        cabinet: document.getElementById('docCabinet').value.trim()
    };

    if (!data.fullName || !data.username || !data.password) {
        alert('Аты-жөнү, логин жана купуя сөз милдеттүү!');
        return;
    }

    try {
        const result = await apiRequest('/api/admin/doctors', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        if (result.success) {
            alert('✅ Врач ийгиликтүү кошулду!');
            document.getElementById('addDoctorForm').reset();
            const modal = bootstrap.Modal.getInstance(document.getElementById('addDoctorModal'));
            modal.hide();
            loadDoctors();
            loadStats();
        } else {
            alert('❌ ' + (result.error || 'Ката кетти'));
        }
    } catch (error) {
        console.error('Save doctor error:', error);
        alert('❌ Сервер менен байланыш жок!');
    }
}

// ==================== ВРАЧТЫ ӨЧҮРҮҮ ====================
async function deleteDoctor(id) {
    if (!confirm('Бул врачты өчүрүү керекпи?')) return;

    try {
        const result = await apiRequest(`/api/admin/doctors/${id}`, {
            method: 'DELETE'
        });

        if (result.success) {
            alert('✅ Врач өчүрүлдү');
            loadDoctors();
            loadStats();
        } else {
            alert('❌ ' + (result.error || 'Ката кетти'));
        }
    } catch (error) {
        console.error('Delete doctor error:', error);
        alert('❌ Сервер менен байланыш жок!');
    }
}

// ==================== АУДИТОРИЯ ====================
async function loadAudit() {
    try {
        const data = await apiRequest('/api/audit');
        
        if (data.success) {
            const tbody = document.getElementById('auditTable');
            if (data.logs && data.logs.length > 0) {
                tbody.innerHTML = data.logs.map(log => `
                    <tr>
                        <td>${new Date(log.createdAt).toLocaleString('ky-KG')}</td>
                        <td>${log.userId || 'Система'}</td>
                        <td><span class="badge bg-secondary">${log.action}</span></td>
                        <td>${log.details}</td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Load audit error:', error);
    }
}

// ==================== РЕЗЕРВ ====================
async function createBackup() {
    const resultDiv = document.getElementById('backupResult');
    resultDiv.innerHTML = '<div class="text-primary">⏳ Резерв алынууда...</div>';

    try {
        const data = await apiRequest('/api/backup', {
            method: 'POST'
        });

        if (data.success) {
            const sizeMB = (data.size / 1024 / 1024).toFixed(2);
            resultDiv.innerHTML = `
                <div class="alert alert-success">
                    ✅ Резерв ийгиликтүү алынды! (${sizeMB} MB)
                </div>
            `;
        } else {
            resultDiv.innerHTML = `
                <div class="alert alert-danger">❌ ${data.error || 'Ката кетти'}</div>
            `;
        }
    } catch (error) {
        resultDiv.innerHTML = `
            <div class="alert alert-danger">❌ Сервер менен байланыш жок!</div>
        `;
    }
}

// ==================== ТАБ БАШКАРУУ ====================
document.querySelectorAll('[data-tab]').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        const tab = this.dataset.tab;
        
        if (tab === 'logout') {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login.html';
            return;
        }

        // Активдүү табды өзгөртүү
        document.querySelectorAll('[data-tab]').forEach(l => l.classList.remove('active'));
        this.classList.add('active');

        // Бардык табдарды жашыруу
        document.querySelectorAll('[id^="tab-"]').forEach(el => el.style.display = 'none');

        // Тандалган табды көрсөтүү
        const tabElement = document.getElementById(`tab-${tab}`);
        if (tabElement) {
            tabElement.style.display = 'block';
        }

        // Барактын аталышын өзгөртүү
        const titles = {
            dashboard: 'Башкы бет',
            doctors: 'Врачтар',
            audit: 'Аудитория',
            backup: 'Резерв'
        };
        document.getElementById('pageTitle').textContent = titles[tab] || tab;

        // Тандалган табдын маалыматын жүктөө
        if (tab === 'doctors') loadDoctors();
        if (tab === 'audit') loadAudit();
        if (tab === 'dashboard') loadStats();

        currentTab = tab;
    });
});

// ==================== БАШТАПКЫ ЖҮКТӨӨ ====================
document.addEventListener('DOMContentLoaded', function() {
    const token = checkAuth();
    if (token) {
        loadStats();
        loadDoctors();
    }
});