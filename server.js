const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'patients.json');
const BACKUP_DIR = path.join(__dirname, 'backup');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

async function ensureDataFile() {
    try {
        await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
        await fs.access(DATA_FILE);
    } catch {
        await fs.writeFile(DATA_FILE, JSON.stringify({ patients: [] }, null, 2));
    }
}

async function readData() {
    await ensureDataFile();
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(raw);
}

async function writeData(data) {
    await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// ===== AI ANALYSIS =====

function analyzeBP(sys, dia) {
    if (sys >= 180 || dia >= 120) {
        return {
            status: "danger",
            message: "🚨 Өтө кооптуу басым! Дароо врачка кайрылыңыз."
        };
    }

    if (sys >= 140 || dia >= 90) {
        return {
            status: "warning",
            message: "⚠️ Басым жогорулап жатат. Врачка кайрылыңыз."
        };
    }

    if (sys <= 90 || dia <= 60) {
        return {
            status: "warning",
            message: "⚠️ Басым төмөндөп жатат. Врачка кайрылыңыз."
        };
    }

    return {
        status: "normal",
        message: "✅ Басым нормада."
    };
}

// ===== AI ADVICE =====

function getAIAdvice(status, systolic, diastolic, pulse, history) {
    let advice = {
        immediate: '',
        lifestyle: '',
        emergency: '',
        actions: []
    };

    if (status === "danger") {
        advice.emergency = "🚨 ШШЭС ТЕЛЕФОНУ: 112\nДароо тез жардам чакырыңыз!";
        advice.immediate = "Дароо врачка кайрылыңыз! Өзүңүздүн басымыңызды түшүрүүгө аракет кылбаңыз.";
        advice.actions = [
            "Тез жардам чакырыңыз (112)",
            "Пациентти жаткырып, башын көтөрүңүз",
            "Тыныгууну камсыз кылыңыз",
            "Эч кандай дары бербеңиз!"
        ];
        advice.lifestyle = "Кыймылдабаңыз, толук тынчтык сактаңыз.";
    } else if (status === "warning") {
        if (systolic >= 140 || diastolic >= 90) {
            advice.immediate = "Басымыңыз жогорулап жатат. Төмөнкү чараларды көрүңүз:";
            advice.actions = [
                "Дем алуу көнүгүүлөрүн жасаңыз",
                "Стресстен алыс болуңуз",
                "Дарыгерге кайрылыңыз",
                "Басымыңызды күнүнө 2 жолу текшериңиз"
            ];
            advice.lifestyle = "🥗 Диетаңызды тузсуз кармаңыз\n🚶 Ар күнү 30 мүнөт басыңыз\n💧 Көп суу ичиңиз (1.5-2л)\n😴 7-8 саат уктаңыз";
        } else if (systolic <= 90 || diastolic <= 60) {
            advice.immediate = "Басымыңыз төмөндөп жатат. Төмөнкү чараларды көрүңүз:";
            advice.actions = [
                "Кофе же чай ичиңиз",
                "Жатып алыңыз",
                "Аяк-буттарыңызды көтөрүп коюңуз",
                "Шекерленген нерсе жеңиз"
            ];
            advice.lifestyle = "🍎 Күнүнө 5 жолу тамактаныңыз\n💧 Көп суу ичиңиз\n😴 Режимиңизди сактаңыз";
        }
    } else {
        advice.immediate = "Басымыңыз нормада. Саламаттыгыңызды сактаңыз!";
        advice.lifestyle = "✅ Басымыңызды көзөмөлдөп туруңуз\n🥗 Туура тамактаныңыз\n🚶 Активдүү болуңуз";
        advice.actions = ["Басымыңызды күнүнө 1 жолу текшериңиз"];
    }

    if (pulse && (pulse > 100 || pulse < 60)) {
        advice.actions.push(pulse > 100 ? 
            "💓 Жүрөк согушу тездеп кеткен, дарыгерге кайрылыңыз" :
            "💓 Жүрөк согушу жайлап калган, текшерилиңиз"
        );
    }

    return advice;
}

// ===== NOTIFICATION SYSTEM =====

const notificationCache = new Map();

// SMS.RU (Кыргызстан үчүн)
// 1. https://sms.ru сайтында катталыңыз
// 2. API ID алыңыз
const SMS_API_ID = 'YOUR_SMS_API_ID'; // Өзүңүздүн API ID'ни коюңуз

async function sendSMS(phone, message) {
    try {
        // Кыргызстан номерлери үчүн (+996)
        let cleanPhone = phone.replace(/[^0-9+]/g, '');
        
        if (!cleanPhone.startsWith('+')) {
            if (cleanPhone.startsWith('996')) {
                cleanPhone = '+' + cleanPhone;
            } else if (cleanPhone.startsWith('0')) {
                cleanPhone = '+996' + cleanPhone.substring(1);
            } else {
                cleanPhone = '+996' + cleanPhone;
            }
        }
        
        const url = 'https://sms.ru/sms/send';
        const params = new URLSearchParams({
            api_id: SMS_API_ID,
            to: cleanPhone,
            msg: message,
            json: 1
        });

        const response = await fetch(`${url}?${params}`);
        const data = await response.json();
        
        if (data.status === 'OK') {
            console.log(`✅ SMS жөнөтүлдү: ${cleanPhone}`);
            return { success: true };
        } else {
            console.error('SMS ката:', data);
            return { success: false, error: data.status_text };
        }
    } catch (error) {
        console.error('SMS жөнөтүүдө ката:', error);
        return { success: false, error: error.message };
    }
}

async function sendSMSToPatient(phone, patientName, systolic, diastolic, status) {
    const statusText = status === 'danger' ? 'КООПТУУ!' : 
                      status === 'warning' ? 'ЭСКЕРТҮҮ' : 'НОРМА';
    
    let message = `Саламаттык: ${patientName}\n`;
    message += `Басым: ${systolic}/${diastolic}\n`;
    message += `Статус: ${statusText}`;
    
    if (status === 'danger') {
        message += `\n\n🚨 ДАРОО ВРАЧКА КАЙРЫЛЫҢЫЗ!\nТез жардам: 112`;
    } else if (status === 'warning') {
        message += `\n\n⚠️ Врачка кайрылыңыз\nКеңеш: дем алуу, тынчтык`;
    } else {
        message += `\n\n✅ Басым нормада\nСаламаттыгыңызды сактаңыз`;
    }
    
    if (message.length > 160) {
        message = message.substring(0, 157) + '...';
    }
    
    return await sendSMS(phone, message);
}

async function sendTelegramNotification(patientName, status, systolic, diastolic, advice) {
    try {
        const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN';
        const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID';
        
        let message = `🏥 **Саламаттык билдирүү**\n\n`;
        message += `👤 Пациент: ${patientName}\n`;
        message += `🩸 Басым: ${systolic}/${diastolic}\n`;
        message += `📊 Статус: ${status === 'danger' ? '🚨 КООПТУУ!' : status === 'warning' ? '⚠️ ЭСКЕРТҮҮ' : '✅ Норма'}\n\n`;
        message += `📋 Кеңеш:\n${advice.immediate}\n\n`;
        
        if (advice.actions && advice.actions.length > 0) {
            message += `🔹 Кылуу керек:\n${advice.actions.map(a => `• ${a}`).join('\n')}\n\n`;
        }
        
        if (advice.lifestyle) {
            message += `💡 Сунуштар:\n${advice.lifestyle}\n\n`;
        }
        
        if (advice.emergency) {
            message += `🆘 ${advice.emergency}\n\n`;
        }
        
        message += `📅 Убакыт: ${new Date().toLocaleString('ky-KG')}`;

        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const response = await fetch(telegramUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TELEGRAM_CHAT_ID,
                text: message,
                parse_mode: 'Markdown'
            })
        });

        const result = await response.json();
        return result.ok;
    } catch (error) {
        console.error('Telegram ката:', error);
        return false;
    }
}

async function checkAndNotify(patient, record) {
    const status = record.ai_status;
    if (status === 'normal') return null;

    const patientId = patient.inn;
    const now = Date.now();
    const lastNotify = notificationCache.get(patientId) || 0;
    const oneHour = 60 * 60 * 1000;

    if (now - lastNotify < oneHour) {
        console.log(`⏳ ${patient.fullName} үчүн 1 саат болгон жок`);
        return null;
    }

    const advice = getAIAdvice(status, record.systolic, record.diastolic, record.pulse, patient.history);

    // SMS жөнөтүү (эгер телефон бар болсо)
    let smsSent = false;
    if (patient.phone && SMS_API_ID !== 'YOUR_SMS_API_ID') {
        const result = await sendSMSToPatient(
            patient.phone,
            patient.fullName,
            record.systolic,
            record.diastolic,
            status
        );
        smsSent = result.success;
    }

    // Telegram жөнөтүү
    const telegramSent = await sendTelegramNotification(
        patient.fullName,
        status,
        record.systolic,
        record.diastolic,
        advice
    );

    if (smsSent || telegramSent) {
        notificationCache.set(patientId, now);
        console.log(`✅ Билдирүү сакталды: ${patient.fullName}`);
    }

    return advice;
}

// ===== STATS =====

app.get('/api/stats', async (req, res) => {
    try {
        const data = await readData();
        let warning = 0;
        let danger = 0;
        let normal = 0;

        data.patients.forEach(p => {
            if (p.lastBP) {
                if (p.lastBP.status === 'danger') danger++;
                else if (p.lastBP.status === 'warning') warning++;
                else normal++;
            }
        });

        res.json({
            success: true,
            stats: {
                total_patients: data.patients.length,
                warning_count: warning,
                critical_count: danger,
                normal_count: normal
            }
        });

    } catch (e) {
        console.error('Stats error:', e);
        res.status(500).json({ 
            success: false,
            error: "Stats error" 
        });
    }
});

// ===== SEARCH PATIENT =====

app.get('/api/patients/search/:inn', async (req, res) => {
    try {
        const data = await readData();
        const patient = data.patients.find(p => p.inn === req.params.inn);

        if (!patient) {
            return res.json({ 
                success: false,
                message: "Пациент табылган жок"
            });
        }

        res.json({
            success: true,
            patient
        });
    } catch (e) {
        console.error('Search error:', e);
        res.status(500).json({
            success: false,
            error: "Издөөдө ката кетти"
        });
    }
});

// ===== GENERAL SEARCH =====

app.get('/api/patients', async (req, res) => {
    try {
        const data = await readData();
        const search = req.query.search || '';

        if (!search.trim()) {
            return res.json({
                success: true,
                patients: data.patients,
                pagination: {
                    total: data.patients.length,
                    page: 1,
                    limit: data.patients.length
                }
            });
        }

        const found = data.patients.filter(p => {
            const fullName = p.fullName || p.full_name || '';
            const inn = p.inn || '';
            const searchLower = search.toLowerCase();
            return fullName.toLowerCase().includes(searchLower) || 
                   inn.includes(search);
        });

        res.json({
            success: true,
            patients: found,
            pagination: {
                total: found.length,
                page: 1,
                limit: found.length
            }
        });
    } catch (e) {
        console.error('Search error:', e);
        res.status(500).json({
            success: false,
            error: "Издөөдө ката кетти"
        });
    }
});

// ===== NEW PATIENT =====

app.post('/api/patients', async (req, res) => {
    try {
        const { inn, fullName, birthDate, phone, address } = req.body;
        
        if (!inn || !fullName) {
            return res.json({
                success: false,
                error: "ИНН жана аты-жөнү милдеттүү"
            });
        }

        const data = await readData();

        const exists = data.patients.find(p => p.inn === inn);

        if (exists) {
            return res.json({
                success: false,
                error: "Мындай ИНН менен пациент бар"
            });
        }

        const patient = {
            inn,
            fullName: fullName,
            full_name: fullName,
            birthDate: birthDate || '',
            birth_date: birthDate || '',
            phone: phone || '',
            address: address || '',
            history: [],
            diseases: [],
            appointments: [],
            lastBP: null
        };

        data.patients.push(patient);
        await writeData(data);

        res.json({
            success: true,
            message: "Пациент ийгиликтүү кошулду",
            patient: patient
        });

    } catch (e) {
        console.error('Save patient error:', e);
        res.status(500).json({
            success: false,
            error: "Сактоодо ката кетти"
        });
    }
});

// ===== ADD BLOOD PRESSURE =====

app.post('/api/blood-pressure', async (req, res) => {
    try {
        const { inn, systolic, diastolic, pulse, notes } = req.body;
        
        if (!inn || !systolic || !diastolic) {
            return res.json({
                success: false,
                error: "ИНН, жогорку жана төмөнкү басым милдеттүү"
            });
        }

        const data = await readData();

        const patientIndex = data.patients.findIndex(p => p.inn === inn);

        if (patientIndex === -1) {
            return res.json({
                success: false,
                error: "Пациент табылган жок"
            });
        }

        const ai = analyzeBP(systolic, diastolic);

        const record = {
            check_date: new Date().toISOString(),
            systolic: Number(systolic),
            diastolic: Number(diastolic),
            pulse: pulse ? Number(pulse) : 0,
            notes: notes || '',
            ai_status: ai.status
        };

        const patient = data.patients[patientIndex];

        if (!patient.history) {
            patient.history = [];
        }

        patient.history.push(record);

        patient.lastBP = {
            systolic: Number(systolic),
            diastolic: Number(diastolic),
            pulse: pulse ? Number(pulse) : 0,
            date: new Date().toISOString(),
            status: ai.status
        };

        await writeData(data);

        const advice = await checkAndNotify(patient, record);

        let trend = null;
        if (patient.history.length >= 2) {
            const sorted = [...patient.history].sort((a, b) => 
                new Date(a.check_date) - new Date(b.check_date)
            );
            const last = sorted[sorted.length - 1];
            const prev = sorted[sorted.length - 2];
            
            const diffSystolic = last.systolic - prev.systolic;
            const diffDiastolic = last.diastolic - prev.diastolic;
            
            let trendMessage = '';
            if (Math.abs(diffSystolic) < 5 && Math.abs(diffDiastolic) < 5) {
                trendMessage = '➡️ Басым туруктуу';
            } else if (diffSystolic > 5 || diffDiastolic > 5) {
                trendMessage = '📈 Басым көтөрүлүп жатат!';
            } else if (diffSystolic < -5 || diffDiastolic < -5) {
                trendMessage = '📉 Басым түшүп жатат!';
            }
            
            if (trendMessage) {
                trend = {
                    message: trendMessage,
                    diffSystolic: diffSystolic,
                    diffDiastolic: diffDiastolic
                };
            }
        }

        res.json({
            success: true,
            message: "Басым ийгиликтүү кошулду",
            ai: ai,
            trend: trend,
            advice: advice
        });

    } catch (e) {
        console.error('BP error:', e);
        res.status(500).json({
            success: false,
            error: "Басым кошууда ката кетти"
        });
    }
});

// ===== DISEASES (ООРУЛАР) =====

// Оору кошуу
app.post('/api/diseases', async (req, res) => {
    try {
        const { inn, name, date, severity, symptoms, treatment, notes } = req.body;
        
        if (!inn || !name) {
            return res.json({
                success: false,
                error: "ИНН жана оорунун аты милдеттүү"
            });
        }

        const data = await readData();
        const patientIndex = data.patients.findIndex(p => p.inn === inn);

        if (patientIndex === -1) {
            return res.json({
                success: false,
                error: "Пациент табылган жок"
            });
        }

        const disease = {
            id: Date.now().toString(),
            name: name,
            date: date || new Date().toISOString().split('T')[0],
            severity: severity || 'medium',
            symptoms: symptoms || '',
            treatment: treatment || '',
            notes: notes || '',
            created_at: new Date().toISOString()
        };

        if (!data.patients[patientIndex].diseases) {
            data.patients[patientIndex].diseases = [];
        }

        data.patients[patientIndex].diseases.push(disease);
        await writeData(data);

        res.json({
            success: true,
            message: "Оору ийгиликтүү кошулду",
            disease: disease
        });

    } catch (e) {
        console.error('Add disease error:', e);
        res.status(500).json({
            success: false,
            error: "Оору кошууда ката кетти"
        });
    }
});

// Ооруларды алуу
app.get('/api/diseases/:inn', async (req, res) => {
    try {
        const data = await readData();
        const patient = data.patients.find(p => p.inn === req.params.inn);

        if (!patient) {
            return res.json({
                success: false,
                error: "Пациент табылган жок"
            });
        }

        res.json({
            success: true,
            diseases: patient.diseases || []
        });

    } catch (e) {
        console.error('Get diseases error:', e);
        res.status(500).json({
            success: false,
            error: "Ооруларды алууда ката кетти"
        });
    }
});

// Ооруну өчүрүү
app.delete('/api/diseases/:inn/:id', async (req, res) => {
    try {
        const { inn, id } = req.params;
        const data = await readData();
        const patientIndex = data.patients.findIndex(p => p.inn === inn);

        if (patientIndex === -1) {
            return res.json({
                success: false,
                error: "Пациент табылган жок"
            });
        }

        if (!data.patients[patientIndex].diseases) {
            return res.json({
                success: false,
                error: "Оорулар жок"
            });
        }

        data.patients[patientIndex].diseases = data.patients[patientIndex].diseases.filter(d => d.id !== id);
        await writeData(data);

        res.json({
            success: true,
            message: "Оору өчүрүлдү"
        });

    } catch (e) {
        console.error('Delete disease error:', e);
        res.status(500).json({
            success: false,
            error: "Оору өчүрүүдө ката кетти"
        });
    }
});

// ===== APPOINTMENTS (КАБЫЛ АЛУУЛАР) =====

// Кабыл алуу кошуу
app.post('/api/appointments', async (req, res) => {
    try {
        const { inn, date, doctor, reason, diagnosis, notes } = req.body;
        
        if (!inn || !date) {
            return res.json({
                success: false,
                error: "ИНН жана күнү милдеттүү"
            });
        }

        const data = await readData();
        const patientIndex = data.patients.findIndex(p => p.inn === inn);

        if (patientIndex === -1) {
            return res.json({
                success: false,
                error: "Пациент табылган жок"
            });
        }

        const appointment = {
            id: Date.now().toString(),
            date: date,
            doctor: doctor || '',
            reason: reason || '',
            diagnosis: diagnosis || '',
            notes: notes || '',
            created_at: new Date().toISOString()
        };

        if (!data.patients[patientIndex].appointments) {
            data.patients[patientIndex].appointments = [];
        }

        data.patients[patientIndex].appointments.push(appointment);
        await writeData(data);

        res.json({
            success: true,
            message: "Кабыл алуу ийгиликтүү кошулду",
            appointment: appointment
        });

    } catch (e) {
        console.error('Add appointment error:', e);
        res.status(500).json({
            success: false,
            error: "Кабыл алуу кошууда ката кетти"
        });
    }
});

// Кабыл алууларды алуу
app.get('/api/appointments/:inn', async (req, res) => {
    try {
        const data = await readData();
        const patient = data.patients.find(p => p.inn === req.params.inn);

        if (!patient) {
            return res.json({
                success: false,
                error: "Пациент табылган жок"
            });
        }

        // Дата боюнча сорттоо (эң жаңысы биринчи)
        const appointments = (patient.appointments || []).sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );

        res.json({
            success: true,
            appointments: appointments
        });

    } catch (e) {
        console.error('Get appointments error:', e);
        res.status(500).json({
            success: false,
            error: "Кабыл алууларды алууда ката кетти"
        });
    }
});

// Кабыл алууну өчүрүү
app.delete('/api/appointments/:inn/:id', async (req, res) => {
    try {
        const { inn, id } = req.params;
        const data = await readData();
        const patientIndex = data.patients.findIndex(p => p.inn === inn);

        if (patientIndex === -1) {
            return res.json({
                success: false,
                error: "Пациент табылган жок"
            });
        }

        if (!data.patients[patientIndex].appointments) {
            return res.json({
                success: false,
                error: "Кабыл алуулар жок"
            });
        }

        data.patients[patientIndex].appointments = data.patients[patientIndex].appointments.filter(a => a.id !== id);
        await writeData(data);

        res.json({
            success: true,
            message: "Кабыл алуу өчүрүлдү"
        });

    } catch (e) {
        console.error('Delete appointment error:', e);
        res.status(500).json({
            success: false,
            error: "Кабыл алуу өчүрүүдө ката кетти"
        });
    }
});

// ===== BACKUP =====

app.post('/api/backup', async (req, res) => {
    try {
        await fs.mkdir(BACKUP_DIR, { recursive: true });

        const backupFile = path.join(
            BACKUP_DIR,
            `backup-${Date.now()}.json`
        );

        const data = await readData();

        await fs.writeFile(
            backupFile,
            JSON.stringify(data, null, 2)
        );

        const stat = await fs.stat(backupFile);

        res.json({
            success: true,
            size: stat.size,
            message: "Резервдик көчүрмө алынды"
        });

    } catch (e) {
        console.error('Backup error:', e);
        res.status(500).json({
            success: false,
            error: "Резервдөөдө ката кетти"
        });
    }
});

// ===== ERROR HANDLING MIDDLEWARE =====

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: "Серверде ката кетти"
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Сервер иштеп жатат: http://localhost:${PORT}`);
});