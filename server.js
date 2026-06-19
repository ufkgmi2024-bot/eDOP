const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Static files - бардык статикалык файлдарды көрсөтүү
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, 'public')));

// ==================== ФАЙЛДЫК ОПЕРАЦИЯЛАР ====================

const DATA_DIR = path.join(__dirname, 'data');
const BACKUP_DIR = path.join(__dirname, 'backup');

async function ensureDataDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.mkdir(BACKUP_DIR, { recursive: true });
}

async function readFile(filename) {
    const filePath = path.join(DATA_DIR, filename);
    try {
        await ensureDataDir();
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Эгер файл жок болсо, бош объект кайтарат
        return {};
    }
}

async function writeFile(filename, data) {
    const filePath = path.join(DATA_DIR, filename);
    await ensureDataDir();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}

function generateId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

// Баштапкы маалыматтарды түзүү
async function initializeData() {
    // Users
    let users = await readFile('users.json');
    if (!users.users) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        users = {
            users: [
                {
                    id: 'admin_001',
                    username: 'admin',
                    password: hashedPassword,
                    fullName: 'Система Администратору',
                    role: 'admin',
                    phone: '+996700111111',
                    email: 'admin@clinic.kg',
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    lastLogin: null
                },
                // Демо врач (опционально)
                {
                    id: 'doc_demo_001',
                    username: 'doctor',
                    password: await bcrypt.hash('doctor123', 10),
                    fullName: 'Доктор Демо',
                    role: 'doctor',
                    specialty: 'Терапевт',
                    phone: '+996700222222',
                    email: 'doctor@clinic.kg',
                    cabinet: 'Кабинет №101',
                    isActive: true,
                    createdAt: new Date().toISOString(),
                    lastLogin: null
                }
            ]
        };
        await writeFile('users.json', users);
    }

    // Patients
    let patients = await readFile('patients.json');
    if (!patients.patients) {
        patients = { patients: [] };
        await writeFile('patients.json', patients);
    }

    // Visits
    let visits = await readFile('visits.json');
    if (!visits.visits) {
        visits = { visits: [] };
        await writeFile('visits.json', visits);
    }

    // Audit
    let audit = await readFile('audit.json');
    if (!audit.logs) {
        audit = { logs: [] };
        await writeFile('audit.json', audit);
    }
}

// ==================== ЖАРДАМЧЫ ФУНКЦИЯЛАР ====================

function calculateAverageBP(visits) {
    if (!visits || visits.length === 0) {
        return { systolic: 0, diastolic: 0 };
    }
    const totalSystolic = visits.reduce((sum, v) => sum + (v.systolic || 0), 0);
    const totalDiastolic = visits.reduce((sum, v) => sum + (v.diastolic || 0), 0);
    return {
        systolic: Math.round(totalSystolic / visits.length),
        diastolic: Math.round(totalDiastolic / visits.length)
    };
}

function getAIStatus(systolic, diastolic) {
    if (systolic >= 180 || diastolic >= 120) {
        return {
            riskLevel: 'danger',
            message: '🚨 Өтө кооптуу басым! Дароо врачка кайрылыңыз.'
        };
    }
    if (systolic >= 140 || diastolic >= 90) {
        return {
            riskLevel: 'warning',
            message: '⚠️ Басым жогорулап жатат. Врачка кайрылыңыз.'
        };
    }
    return {
        riskLevel: 'normal',
        message: '✅ Басым нормада. Мыкты!'
    };
}

// ==================== АУТЕНТИФИКАЦИЯ ====================

// JWT текшерүү middleware
function authMiddleware(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Кирүү талап кылынат' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Жараксыз токен' });
    }
}

// Ролду текшерүү middleware
function roleMiddleware(roles) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Уруксат жок' });
        }
        next();
    };
}

// ==================== API РОУТЕРЛЕР ====================

// === АУТЕНТИФИКАЦИЯ ===
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = await readFile('users.json');
        
        const user = users.users?.find(u => u.username === username && u.isActive !== false);
        
        if (!user) {
            return res.status(401).json({ error: 'Колдонуучу табылган жок' });
        }

        const isValid = await bcrypt.compare(password, user.password);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Купуя сөз туура эмес' });
        }

        // Акыркы кирүү убактысын жаңыртуу
        user.lastLogin = new Date().toISOString();
        await writeFile('users.json', users);

        // JWT түзүү
        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        // Аудитория журналы
        const audit = await readFile('audit.json');
        if (!audit.logs) audit.logs = [];
        audit.logs.push({
            id: generateId('log'),
            userId: user.id,
            action: 'login',
            details: `${user.fullName} кирди`,
            ip: req.ip || '127.0.0.1',
            createdAt: new Date().toISOString()
        });
        await writeFile('audit.json', audit);

        // Купуя сөздү жок кылып жөнөтүү
        delete user.password;

        res.json({
            success: true,
            token,
            user
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Сервер катасы' });
    }
});

// === АДМИНИСТРАТОР: Врачтарды башкаруу ===
app.post('/api/admin/doctors', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const { username, password, fullName, specialty, phone, email, cabinet } = req.body;

        if (!username || !password || !fullName) {
            return res.status(400).json({ error: 'Логин, купуя сөз жана аты-жөнү милдеттүү' });
        }

        const users = await readFile('users.json');
        if (!users.users) users.users = [];

        // Уникалдуулукту текшерүү
        if (users.users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Бул логин бар' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newDoctor = {
            id: generateId('doc'),
            username,
            password: hashedPassword,
            fullName,
            role: 'doctor',
            specialty: specialty || 'Жалпы врач',
            phone: phone || '',
            email: email || '',
            cabinet: cabinet || 'Кабинет белгилене элек',
            isActive: true,
            createdAt: new Date().toISOString(),
            lastLogin: null
        };

        users.users.push(newDoctor);
        await writeFile('users.json', users);

        // Аудитория
        const audit = await readFile('audit.json');
        if (!audit.logs) audit.logs = [];
        audit.logs.push({
            id: generateId('log'),
            userId: req.user.id,
            action: 'create_doctor',
            details: `Жаңы врач кошулду: ${fullName} (${username})`,
            ip: req.ip || '127.0.0.1',
            createdAt: new Date().toISOString()
        });
        await writeFile('audit.json', audit);

        delete newDoctor.password;
        res.json({ success: true, doctor: newDoctor });

    } catch (error) {
        console.error('Create doctor error:', error);
        res.status(500).json({ error: 'Врач кошууда ката' });
    }
});

// Админ: Врачтардын тизмесин алуу
app.get('/api/admin/doctors', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const users = await readFile('users.json');
        const doctors = users.users?.filter(u => u.role === 'doctor') || [];
        
        // Ар бир врачтын статистикасын эсептөө
        const visits = await readFile('visits.json');
        const patients = await readFile('patients.json');

        const doctorsWithStats = doctors.map(doc => {
            const docVisits = visits.visits?.filter(v => v.doctorId === doc.id) || [];
            const docPatients = patients.patients?.filter(p => p.createdBy === doc.id) || [];
            
            // Акыркы активдүүлүк
            const lastVisit = docVisits.length > 0 
                ? docVisits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
                : null;

            // Купуя сөздү жок кылуу
            const { password, ...docWithoutPassword } = doc;

            return {
                ...docWithoutPassword,
                stats: {
                    totalVisits: docVisits.length,
                    totalPatients: docPatients.length,
                    lastActivity: lastVisit?.createdAt || doc.lastLogin || 'Активдүү эмес'
                }
            };
        });

        res.json({ success: true, doctors: doctorsWithStats });

    } catch (error) {
        console.error('Get doctors error:', error);
        res.status(500).json({ error: 'Врачтарды алууда ката' });
    }
});

// Админ: Врачты өчүрүү
app.delete('/api/admin/doctors/:id', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const users = await readFile('users.json');
        
        const index = users.users?.findIndex(u => u.id === id && u.role === 'doctor');
        if (index === -1 || index === undefined) {
            return res.status(404).json({ error: 'Врач табылган жок' });
        }

        const deleted = users.users[index];
        users.users.splice(index, 1);
        await writeFile('users.json', users);

        // Аудитория
        const audit = await readFile('audit.json');
        if (!audit.logs) audit.logs = [];
        audit.logs.push({
            id: generateId('log'),
            userId: req.user.id,
            action: 'delete_doctor',
            details: `Врач өчүрүлдү: ${deleted.fullName}`,
            ip: req.ip || '127.0.0.1',
            createdAt: new Date().toISOString()
        });
        await writeFile('audit.json', audit);

        res.json({ success: true, message: 'Врач өчүрүлдү' });

    } catch (error) {
        console.error('Delete doctor error:', error);
        res.status(500).json({ error: 'Врачты өчүрүүдө ката' });
    }
});

// === АДМИН: Жалпы статистика ===
app.get('/api/admin/stats', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const users = await readFile('users.json');
        const patients = await readFile('patients.json');
        const visits = await readFile('visits.json');

        const totalDoctors = users.users?.filter(u => u.role === 'doctor').length || 0;
        const totalPatients = patients.patients?.length || 0;
        const totalVisits = visits.visits?.length || 0;

        // Ар бир врачтын статистикасы
        const doctorStats = users.users
            ?.filter(u => u.role === 'doctor')
            .map(doc => {
                const docVisits = visits.visits?.filter(v => v.doctorId === doc.id) || [];
                const docPatients = patients.patients?.filter(p => p.createdBy === doc.id) || [];
                return {
                    doctorId: doc.id,
                    doctorName: doc.fullName,
                    specialty: doc.specialty,
                    totalVisits: docVisits.length,
                    totalPatients: docPatients.length,
                    lastVisit: docVisits.length > 0 
                        ? docVisits.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]?.createdAt
                        : null
                };
            }) || [];

        // Статистика AI
        const aiStats = visits.visits?.reduce((acc, v) => {
            const key = v.aiRiskLevel || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {}) || {};

        // Күндүк статистика
        const dailyStats = visits.visits?.reduce((acc, v) => {
            const date = new Date(v.createdAt).toLocaleDateString('ky-KG');
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {}) || {};

        res.json({
            success: true,
            stats: {
                totalDoctors,
                totalPatients,
                totalVisits,
                aiStats: {
                    normal: aiStats.normal || 0,
                    warning: aiStats.warning || 0,
                    danger: aiStats.danger || 0
                },
                doctors: doctorStats,
                dailyStats: Object.entries(dailyStats).map(([date, count]) => ({ date, count }))
            }
        });

    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Статистиканы алууда ката' });
    }
});

// === ВРАЧ: Өз кабинети ===
app.get('/api/doctor/patients', authMiddleware, roleMiddleware(['doctor']), async (req, res) => {
    try {
        const doctorId = req.user.id;
        const patients = await readFile('patients.json');
        
        const myPatients = patients.patients?.filter(p => p.createdBy === doctorId) || [];
        
        // Ар бир пациенттин акыркы визитин кошуу
        const visits = await readFile('visits.json');
        const patientsWithVisits = myPatients.map(p => {
            const patientVisits = visits.visits?.filter(v => v.patientId === p.id) || [];
            const lastVisit = patientVisits.length > 0 
                ? patientVisits.sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))[0]
                : null;
            return {
                ...p,
                lastVisit,
                totalVisits: patientVisits.length
            };
        });

        res.json({
            success: true,
            patients: patientsWithVisits,
            total: patientsWithVisits.length
        });

    } catch (error) {
        console.error('Get patients error:', error);
        res.status(500).json({ error: 'Пациенттерди алууда ката' });
    }
});

// Врач: Пациент издөө
app.get('/api/doctor/patients/search', authMiddleware, roleMiddleware(['doctor']), async (req, res) => {
    try {
        const doctorId = req.user.id;
        const { q } = req.query;
        
        if (!q) {
            return res.json({ success: true, patients: [], total: 0 });
        }

        const patients = await readFile('patients.json');
        const myPatients = patients.patients?.filter(p => 
            p.createdBy === doctorId && 
            (p.fullName?.toLowerCase().includes(q.toLowerCase()) ||
             p.inn?.includes(q) ||
             p.phone?.includes(q))
        ) || [];

        res.json({
            success: true,
            patients: myPatients,
            total: myPatients.length
        });

    } catch (error) {
        console.error('Search patients error:', error);
        res.status(500).json({ error: 'Издөөдө ката' });
    }
});

// Врач: Пациент кошуу
app.post('/api/doctor/patients', authMiddleware, roleMiddleware(['doctor']), async (req, res) => {
    try {
        const doctorId = req.user.id;
        const { inn, fullName, birthDate, gender, phone, address, bloodGroup, rhFactor, height, weight, allergy, chronicDiseases, currentMedicines } = req.body;

        if (!inn || !fullName) {
            return res.status(400).json({ error: 'ИНН жана аты-жөнү милдеттүү' });
        }

        const patients = await readFile('patients.json');
        if (!patients.patients) patients.patients = [];

        // ИНН уникалдуулугун текшерүү
        if (patients.patients.find(p => p.inn === inn)) {
            return res.status(400).json({ error: 'Мындай ИНН бар' });
        }

        // BMI эсептөө
        let bmi = null;
        if (height && weight) {
            const heightInMeters = height / 100;
            bmi = Math.round((weight / (heightInMeters * heightInMeters)) * 10) / 10;
        }

        const newPatient = {
            id: generateId('pat'),
            inn,
            fullName,
            birthDate: birthDate || null,
            gender: gender || null,
            phone: phone || '',
            address: address || '',
            bloodGroup: bloodGroup || null,
            rhFactor: rhFactor || null,
            height: height || null,
            weight: weight || null,
            bmi: bmi,
            allergy: allergy || '',
            chronicDiseases: chronicDiseases || [],
            currentMedicines: currentMedicines || [],
            createdBy: doctorId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        patients.patients.push(newPatient);
        await writeFile('patients.json', patients);

        // Аудитория
        const audit = await readFile('audit.json');
        if (!audit.logs) audit.logs = [];
        audit.logs.push({
            id: generateId('log'),
            userId: doctorId,
            action: 'create_patient',
            details: `Жаңы пациент кошулду: ${fullName}`,
            ip: req.ip || '127.0.0.1',
            createdAt: new Date().toISOString()
        });
        await writeFile('audit.json', audit);

        res.json({ success: true, patient: newPatient });

    } catch (error) {
        console.error('Create patient error:', error);
        res.status(500).json({ error: 'Пациент кошууда ката' });
    }
});

// Врач: Визит кошуу
app.post('/api/doctor/visits', authMiddleware, roleMiddleware(['doctor']), async (req, res) => {
    try {
        const doctorId = req.user.id;
        const { patientId, systolic, diastolic, pulse, temperature, spo2, glucose, cholesterol, complaints, diagnosis, notes } = req.body;

        if (!patientId || !systolic || !diastolic) {
            return res.status(400).json({ error: 'Пациент, жогорку жана төмөнкү басым милдеттүү' });
        }

        // AI анализ
        const ai = getAIStatus(systolic, diastolic);

        const visits = await readFile('visits.json');
        if (!visits.visits) visits.visits = [];

        const newVisit = {
            id: generateId('vis'),
            patientId,
            doctorId,
            visitDate: new Date().toISOString(),
            systolic,
            diastolic,
            pulse: pulse || null,
            temperature: temperature || null,
            spo2: spo2 || null,
            glucose: glucose || null,
            cholesterol: cholesterol || null,
            complaints: complaints || '',
            diagnosis: diagnosis || '',
            notes: notes || '',
            aiRiskLevel: ai.riskLevel,
            aiMessage: ai.message,
            createdAt: new Date().toISOString()
        };

        visits.visits.push(newVisit);
        await writeFile('visits.json', visits);

        // Аудитория
        const audit = await readFile('audit.json');
        if (!audit.logs) audit.logs = [];
        audit.logs.push({
            id: generateId('log'),
            userId: doctorId,
            action: 'create_visit',
            details: `Визит кошулду: ${systolic}/${diastolic}`,
            ip: req.ip || '127.0.0.1',
            createdAt: new Date().toISOString()
        });
        await writeFile('audit.json', audit);

        res.json({ 
            success: true, 
            visit: newVisit,
            ai: ai
        });

    } catch (error) {
        console.error('Create visit error:', error);
        res.status(500).json({ error: 'Визит кошууда ката' });
    }
});

// Врач: Статистика
app.get('/api/doctor/stats', authMiddleware, roleMiddleware(['doctor']), async (req, res) => {
    try {
        const doctorId = req.user.id;
        const visits = await readFile('visits.json');
        const patients = await readFile('patients.json');

        const myVisits = visits.visits?.filter(v => v.doctorId === doctorId) || [];
        const myPatients = patients.patients?.filter(p => p.createdBy === doctorId) || [];

        // Күндөр боюнча статистика
        const dailyStats = myVisits.reduce((acc, v) => {
            const date = new Date(v.visitDate).toLocaleDateString('ky-KG');
            acc[date] = (acc[date] || 0) + 1;
            return acc;
        }, {});

        // AI статистикасы
        const aiStats = myVisits.reduce((acc, v) => {
            const key = v.aiRiskLevel || 'unknown';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});

        // Акыркы 7 күндөгү активдүүлүк
        const now = new Date();
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const recentVisits = myVisits.filter(v => new Date(v.visitDate) >= weekAgo);

        // Орточо басым
        const avgBP = calculateAverageBP(myVisits);

        res.json({
            success: true,
            stats: {
                totalPatients: myPatients.length,
                totalVisits: myVisits.length,
                recentVisits: recentVisits.length,
                dailyStats: Object.entries(dailyStats).map(([date, count]) => ({ date, count })),
                aiStats: {
                    normal: aiStats.normal || 0,
                    warning: aiStats.warning || 0,
                    danger: aiStats.danger || 0
                },
                avgBP: avgBP,
                lastActivity: myVisits.length > 0 
                    ? myVisits.sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))[0]?.visitDate
                    : null
            }
        });

    } catch (error) {
        console.error('Doctor stats error:', error);
        res.status(500).json({ error: 'Статистиканы алууда ката' });
    }
});

// Врач: Пациенттин тарыхы
app.get('/api/doctor/patients/:id/history', authMiddleware, roleMiddleware(['doctor']), async (req, res) => {
    try {
        const { id } = req.params;
        const doctorId = req.user.id;
        
        const patients = await readFile('patients.json');
        const patient = patients.patients?.find(p => p.id === id && p.createdBy === doctorId);
        
        if (!patient) {
            return res.status(404).json({ error: 'Пациент табылган жок' });
        }

        const visits = await readFile('visits.json');
        const patientVisits = visits.visits?.filter(v => v.patientId === id) || [];

        res.json({
            success: true,
            patient,
            visits: patientVisits.sort((a, b) => new Date(b.visitDate) - new Date(a.visitDate))
        });

    } catch (error) {
        console.error('Get history error:', error);
        res.status(500).json({ error: 'Тарыхты алууда ката' });
    }
});

// === РЕЗЕРВДИК КӨЧҮРМӨ ===
app.post('/api/backup', authMiddleware, async (req, res) => {
    try {
        await ensureDataDir();
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.json`);
        
        const users = await readFile('users.json');
        const patients = await readFile('patients.json');
        const visits = await readFile('visits.json');
        const audit = await readFile('audit.json');

        const backupData = {
            timestamp: new Date().toISOString(),
            data: {
                users,
                patients,
                visits,
                audit
            }
        };

        await fs.writeFile(backupFile, JSON.stringify(backupData, null, 2));

        // Эски бэкаптарды тазалоо (акыркы 10 бэкапты калтыруу)
        const files = await fs.readdir(BACKUP_DIR);
        const backupFiles = files
            .filter(f => f.startsWith('backup-'))
            .sort()
            .reverse();
        
        if (backupFiles.length > 10) {
            for (let i = 10; i < backupFiles.length; i++) {
                await fs.unlink(path.join(BACKUP_DIR, backupFiles[i]));
            }
        }

        const stat = await fs.stat(backupFile);

        res.json({
            success: true,
            message: 'Резервдик көчүрмө алынды',
            size: stat.size,
            file: backupFile
        });

    } catch (error) {
        console.error('Backup error:', error);
        res.status(500).json({ error: 'Резервдөөдө ката' });
    }
});

// === АУДИТОРИЯ ЖУРНАЛЫ ===
app.get('/api/audit', authMiddleware, roleMiddleware(['admin']), async (req, res) => {
    try {
        const audit = await readFile('audit.json');
        const logs = audit.logs || [];
        
        // Акыркы 100 жазууну көрсөтүү
        const recentLogs = logs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 100);

        res.json({
            success: true,
            logs: recentLogs,
            total: logs.length
        });

    } catch (error) {
        console.error('Get audit error:', error);
        res.status(500).json({ error: 'Аудиторияны алууда ката' });
    }
});

// ==================== HTML БЕТТЕР (ROUTER) ====================

// Башкы бет - login.html (index.html болбосо)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Login бети (эгерде /login деп кирсе)
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Admin панели
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Doctor кабинети
app.get('/doctor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'doctor.html'));
});

// ==================== 404 КАТАСЫ ====================
app.use((req, res) => {
    // 404 бетин көрсөтүү (жок болсо JSON кайтарат)
    try {
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    } catch (error) {
        res.status(404).json({ 
            error: 'Барак табылган жок',
            message: 'Сиз издеген барак жок же өчүрүлгөн'
        });
    }
});

// ==================== СЕРВЕРДИ ИШКЕ КОШУУ ====================
app.listen(PORT, async () => {
    await initializeData();
    console.log('='.repeat(50));
    console.log(`🚀 Сервер иштеп жатат: http://localhost:${PORT}`);
    console.log(`📁 Маалыматтар: ${DATA_DIR}`);
    console.log(`💾 Бэкаптар: ${BACKUP_DIR}`);
    console.log(`👤 Админ: admin / admin123`);
    console.log(`👨‍⚕️ Демо врач: doctor / doctor123`);
    console.log('='.repeat(50));
    console.log('📋 Жеткиликтүү баракчалар:');
    console.log(`   🏠 Башкы бет: http://localhost:${PORT}/`);
    console.log(`   🔐 Кирүү: http://localhost:${PORT}/login`);
    console.log(`   👨‍💼 Админ: http://localhost:${PORT}/admin`);
    console.log(`   👨‍⚕️ Врач: http://localhost:${PORT}/doctor`);
    console.log('='.repeat(50));
});