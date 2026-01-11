-- 1. Crear la base de datos
CREATE DATABASE IF NOT EXISTS noticias_db;
USE noticias_db;

-- 2. Tabla de Administradores (Para el login con bloqueo)
CREATE TABLE admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL, -- Aquí guardaremos la contraseña encriptada
    intentos INT DEFAULT 0,
    bloqueado_hasta DATETIME DEFAULT NULL
);

-- 3. Tabla de Noticias (Con soporte para JSON en contenido)
CREATE TABLE noticias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    titulo_principal VARCHAR(255) NOT NULL,
    fecha_inicio DATETIME NOT NULL,
    fecha_fin DATETIME NOT NULL,
    -- Aquí guardaremos el array de imágenes y pestañas como texto JSON
    -- Ejemplo: [{"titulo": "Dia 1", "img": "url..."}, {"titulo": "Mapa", "img": "url..."}]
    contenido_json JSON NOT NULL, 
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Insertar un Admin de prueba
-- NOTA: La contraseña '123456' encriptada con bcrypt se ve así (copia todo el hash):
-- INSERT INTO admins (username, password) 
-- VALUES ('admin1', 'Contrasena2702');


