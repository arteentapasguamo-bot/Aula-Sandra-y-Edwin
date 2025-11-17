require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const JWT_SECRET = process.env.JWT_SECRET || 'CAMBIAR_JWT_SECRET';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/aula_db';
const TEACHER_EMAIL = process.env.TEACHER_EMAIL || 'docente@aula-sandra-edwin.com';

if(!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random()*1e9) + path.extname(file.originalname);
    cb(null, unique);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

// Mongoose
mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(()=> console.log('MongoDB conectado'))
  .catch(err=> console.error('MongoDB error', err));

const userSchema = new mongoose.Schema({
  username: { type: String, required:true, unique:true },
  email: { type: String, required:true, unique:true },
  passwordHash: { type: String, required:true },
  role: { type: String, enum:['student','teacher'], required:true }
}, { timestamps:true });

const submissionSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref:'User', required:true },
  studentName: String,
  studentEmail: String,
  course: String,
  fileName: String,
  originalFileName: String,
  submittedAt: { type: Date, default: Date.now },
  grade: Number
});

const User = mongoose.model('User', userSchema);
const Submission = mongoose.model('Submission', submissionSchema);

// Nodemailer (optional)
let transporter;
if(process.env.SMTP_HOST && process.env.SMTP_USER){
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT == '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

// Auth middleware
const auth = async (req,res,next)=>{
  const h = req.headers['authorization'];
  if(!h) return res.status(401).send('No token');
  const parts = h.split(' ');
  if(parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).send('Formato inválido');
  try{
    const payload = jwt.verify(parts[1], JWT_SECRET);
    req.user = await User.findById(payload.id).select('-passwordHash');
    if(!req.user) return res.status(401).send('Usuario no encontrado');
    next();
  }catch(e){ return res.status(401).send('Token inválido') }
};

const requireRole = (role)=> (req,res,next)=>{
  if(!req.user) return res.status(401).send('No autenticado');
  if(req.user.role !== role) return res.status(403).send('Acceso denegado');
  next();
};

// Routes
app.post('/register', async (req,res)=>{
  try{
    const { user, email, pass, role } = req.body;
    if(!user || !email || !pass || !role) return res.status(400).send('Faltan campos');
    if(!['student','teacher'].includes(role)) return res.status(400).send('Rol inválido');

    const existing = await User.findOne({ $or: [ { username: user }, { email } ] });
    if(existing) return res.status(400).send('Usuario o correo ya existe');

    const hash = await bcrypt.hash(pass, 10);
    const u = new User({ username: user, email, passwordHash: hash, role });
    await u.save();
    res.json({ ok:true });
  }catch(err){ console.error(err); res.status(500).send('Error interno'); }
});

app.post('/login', async (req,res)=>{
  try{
    const { user, pass, role } = req.body;
    if(!user || !pass || !role) return res.status(400).send('Faltan campos');
    const u = await User.findOne({ $or: [ { username: user }, { email: user } ], role });
    if(!u) return res.status(400).send('Credenciales inválidas');
    const ok = await bcrypt.compare(pass, u.passwordHash);
    if(!ok) return res.status(400).send('Credenciales inválidas');
    const token = jwt.sign({ id: u._id, role: u.role }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, role: u.role, username: u.username });
  }catch(err){ console.error(err); res.status(500).send('Error interno'); }
});

app.post('/submit', auth, requireRole('student'), upload.single('file'), async (req,res)=>{
  try{
    const { course } = req.body;
    if(!req.file) return res.status(400).send('Archivo requerido');
    const student = req.user;
    const sub = new Submission({
      studentId: student._id,
      studentName: student.username,
      studentEmail: student.email,
      course: course || '',
      fileName: req.file.filename,
      originalFileName: req.file.originalname
    });
    await sub.save();

    if(transporter){
      transporter.sendMail({
        from: process.env.SMTP_USER,
        to: TEACHER_EMAIL,
        subject: `Nueva entrega: ${sub.course} - ${sub.studentName}`,
        text: `Se ha recibido una nueva entrega.\n\nEstudiante: ${sub.studentName}\nCorreo: ${sub.studentEmail}\nCurso: ${sub.course}\nArchivo: ${sub.originalFileName}\nID: ${sub._id}`
      }).catch(e=> console.error('Mail error', e));
    }

    res.json({ ok:true, id: sub._id });
  }catch(err){ console.error(err); res.status(500).send('Error interno'); }
});

app.get('/teacher/submissions', auth, requireRole('teacher'), async (req,res)=>{
  const list = await Submission.find().sort({ submittedAt:-1 }).lean();
  res.json(list);
});

app.post('/teacher/grade/:id', auth, requireRole('teacher'), async (req,res)=>{
  const { grade } = req.body;
  if(typeof grade !== 'number') return res.status(400).send('Grade debe ser número');
  const sub = await Submission.findById(req.params.id);
  if(!sub) return res.status(404).send('No encontrado');
  sub.grade = grade;
  await sub.save();
  res.json({ ok:true });
});

app.use('/files', express.static(UPLOAD_DIR));

app.listen(PORT, ()=> console.log(`Server listening on ${PORT}`));