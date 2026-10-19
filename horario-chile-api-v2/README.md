# Horario Chile API v2

Ejecutar con Node.js 18 o superior:

```bash
npm start
```

Abrir `http://localhost:3000`.

## Actualización desde v1

1. Detener `npm start` con `Ctrl+C`.
2. Respaldar el archivo anterior `data/config.json`.
3. Reemplazar `server.js` y la carpeta `public` por los de esta versión.
4. En el `config.json` existente, añadir antes de la última llave:

```json
,"exceptions": []
```

5. Ejecutar nuevamente `npm start`.

El endpoint de Lynn continúa siendo `GET /api/status` y conserva `esHorarioHabil` y `flujoActivo`.
