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
                const name = currentPatient.full_name || currentPatient.fullName || 'Пациент';
                showMessage(`Пациент табылды: ${name}`, 'success');
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
    // Бул жерде patient.full_name же patient.fullName бар экенин текшеребиз
    const fullName = patient.full_name || patient.fullName || 'Аты-жөнү жок';
    const birthDate = patient.birth_date || patient.birthDate || 'Көрсөтүлө элек';
    const phone = patient.phone || 'Көрсөтүлө элек';
    const address = patient.address || 'Көрсөтүлө элек';
    const inn = patient.inn || 'ИНН жок';
    
    document.getElementById('patientName').textContent = fullName;
    document.getElementById('patientBirth').textContent = birthDate;
    document.getElementById('patientPhone').textContent = phone;
    document.getElementById('patientAddress').textContent = address;
    document.getElementById('patientInn').textContent = inn;

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
    document.getElementById('aiAdviceContainer').innerHTML = '';
    
    // Ооруларды жүктөө
    loadDiseases();
    
    // Кабыл алууларды жүктөө
    loadAppointments();
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

// ==================== AI КЕҢЕШИН КӨРСӨТҮҮ ====================

function displayAIAdvice(advice) {
    if (!advice) return;
    
    let container = document.getElementById('aiAdviceContainer');
    if (!container) {
        const aiAnalysis = document.getElementById('aiAnalysis');
        if (aiAnalysis) {
            container = document.createElement('div');
            container.id = 'aiAdviceContainer';
            container.className = 'mt-3';
            aiAnalysis.after(container);
        } else {
            return;
        }
    }
    
    let html = '<div class="ai-advice-box">';
    html += '<h6>🤖 AI кеңеши:</h6>';
    
    if (advice.immediate) {
        html += `<p><strong>📋 Эмне кылуу керек:</strong><br>${advice.immediate}</p>`;
    }
    
    if (advice.actions && advice.actions.length > 0) {
        html += '<ul>';
        advice.actions.forEach(action => {
            html += `<li>${action}</li>`;
        });
        html += '</ul>';
    }
    
    if (advice.lifestyle) {
        html += `<p><strong>💡 Сунуштар:</strong><br>${advice.lifestyle.replace(/\n/g, '<br>')}</p>`;
    }
    
    if (advice.emergency) {
        html += `<p class="emergency">🆘 ${advice.emergency.replace(/\n/g, '<br>')}</p>`;
    }
    
    html += '</div>';
    container.innerHTML = html;
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
            let aiHtml = `
                <div class="ai-analysis-box ${ai.status}">
                    <strong>🤖 AI анализи:</strong> ${ai.message}
                    ${data.trend ? `<br><small>📊 ${data.trend.message}</small>` : ''}
                </div>
            `;
            
            // AI кеңешин көрсөтүү
            if (data.advice) {
                displayAIAdvice(data.advice);
            }
            
            document.getElementById('aiAnalysis').innerHTML = aiHtml;

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

// ==================== ООРУЛАР ====================

async function addDisease() {
    if (!currentPatient) {
        showMessage('Алгач пациентти табыңыз!', 'warning');
        return;
    }

    const name = document.getElementById('diseaseName').value.trim();
    const date = document.getElementById('diseaseDate').value;
    const severity = document.getElementById('diseaseSeverity').value;
    const symptoms = document.getElementById('diseaseSymptoms').value.trim();
    const treatment = document.getElementById('diseaseTreatment').value.trim();
    const notes = document.getElementById('diseaseNotes').value.trim();

    if (!name) {
        showMessage('Оорунун атын жазыңыз!', 'warning');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`${API_URL}/api/diseases`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inn: currentPatient.inn,
                name,
                date,
                severity,
                symptoms,
                treatment,
                notes
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('✅ Оору ийгиликтүү кошулду!', 'success');
            
            document.getElementById('diseaseName').value = '';
            document.getElementById('diseaseDate').value = '';
            document.getElementById('diseaseSymptoms').value = '';
            document.getElementById('diseaseTreatment').value = '';
            document.getElementById('diseaseNotes').value = '';

            await loadDiseases();
        } else {
            showMessage(data.error || 'Оору кошууда ката!', 'danger');
        }
    } catch (error) {
        console.error('Ката:', error);
        showMessage('Сервер менен байланыш жок!', 'danger');
    }

    showLoading(false);
}

async function loadDiseases() {
    if (!currentPatient) return;

    try {
        const response = await fetch(`${API_URL}/api/diseases/${currentPatient.inn}`);
        const data = await response.json();

        const container = document.getElementById('diseaseList');

        if (!data.success || !data.diseases || data.diseases.length === 0) {
            container.innerHTML = '<p class="text-muted">Оорулар жок</p>';
            return;
        }

        const severityMap = {
            'low': 'Жеңил',
            'medium': 'Орто',
            'high': 'Оор'
        };

        const severityClass = {
            'low': 'severity-low',
            'medium': 'severity-medium',
            'high': 'severity-high'
        };

        container.innerHTML = data.diseases.map(d => `
            <div class="disease-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <strong>${d.name}</strong>
                        <span class="${severityClass[d.severity]}">(${severityMap[d.severity]})</span>
                        <br>
                        <small class="text-muted">
                            📅 ${d.date || 'Көрсөтүлө элек'}
                            ${d.symptoms ? ` | 🤒 ${d.symptoms}` : ''}
                            ${d.treatment ? ` | 💊 ${d.treatment}` : ''}
                        </small>
                        ${d.notes ? `<br><small class="text-muted">📝 ${d.notes}</small>` : ''}
                    </div>
                    <button onclick="deleteDisease('${d.id}')" class="btn btn-sm btn-outline-danger">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Ооруларды жүктөөдө ката:', error);
    }
}

async function deleteDisease(id) {
    if (!confirm('Бул ооруну өчүрүү керекпи?')) return;

    try {
        const response = await fetch(`${API_URL}/api/diseases/${currentPatient.inn}/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showMessage('✅ Оору өчүрүлдү', 'success');
            await loadDiseases();
        } else {
            showMessage(data.error || 'Өчүрүүдө ката!', 'danger');
        }
    } catch (error) {
        console.error('Ката:', error);
        showMessage('Сервер менен байланыш жок!', 'danger');
    }
}

// ==================== КАБЫЛ АЛУУЛАР ====================

async function addAppointment() {
    if (!currentPatient) {
        showMessage('Алгач пациентти табыңыз!', 'warning');
        return;
    }

    const date = document.getElementById('appointmentDate').value;
    const doctor = document.getElementById('appointmentDoctor').value.trim();
    const reason = document.getElementById('appointmentReason').value.trim();
    const diagnosis = document.getElementById('appointmentDiagnosis').value.trim();
    const notes = document.getElementById('appointmentNotes').value.trim();

    if (!date) {
        showMessage('Кабыл алуу күнүн тандаңыз!', 'warning');
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`${API_URL}/api/appointments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                inn: currentPatient.inn,
                date,
                doctor,
                reason,
                diagnosis,
                notes
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('✅ Кабыл алуу ийгиликтүү кошулду!', 'success');
            
            document.getElementById('appointmentDate').value = '';
            document.getElementById('appointmentDoctor').value = '';
            document.getElementById('appointmentReason').value = '';
            document.getElementById('appointmentDiagnosis').value = '';
            document.getElementById('appointmentNotes').value = '';

            await loadAppointments();
        } else {
            showMessage(data.error || 'Кабыл алуу кошууда ката!', 'danger');
        }
    } catch (error) {
        console.error('Ката:', error);
        showMessage('Сервер менен байланыш жок!', 'danger');
    }

    showLoading(false);
}

async function loadAppointments() {
    if (!currentPatient) return;

    try {
        const response = await fetch(`${API_URL}/api/appointments/${currentPatient.inn}`);
        const data = await response.json();

        const container = document.getElementById('appointmentList');

        if (!data.success || !data.appointments || data.appointments.length === 0) {
            container.innerHTML = '<p class="text-muted">Кабыл алуулар жок</p>';
            return;
        }

        container.innerHTML = data.appointments.map(a => `
            <div class="appointment-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <span class="date">📅 ${new Date(a.date).toLocaleString('ky-KG')}</span>
                        ${a.doctor ? ` | 👨‍⚕️ ${a.doctor}` : ''}
                        <br>
                        ${a.reason ? `<strong>Себеби:</strong> ${a.reason}` : ''}
                        ${a.diagnosis ? `<br><strong>Диагноз:</strong> ${a.diagnosis}` : ''}
                        ${a.notes ? `<br><small class="text-muted">📝 ${a.notes}</small>` : ''}
                    </div>
                    <button onclick="deleteAppointment('${a.id}')" class="btn btn-sm btn-outline-danger">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Кабыл алууларды жүктөөдө ката:', error);
    }
}

async function deleteAppointment(id) {
    if (!confirm('Бул кабыл алууну өчүрүү керекпи?')) return;

    try {
        const response = await fetch(`${API_URL}/api/appointments/${currentPatient.inn}/${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.success) {
            showMessage('✅ Кабыл алуу өчүрүлдү', 'success');
            await loadAppointments();
        } else {
            showMessage(data.error || 'Өчүрүүдө ката!', 'danger');
        }
    } catch (error) {
        console.error('Ката:', error);
        showMessage('Сервер менен байланыш жок!', 'danger');
    }
}

// ==================== ЭКСПОРТ ====================

async function exportAll() {
    if (!currentPatient) {
        showMessage('Алгач пациентти табыңыз!', 'warning');
        return;
    }

    try {
        const data = {
            patient: currentPatient,
            exported_at: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `patient_${currentPatient.inn}_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showMessage('✅ Экспорт ийгиликтүү!', 'success');
    } catch (error) {
        console.error('Экспорттоо ката:', error);
        showMessage('Экспорттоодо ката!', 'danger');
    }
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
        if (this.value.length <= 14) {
            this.value = this.value.replace(/[^0-9]/g, '');
        }
    });
    
    document.getElementById('newInn').addEventListener('input', function(e) {
        this.value = this.value.replace(/\D/g, '').slice(0, 14);
    });

    // Оору формасындагы Enter
    document.getElementById('diseaseName').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addDisease();
        }
    });

    // Кабыл алуу формасындагы Enter
    document.getElementById('appointmentDate').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            addAppointment();
        }
    });

    // Баштапкы жүктөө
    loadStats();
});