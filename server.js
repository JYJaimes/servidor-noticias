require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs'); 
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const path = require('path');
const multer = require('multer');
const app = express();

// --- 1. CONFIGURACIONES (Siempre deben ir al principio) ---
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('public')); // Para servir tus HTML y CSS



// --- 2. CONEXIÓN BD ---
// CAMBIO IMPORTANTE: Ahora la variable se llama 'db' para que coincida con tus rutas
// --- 2. CONEXIÓN BD (MODO POOL) ---
// Usamos createPool en lugar de createConnection para que no se desconecte
const db = mysql.createPool({
    host: process.env.MYSQLHOST || 'mainline.proxy.rlwy.net',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || 'aVPmTgUWjnvGIyBHUuXKEUntSCFDQnxP',
    database: process.env.MYSQLDATABASE || 'railway',
    port: process.env.MYSQLPORT || 23193,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Prueba de conexión inicial
db.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Error conectando a BD:', err.message);
    } else {
        console.log('✅ Conectado a MySQL con Pool');
        connection.release();
    }
});

// --- 3. CONFIGURACIÓN MULTER (Subida de imágenes) ---
// Configuración de Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configuración de Multer para Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'noticias_upiicsa', // Nombre de la carpeta en Cloudinary
        allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    },
});

const upload = multer({ storage: storage });

// --- 4. RUTAS ---

// RUTA PARA CREAR NOTICIA
app.post('/api/noticias', upload.array('imagenes'), (req, res) => {
    try {
        const { titulo, fecha_inicio, fecha_fin, titulos_pestana } = req.body;
        const archivos = req.files;

        if (!archivos || archivos.length === 0) {
            return res.status(400).send({ message: "Debes subir al menos una imagen" });
        }

        const titulosArray = Array.isArray(titulos_pestana) ? titulos_pestana : [titulos_pestana];
        
        const contenido = titulosArray.map((tituloTab, index) => ({
        titulo: tituloTab,
        imagen: archivos[index].path // <--- Cloudinary nos da la URL directa aquí
        }));

        const contenidoJson = JSON.stringify(contenido);
        const sql = "INSERT INTO noticias (titulo_principal, fecha_inicio, fecha_fin, contenido_json) VALUES (?, ?, ?, ?)";
        
        // Ahora sí funciona porque 'db' existe
        db.query(sql, [titulo, fecha_inicio, fecha_fin, contenidoJson], (err, result) => {
            if (err) {
                // Esto nos mostrará el mensaje exacto del error de MySQL
                console.error("❌ ERROR BD DETALLADO:", JSON.stringify(err, null, 2)); 
                return res.status(500).send({ message: "Error al guardar en BD" });
            }
            res.status(200).send({ message: "Noticia publicada exitosamente" });
        });

    } catch (error) {
        // Esto nos mostrará el mensaje exacto si falla Cloudinary o Multer
        console.error("❌ ERROR SERVER DETALLADO:", JSON.stringify(error, null, 2));
        console.error("❌ MENSAJE ERROR:", error.message); 
        res.status(500).send({ message: "Error en el servidor: " + error.message });
    }
});

// RUTA DE LOGIN
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    const sqlSearch = "SELECT * FROM admins WHERE username = ?";
    
    db.query(sqlSearch, [username], async (err, result) => {
        if (err) {
            console.error("Error en query:", err); // Agregué logs para ver errores en Railway
            return res.status(500).send(err);
        }
        if (result.length === 0) return res.status(404).send({ message: "Usuario no encontrado" });

        const user = result[0];
        const now = new Date();

        // Verificar bloqueo
        if (user.bloqueado_hasta && now < user.bloqueado_hasta) {
            const tiempoRestante = Math.ceil((user.bloqueado_hasta - now) / 60000);
            return res.status(403).send({ message: `Cuenta bloqueada. Intenta en ${tiempoRestante} minutos.` });
        }

        // Resetear bloqueo si ya pasó el tiempo
        if (user.bloqueado_hasta && now > user.bloqueado_hasta) {
            db.query("UPDATE admins SET intentos = 0, bloqueado_hasta = NULL WHERE id = ?", [user.id]);
            user.intentos = 0; 
        }

        // Verificar contraseña
        // OJO: Esto requiere que la contraseña en la BD esté ENCRIPTADA con bcrypt.
        // Si en tu BD pusiste "1234" manual, esto fallará. 
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            let nuevosIntentos = user.intentos + 1;
            let queryUpdate = "UPDATE admins SET intentos = ? WHERE id = ?";
            let params = [nuevosIntentos, user.id];
            let mensaje = `Contraseña incorrecta. Intento ${nuevosIntentos} de 5.`;

            if (nuevosIntentos >= 5) {
                const bloqueoTime = new Date(now.getTime() + 60 * 60 * 1000);
                queryUpdate = "UPDATE admins SET intentos = ?, bloqueado_hasta = ? WHERE id = ?";
                params = [nuevosIntentos, bloqueoTime, user.id];
                mensaje = "Has excedido los intentos. Cuenta bloqueada por 60 min.";
            }

            db.query(queryUpdate, params);
            return res.status(401).send({ message: mensaje });

        } else {
            db.query("UPDATE admins SET intentos = 0, bloqueado_hasta = NULL WHERE id = ?", [user.id]);
            return res.status(200).send({ message: "Login exitoso", user: user.username });
        }
    });
});

// RUTA OBTENER NOTICIAS
app.get('/api/noticias', (req, res) => {
    const sql = "SELECT * FROM noticias ORDER BY fecha_inicio ASC";
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error al obtener noticias");
        }
        res.json(results);
    });
});

// --- MANEJO DE ERRORES GLOBAL (Poner antes del app.listen) ---
app.use((err, req, res, next) => {
    console.error("❌ ERROR AL SUBIR IMAGEN:", err); // Esto mostrará el error real en Railway
    
    if (err.message && err.message.includes('Cloudinary')) {
         return res.status(500).send({ message: "Error de configuración en Cloudinary: " + err.message });
    }
    
    res.status(500).send({ message: "Ocurrió un error en el servidor: " + err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});

