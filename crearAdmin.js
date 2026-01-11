// crearAdmin.js
const mysql = require('mysql2');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configuración de conexión (Igual que en server.js)
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'AAlleexxyyaaeell22770022', // <--- ¡Asegúrate de poner tu contraseña aquí!
    database: 'noticias_db'
});

const crearAdmin = async () => {
    const usuario = 'admin';
    const passwordPlana = 'PokemonGoCDMXoficial'; // Esta será tu contraseña para entrar

    // 1. Encriptar la contraseña
    const salt = await bcrypt.genSalt(10);
    const passwordEncriptada = await bcrypt.hash(passwordPlana, salt);

    // 2. Insertar en la base de datos
    const sql = 'INSERT INTO admins (username, password) VALUES (?, ?)';
    
    db.query(sql, [usuario, passwordEncriptada], (err, result) => {
        if (err) {
            console.log('Error al crear usuario (quizás ya existe):', err.message);
        } else {
            console.log('✅ Usuario Admin creado exitosamente.');
            console.log('Usuario:', usuario);
            console.log('Password:', passwordPlana);
        }
        db.end(); // Cerrar conexión
    });
};

crearAdmin();