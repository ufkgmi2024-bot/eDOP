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

    // Кооптуу учур
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
    } 
    // Эскертүү учур
    else if (status === "warning") {
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
    } 
    // Норма
    else {
        advice.immediate = "Басымыңыз нормада. Саламаттыгыңызды сактаңыз!";
        advice.lifestyle = "✅ Басымыңызды көзөмөлдөп туруңуз\n🥗 Туура тамактаныңыз\n🚶 Активдүү болуңуз";
        advice.actions = ["Басымыңызды күнүнө 1 жолу текшериңиз"];
    }

    // Pulse боюнча кошумча кеңеш
    if (pulse && (pulse > 100 || pulse < 60)) {
        advice.actions.push(pulse > 100 ? 
            "💓 Жүрөк согушу тездеп кеткен, дарыгерге кайрылыңыз" :
            "💓 Жүрөк согушу жайлап калган, текшерилиңиз"
        );
    }

    return advice;
}

// ===== NOTIFICATION SYSTEM =====

// Түзүлгөн билдирүүлөрдү сактоо (ар бир пациент үчүн акыркы билдирүү)
const notificationCache = new Map();

// Telegram билдирүү функциясы
async function sendTelegramNotification(patientName, status, systolic, diastolic, advice) {
    try {
        // Telegram бот түзүңүз: @BotFather
        // TOKEN жана CHAT_ID алыңыз: @userinfobot
        const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN'; // Өзүңүздүн токениңизди коюңуз
        const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID'; // Өзүңүздүн ID'ңизди коюңуз
        
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

        // Telegram аркылуу жөнөтүү
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
        
        if (result.ok) {
            console.log(`✅ Telegram билдирүү жөнөтүлдү: ${patientName}`);
            return true;
        } else {
            console.error('Telegram ката:', result);
            return false;
        }

    } catch (error) {
        console.error('Telegram билдирүү жөнөтүүдө ката:', error);
        return false;
    }
}

// SMS билдирүү функциясы (кошумча)
async function sendSMSNotification(phone, patientName, status, systolic, diastolic) {
    try {
        // Бул жерге SMS сервисиңиздин API'сын кошуңуз
        // Мисалы: SMS.ru, Twilio, ж.б.
        
        console.log(`📱 SMS жөнөтүлүүдө: ${phone}`);
        console.log(`📝 Текст: ${patientName} - Басым ${systolic}/${diastolic} - ${status}`);
        
        // SMS сервиси жок болсо, консолго гана чыгарабыз
        return true;
        
        /*
        // SMS.ru мисалы:
        const response = await fetch('https://sms.ru/sms/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                api_id: 'YOUR_SMS_API_ID',
                to: phone,
                msg: `Саламаттык: ${patientName}, басым ${systolic}/${diastolic}, ${status === 'danger' ? 'КООПТУУ! Дароо врачка!' : status === 'warning' ? 'ЭСКЕРТҮҮ! Врачка кайрылыңыз!' : 'Норма'}`,
                json: 1
            })
        });
        const data = await response.json();
        return data.status === 'OK';
        */
        
    } catch (error) {
        console.error('SMS жөнөтүүдө ката:', error);
        return false;
    }
}

// Автоматтык билдирүү функциясы
async function checkAndNotify(patient, record) {
    const status = record.ai_status;
    
    // Эгер норма болсо, билдирбейбиз
    if (status === 'normal') return null;

    const patientId = patient.inn;
    const now = Date.now();
    const lastNotify = notificationCache.get(patientId) || 0;
    const oneHour = 60 * 60 * 1000; // 1 саат

    // Эгер акыркы билдирүүдөн 1 саат өтпөсө, кайталабайбыз
    if (now - lastNotify < oneHour) {
        console.log(`⏳ ${patient.fullName} үчүн билдирүү 1 саат болгон жок, өткөрүп жиберилди`);
        return null;
    }

    // AI кеңешин алуу
    const advice = getAIAdvice(
        status, 
        record.systolic, 
        record.diastolic, 
        record.pulse,
        patient.history
    );

    // Telegram билдирүү (ар дайым)
    const telegramSent = await sendTelegramNotification(
        patient.fullName,
        status,
        record.systolic,
        record.diastolic,
        advice
    );

    // Эгер телефон номери бар болсо, SMS жөнөтүү
    let smsSent = false;
    if (patient.phone) {
        smsSent = await sendSMSNotification(
            patient.phone,
            patient.fullName,
            status,
            record.systolic,
            record.diastolic
        );
    }

    if (telegramSent || smsSent) {
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

        // ===== АВТОМАТТЫК БИЛДИРҮҮ =====
        const advice = await checkAndNotify(patient, record);

        // Трендди текшерүү
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