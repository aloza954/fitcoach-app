# FitCoach: notas para asistentes de código

Lee primero `README.md`, sección 5 (estructura, convenciones y tareas habituales). Lo esencial:

- PWA sin dependencias ni compilación. Para probar: `python tools/serve.py` → http://localhost:8765. Tests: http://localhost:8765/tests/.
- Fechas locales `AAAA-MM-DD` mediante `js/dates.js`; nunca `toISOString()`.
- Interfaz generada con la plantilla `html``…`` de `js/ui.js` (escapa todo). Los planes importados no son confiables.
- El formato de import/export con Claude tiene una única fuente de verdad: `js/claude-spec.js`. Si cambias el formato, actualízalo ahí, en `js/plans.js` (validación) y en los tests.
- Al añadir archivos, inclúyelos en `SHELL` de `sw.js` y sube `CACHE`.
- No hagas commits sin que el usuario lo pida.
