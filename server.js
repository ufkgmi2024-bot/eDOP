const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========== PostgreSQL КОШУЛУУ ==========
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'doctor_helper',
    password: process.env.DB_PASSWORD || '123456',
    port: process.env.DB_PORT || 5432,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// ========== ДАТАБАЗАНЫ ТҮЗҮҮ ==========
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS patients (
                inn VARCHAR(14) PRIMARY KEY,
                full_name VARCHAR(200) NOT NULL,
                birth_date DATE,
                phone VARCHAR(20),
                address TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS blood_pressure (
                id SERIAL PRIMARY KEY,
                patient_inn VARCHAR(14) REFERENCES patients(inn) ON DELETE CASCADE,
                systolic INTEGER NOT NULL CHECK (systolic BETWEEN 30 AND 300),
                diastolic INTEGER NOT NULL CHECK (diastolic BETWEEN 20 AND 200),
                pulse INTEGER CHECK (pulse BETWEEN 20 AND 250),
                notes TEXT,
                ai_status VARCHAR(20) DEFAULT 'normal',
                check_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS diseases (
                id SERIAL PRIMARY KEY,
                patient_inn VARCHAR(14) REFERENCES patients(inn) ON DELETE CASCADE,
                disease_name VARCHAR(200) NOT NULL,
                diagnosis_date DATE,
                severity VARCHAR(20) DEFAULT 'medium',
                symptoms TEXT,
                treatment TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS appointments (
                id SERIAL PRIMARY KEY,
                patient_inn VARCHAR(14) REFERENCES patients(inn) ON DELETE CASCADE,
                appointment_date TIMESTAMP NOT NULL,
                doctor_name VARCHAR(200),
                reason TEXT,
                diagnosis TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_bp_patient ON blood_pressure(patient_inn, check_date DESC);
            CREATE INDEX IF NOT EXISTS idx_disease_patient ON diseases(patient_inn);
            CREATE INDEX IF NOT EXISTS idx_appointment_patient ON appointments(patient_inn, appointment_date DESC);
        `);

        console.log('✅ База ийгиликтүү түзүлдү');
    } catch (error) {
        console.error('❌ Базаны түзүүдө ката:', error.message);
        process.exit(1);
    }
}

// ========== AI АНАЛИЗ ФУНКЦИЯСЫ ==========
function analyzeBP(systolic, diastolic, pulse) {
    let status = 'normal';
    let message = '✅ Басым нормада.';
    let recommendations = [];

    if (systolic >= 180 || diastolic >= 120) {
        status = 'danger';
        message = '🚨 ӨТӨ КООПТУУ! Дароо тез жардам чалыңыз!';
        recommendations.push('Дароо 103 же 112 чалыңыз');
        recommendations.push('Пациентти отургузуп, тынчтандырыңыз');
    } else if (systolic >= 140 || diastolic >= 90) {
        status = 'warning';
        message = '⚠️ Басым жогорулап жатат. Врачка кайрылыңыз.';
        recommendations.push('Дарыгерге кайрылыңыз');
        recommendations.push('Тузду азайтыңыз');
    } else if (systolic < 90 || diastolic < 60) {
        status = 'warning';
        message = '⚠️ Басым төмөн. Врачка кайрылыңыз.';
        recommendations.push('Көбүрөөк суу ичиңиз');
        recommendations.push('Дарыгерге кайрылыңыз');
    }

    if (pulse) {
        if (pulse > 100) recommendations.push('Пульс тез (тахикардия)');
        else if (pulse < 60) recommendations.push('Пульс жай (брадикардия)');
    }

    return { status, message, recommendations };
}

// ========== СТАТИСТИКА ==========
app.get('/api/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                COUNT(*) as total_patients,
                SUM(CASE WHEN bp.ai_status = 'danger' THEN 1 ELSE 0 END) as critical_count,
                SUM(CASE WHEN bp.ai_status = 'warning' THEN 1 ELSE 0 END) as warning_count,
                SUM(CASE WHEN bp.ai_status = 'normal' THEN 1 ELSE 0 END) as normal_count
            FROM patients p
            LEFT JOIN LATERAL (
                SELECT ai_status FROM blood_pressure 
                WHERE patient_inn = p.inn 
                ORDER BY check_date DESC LIMIT 1
            ) bp ON true
        `);

        res.json({
            success: true,
            stats: result.rows[0] || {
                total_patients: 0,
                critical_count: 0,
                warning_count: 0,
                normal_count: 0
            }
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ПАЦИЕНТ ИЗДӨӨ ==========
app.get('/api/patients/search/:inn', async (req, res) => {
    try {
        const { inn } = req.params;
        
        const patientResult = await pool.query(
            'SELECT * FROM patients WHERE inn = $1',
            [inn]
        );

        if (patientResult.rows.length === 0) {
            return res.json({ success: false, message: 'Пациент табылган жок' });
        }

        const patient = patientResult.rows[0];

        // Басым тарыхы
        const bpResult = await pool.query(
            'SELECT * FROM blood_pressure WHERE patient_inn = $1 ORDER BY check_date DESC LIMIT 10',
            [inn]
        );

        // Оорулар
        const diseaseResult = await pool.query(
            'SELECT * FROM diseases WHERE patient_inn = $1 ORDER BY diagnosis_date DESC',
            [inn]
        );

        // Акыркы басым
        const lastBP = bpResult.rows[0] || null;

        res.json({
            success: true,
            patient: {
                inn: patient.inn,
                full_name: patient.full_name,
                birth_date: patient.birth_date,
                phone: patient.phone,
                address: patient.address,
                history: bpResult.rows.map(row => ({
                    check_date: row.check_date,
                    systolic: row.systolic,
                    diastolic: row.diastolic,
                    pulse: row.pulse,
                    notes: row.notes,
                    ai_status: row.ai_status
                })),
                diseases: diseaseResult.rows,
                lastBP: lastBP ? {
                    systolic: lastBP.systolic,
                    diastolic: lastBP.diastolic,
                    pulse: lastBP.pulse,
                    date: lastBP.check_date,
                    status: lastBP.ai_status
                } : null
            }
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ПАЦИЕНТТЕРДИ ИЗДӨӨ (ЖАЛПЫ) ==========
app.get('/api/patients', async (req, res) => {
    try {
        const { search, page = 1, limit = 50 } = req.query;
        const offset = (page - 1) * limit;

        let query = 'SELECT * FROM patients';
        let params = [];
        let countQuery = 'SELECT COUNT(*) FROM patients';

        if (search) {
            query += ' WHERE full_name ILIKE $1 OR inn LIKE $1';
            countQuery += ' WHERE full_name ILIKE $1 OR inn LIKE $1';
            params.push(`%${search}%`);
        }

        query += ' ORDER BY full_name LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
        params.push(limit, offset);

        const [result, countResult] = await Promise.all([
            pool.query(query, params),
            pool.query(countQuery, params.slice(0, params.length - 2))
        ]);

        res.json({
            success: true,
            patients: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ЖАҢЫ ПАЦИЕНТ ==========
app.post('/api/patients', async (req, res) => {
    try {
        const { inn, full_name, birth_date, phone, address } = req.body;

        // Текшерүү
        const check = await pool.query('SELECT inn FROM patients WHERE inn = $1', [inn]);
        if (check.rows.length > 0) {
            return res.json({ success: false, error: 'Мындай ИНН менен пациент бар' });
        }

        await pool.query(
            `INSERT INTO patients (inn, full_name, birth_date, phone, address) 
             VALUES ($1, $2, $3, $4, $5)`,
            [inn, full_name, birth_date, phone, address]
        );

        res.json({ success: true, message: 'Пациент кошулду' });
    } catch (error) {
        console.error('Add patient error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== БАСЫМ КОШУУ ==========
app.post('/api/blood-pressure', async (req, res) => {
    try {
        const { inn, systolic, diastolic, pulse, notes } = req.body;

        // Пациентти текшерүү
        const patientCheck = await pool.query('SELECT inn FROM patients WHERE inn = $1', [inn]);
        if (patientCheck.rows.length === 0) {
            return res.json({ success: false, error: 'Пациент табылган жок' });
        }

        const ai = analyzeBP(systolic, diastolic, pulse);

        await pool.query(
            `INSERT INTO blood_pressure (patient_inn, systolic, diastolic, pulse, notes, ai_status) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [inn, systolic, diastolic, pulse, notes, ai.status]
        );

        // Трендди текшерүү
        const trendResult = await pool.query(
            `SELECT systolic, diastolic, check_date FROM blood_pressure 
             WHERE patient_inn = $1 ORDER BY check_date DESC LIMIT 2`,
            [inn]
        );

        let trend = null;
        if (trendResult.rows.length === 2) {
            const [current, previous] = trendResult.rows;
            const diffSystolic = current.systolic - previous.systolic;
            const diffDiastolic = current.diastolic - previous.diastolic;
            
            if (Math.abs(diffSystolic) > 10 || Math.abs(diffDiastolic) > 10) {
                trend = {
                    direction: diffSystolic > 0 ? 'up' : 'down',
                    message: diffSystolic > 0 ? '📈 Басым көтөрүлүп жатат' : '📉 Басым түшүп жатат',
                    diff: `${diffSystolic > 0 ? '+' : ''}${diffSystolic}/${diffDiastolic > 0 ? '+' : ''}${diffDiastolic}`
                };
            }
        }

        res.json({
            success: true,
            ai,
            trend,
            message: 'Басым кошулду'
        });
    } catch (error) {
        console.error('BP error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== ООРУ КОШУУ ==========
app.post('/api/diseases', async (req, res) => {
    try {
        const { inn, disease_name, diagnosis_date, severity, symptoms, treatment, notes } = req.body;

        const patientCheck = await pool.query('SELECT inn FROM patients WHERE inn = $1', [inn]);
        if (patientCheck.rows.length === 0) {
            return res.json({ success: false, error: 'Пациент табылган жок' });
        }

        await pool.query(
            `INSERT INTO diseases (patient_inn, disease_name, diagnosis_date, severity, symptoms, treatment, notes) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [inn, disease_name, diagnosis_date, severity, symptoms, treatment, notes]
        );

        res.json({ success: true, message: 'Оору кошулду' });
    } catch (error) {
        console.error('Disease error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== КАБЫЛ АЛУУ КОШУУ ==========
app.post('/api/appointments', async (req, res) => {
    try {
        const { inn, appointment_date, doctor_name, reason, diagnosis, notes } = req.body;

        const patientCheck = await pool.query('SELECT inn FROM patients WHERE inn = $1', [inn]);
        if (patientCheck.rows.length === 0) {
            return res.json({ success: false, error: 'Пациент табылган жок' });
        }

        await pool.query(
            `INSERT INTO appointments (patient_inn, appointment_date, doctor_name, reason, diagnosis, notes) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [inn, appointment_date, doctor_name, reason, diagnosis, notes]
        );

        res.json({ success: true, message: 'Кабыл алуу кошулду' });
    } catch (error) {
        console.error('Appointment error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== БАРДЫК ПАЦИЕНТТЕР (ЭКСПОРТ) ==========
app.get('/api/patients/all', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.*,
                COUNT(DISTINCT bp.id) as bp_count,
                COUNT(DISTINCT d.id) as disease_count,
                MAX(bp.check_date) as last_check
            FROM patients p
            LEFT JOIN blood_pressure bp ON p.inn = bp.patient_inn
            LEFT JOIN diseases d ON p.inn = d.patient_inn
            GROUP BY p.inn
            ORDER BY p.full_name
        `);

        res.json({
            success: true,
            patients: result.rows
        });
    } catch (error) {
        console.error('All patients error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== РЕЗЕРВДИК КӨЧҮРМӨ ==========
app.post('/api/backup', async (req, res) => {
    try {
        const backupDir = path.join(__dirname, 'backup');
        await fs.mkdir(backupDir, { recursive: true });

        const result = await pool.query(`
            SELECT 
                p.*,
                json_agg(DISTINCT bp.*) as blood_pressure,
                json_agg(DISTINCT d.*) as diseases,
                json_agg(DISTINCT a.*) as appointments
            FROM patients p
            LEFT JOIN blood_pressure bp ON p.inn = bp.patient_inn
            LEFT JOIN diseases d ON p.inn = d.patient_inn
            LEFT JOIN appointments a ON p.inn = a.patient_inn
            GROUP BY p.inn
        `);

        const backupFile = path.join(backupDir, `backup-${Date.now()}.json`);
        await fs.writeFile(backupFile, JSON.stringify(result.rows, null, 2));

        const stat = await fs.stat(backupFile);

        res.json({
            success: true,
            size: stat.size,
            count: result.rows.length,
            file: path.basename(backupFile)
        });
    } catch (error) {
        console.error('Backup error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ========== СЕРВЕРДИ ИШКЕ КИРГИЗҮҮ ==========
async function startServer() {
    await initDatabase();
    
    app.listen(PORT, () => {
        console.log(`🚀 Сервер иштеп жатат: http://localhost:${PORT}`);
        console.log(`📊 PostgreSQL базасы: ${process.env.DB_NAME || 'doctor_helper'}`);
    });
}

startServer().catch(console.error);