require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs'); // Importante para comparar contraseñasno
const app = express();
const multer = require('multer');
const path = require('path');


const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/'); // Carpeta donde se guardan
    },
    filename: (req, file, cb) => {
        // Le ponemos la fecha al nombre para que no se repitan
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- RUTA PARA CREAR NOTICIA (Protegida) ---
// 'imagenes' es el nombre del campo que enviaremos desde el HTML
app.post('/api/noticias', upload.array('imagenes'), (req, res) => {
    try {
        const { titulo, fecha_inicio, fecha_fin, titulos_pestana } = req.body;
        const archivos = req.files;

        // Validación básica
        if (!archivos || archivos.length === 0) {
            return res.status(400).send({ message: "Debes subir al menos una imagen" });
        }

        // Armar el objeto JSON para la base de datos
        // Combinamos el título de la pestaña con la ruta de la imagen que subió multer
        // Nota: Si titulos_pestana es un string (solo una pestaña), lo convertimos a array
        const titulosArray = Array.isArray(titulos_pestana) ? titulos_pestana : [titulos_pestana];
        
        const contenido = titulosArray.map((tituloTab, index) => ({
            titulo: tituloTab,
            imagen: '/uploads/' + archivos[index].filename
        }));

        // Convertir a texto para guardar en MySQL
        const contenidoJson = JSON.stringify(contenido);

        const sql = "INSERT INTO noticias (titulo_principal, fecha_inicio, fecha_fin, contenido_json) VALUES (?, ?, ?, ?)";
        
        db.query(sql, [titulo, fecha_inicio, fecha_fin, contenidoJson], (err, result) => {
            if (err) {
                console.error(err);
                return res.status(500).send({ message: "Error al guardar en BD" });
            }
            res.status(200).send({ message: "Noticia publicada exitosamente" });
        });

    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Error en el servidor" });
    }
});



app.use(express.static('public'));

app.use(cors());
app.use(bodyParser.json());

// --- CONEXIÓN BD ---
    const connection = mysql.createConnection({
     host: process.env.MYSQLHOST || 'localhost',
        user: process.env.MYSQLUSER || 'root',
        password: process.env.MYSQLPASSWORD || '',
        database: process.env.MYSQLDATABASE || 'noticias_db',
         port: process.env.MYSQLPORT || 3306
});

connection.connect((err) => {
    if (err) console.error('Error BD:', err);
    else console.log('✅ Conectado a MySQL');
});

// --- RUTA DE LOGIN (Con lógica de bloqueo) ---
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // 1. Buscar al usuario
    const sqlSearch = "SELECT * FROM admins WHERE username = ?";
    db.query(sqlSearch, [username], async (err, result) => {
        if (err) return res.status(500).send(err);
        if (result.length === 0) return res.status(404).send({ message: "Usuario no encontrado" });

        const user = result[0];
        const now = new Date();

        // 2. ¿Está bloqueado actualmente?
        if (user.bloqueado_hasta && now < user.bloqueado_hasta) {
            // Calcular minutos restantes
            const tiempoRestante = Math.ceil((user.bloqueado_hasta - now) / 60000);
            return res.status(403).send({ message: `Cuenta bloqueada. Intenta en ${tiempoRestante} minutos.` });
        }

        // 3. Si el tiempo de bloqueo ya pasó, reseteamos los intentos
        if (user.bloqueado_hasta && now > user.bloqueado_hasta) {
            db.query("UPDATE admins SET intentos = 0, bloqueado_hasta = NULL WHERE id = ?", [user.id]);
            user.intentos = 0; // Actualizamos la variable local también
        }

        // 4. Verificar Contraseña
        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            // --- CONTRASEÑA INCORRECTA ---
            let nuevosIntentos = user.intentos + 1;
            let queryUpdate = "UPDATE admins SET intentos = ? WHERE id = ?";
            let params = [nuevosIntentos, user.id];
            let mensaje = `Contraseña incorrecta. Intento ${nuevosIntentos} de 5.`;

            // Si llegamos al límite (5 intentos)
            if (nuevosIntentos >= 5) {
                const bloqueoTime = new Date(now.getTime() + 60 * 60 * 1000); // Sumar 60 minutos
                queryUpdate = "UPDATE admins SET intentos = ?, bloqueado_hasta = ? WHERE id = ?";
                params = [nuevosIntentos, bloqueoTime, user.id];
                mensaje = "Has excedido los intentos. Cuenta bloqueada por 60 min.";
            }

            db.query(queryUpdate, params);
            return res.status(401).send({ message: mensaje });

        } else {
            // --- LOGIN EXITOSO ---
            // Resetear intentos a 0
            db.query("UPDATE admins SET intentos = 0, bloqueado_hasta = NULL WHERE id = ?", [user.id]);
            return res.status(200).send({ message: "Login exitoso", user: user.username });
        }
    });
});

const PORT = process.env.PORT || 3000;

app.get('/api/noticias', (req, res) => {
    // Traemos todas las noticias ordenadas por fecha
    const sql = "SELECT * FROM noticias ORDER BY fecha_inicio ASC";
    
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send("Error al obtener noticias");
        }
        // MySQL devuelve el JSON como texto, así que el frontend deberá convertirlo
        res.json(results);
    });
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});