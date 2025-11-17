
# AULA DE SANDRA Y EDWIN

Paquete listo para desplegar: backend (Node.js + Express + MongoDB) y frontend (HTML).

## Estructura
```
/server.js
/package.json
/.env.example
/frontend/index.html
/README.md
```

## Cómo ejecutar localmente (resumen)
1. Clonar este paquete.
2. Copiar `.env.example` a `.env` y rellenar variables (MONGO_URI, JWT_SECRET, SMTP_*).
3. `npm install`
4. `npm run dev` (requiere nodemon) o `npm start`
5. Abrir `frontend/index.html` y actualizar `API_BASE` en el script con la URL del servidor (por ejemplo, http://localhost:3000)

## Notas
- Por defecto se recomienda usar Mailtrap para pruebas de correo.
- Cambia `TEACHER_EMAIL` por el correo real del docente.
- Protege `JWT_SECRET` y no lo subas a repositorios públicos.
