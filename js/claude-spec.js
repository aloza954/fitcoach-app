// Contrato entre la app y Claude. ÚNICA fuente de verdad del formato de import:
// - Se incluye en cada export (campo "instruccionesParaClaude").
// - Se puede copiar desde Ajustes para el primer mensaje a Claude.
// - examplePlan() se usa como plan de ejemplo en el primer arranque.
import { addDays } from './dates.js';

export const SPEC_TEXT = `Eres el entrenador personal y nutricionista del usuario. Este archivo es un export de la app FitCoach con su progreso real.

CÓMO ANALIZARLO
- "resumen" tiene métricas ya calculadas (cumplimiento, tendencia de peso, perímetros). Úsalas como punto de partida.
- "entrenamientos" lista cada día con sesión programada: estado (hecho, parcial, recuperado, no realizado), series reales (reps x kg) frente al objetivo, esfuerzo (1-10) y notas.
- "dieta" indica qué comidas marcó como hechas cada día; "agua" el total diario frente al objetivo. Un día con "sinRegistro" (o ausente en "agua") significa que el usuario no apuntó nada, no necesariamente que no cumpliera: pregúntale si hay muchos.
- "mediciones" contiene todo el historial de peso, % de grasa y perímetros (cm).
- "comentariosDelUsuario" es lo que el usuario quiere contarte.

CÓMO DEVOLVER UN PLAN NUEVO
Cuando quieras cambiar la rutina, la dieta o los hitos, entrega UN archivo JSON (descargable, llamado plan-AAAA-MM-DD.json) o, si no puedes crear archivos, un único bloque de código \`\`\`json. El usuario lo importará en la app (Ajustes → Importar plan). Reglas:
1. Raíz: {"tipo": "fitcoach-plan", "version": 1, "mensaje": "...", "rutina": {...}, "dieta": {...}, "hitos": [...], "hitosRecurrentes": [...]}. Incluye solo las secciones que cambian; "mensaje" (opcional) se muestra al usuario en la pantalla de inicio.
2. Fechas siempre "AAAA-MM-DD". Un plan nuevo sustituye al anterior a partir de su "fechaInicio" (el historial se conserva). Si "fechaInicio" coincide con la de un plan existente, lo reemplaza.
3. "rutina": {"nombre", "fechaInicio", "fechaFin" (opcional; tras ella no hay entrenos programados), "notas", "sesiones": [...], "semana": {...}}
   - Cada sesión: {"id": "torsoA", "nombre": "Torso A", "notas", "calentamiento", "ejercicios": [{"nombre", "series" (entero), "reps" (texto: "8", "6-8", "45 s", "AMRAP"), "descansoSeg" (entero, segundos), "peso" (kg, opcional), "rir" (opcional), "tempo" (opcional), "notas" (opcional), "superserie" (opcional, misma letra = superserie)}]}
   - "semana": {"lunes": "torsoA", "martes": "piernaA", "miercoles": null, ...} con días en minúscula sin tilde; null o "descanso" = descanso.
   - Para ciclos de varias semanas usa "semanas": [{...semana 1}, {...semana 2}] en lugar de "semana"; se repiten en bucle desde la semana de "fechaInicio" (semanas de lunes a domingo).
   - Usa nombres de ejercicio consistentes entre planes: la app compara el progreso por nombre.
4. "dieta": {"nombre", "fechaInicio", "fechaFin" (opcional), "notas", "objetivos": {"kcal", "proteina", "carbohidratos", "grasas", "aguaMl"}, "tiposDia": [...], "semana": {...}}
   - Cada tipo de día: {"id": "entreno", "nombre": "Día de entreno", "kcal", "proteina", "carbohidratos", "grasas", "aguaMl" (opcional, sustituye al objetivo general), "notas", "comidas": [{"nombre": "Desayuno", "hora": "08:00", "notas", "alimentos": [{"nombre": "Copos de avena", "cantidad": 70, "unidad": "g", "categoria": "Despensa", "notas"}]}]}
   - "semana" asigna un tipo de día a cada día de la semana (igual que en la rutina). Si solo hay un tipo de día puede omitirse.
   - Cantidades por ración y en crudo; unidades: "g", "ml" o "ud". La lista de la compra suma por nombre+unidad, así que usa nombres idénticos para el mismo alimento.
   - Categorías recomendadas (agrupan la lista de la compra): "Carnes y pescados", "Huevos y lácteos", "Frutas y verduras", "Despensa", "Panadería", "Congelados", "Suplementos", "Otros".
5. "hitos": [{"fecha", "tipo", "titulo", "nota"}] con tipo en: "fotos", "pesaje", "perimetros", "revision", "inicio", "fin", "otro". Se añaden a los existentes (los de inicio/fin de rutina se generan solos).
6. "hitosRecurrentes": [{"tipo", "titulo", "cadaDias", "desde", "hasta" (opcional)}]. Si se incluye, SUSTITUYE a todos los recurrentes anteriores (p. ej. pesaje cada 7 días, perímetros cada 14, fotos cada 28).
7. Antes de entregar el plan, explica brevemente al usuario qué cambias y por qué.`;

/** Plan de ejemplo (torso/pierna 4 días + dieta de recomposición), empezando en `start` (lunes). */
export function examplePlan(start) {
  const ej = (nombre, series, reps, descansoSeg, extra = {}) => ({ nombre, series, reps, descansoSeg, ...extra });
  const al = (nombre, cantidad, unidad, categoria) => ({ nombre, cantidad, unidad, categoria });
  return {
    tipo: 'fitcoach-plan',
    version: 1,
    mensaje: 'Plan de ejemplo para que explores la app. Exporta tu progreso y pide a Claude tu plan personalizado.',
    rutina: {
      nombre: 'Torso / Pierna 4 días (ejemplo)',
      fechaInicio: start,
      fechaFin: addDays(start, 8 * 7 - 1),
      notas: 'Progresión doble: cuando completes todas las series en el tope del rango de repeticiones, sube el peso.',
      sesiones: [
        {
          id: 'torsoA', nombre: 'Torso A', calentamiento: '5 min de cardio suave + 2 series de aproximación',
          ejercicios: [
            ej('Press banca', 4, '6-8', 150, { rir: '2' }),
            ej('Remo con barra', 4, '8-10', 120, { rir: '2' }),
            ej('Press militar con mancuernas', 3, '8-10', 90),
            ej('Jalón al pecho', 3, '10-12', 90),
            ej('Elevaciones laterales', 3, '12-15', 60, { superserie: 'A' }),
            ej('Curl de bíceps con barra', 3, '10-12', 60, { superserie: 'A' }),
            ej('Extensión de tríceps en polea', 3, '10-12', 60),
          ],
        },
        {
          id: 'piernaA', nombre: 'Pierna A',
          ejercicios: [
            ej('Sentadilla trasera', 4, '6-8', 180, { rir: '2' }),
            ej('Peso muerto rumano', 3, '8-10', 150),
            ej('Prensa de piernas', 3, '10-12', 120),
            ej('Curl femoral tumbado', 3, '10-12', 90),
            ej('Elevación de gemelos de pie', 4, '12-15', 60),
            ej('Plancha abdominal', 3, '45 s', 60),
          ],
        },
        {
          id: 'torsoB', nombre: 'Torso B',
          ejercicios: [
            ej('Press inclinado con mancuernas', 4, '8-10', 120),
            ej('Dominadas', 4, '6-10', 120),
            ej('Fondos en paralelas', 3, '8-12', 90),
            ej('Remo en polea baja', 3, '10-12', 90),
            ej('Face pull', 3, '12-15', 60),
            ej('Curl martillo', 3, '10-12', 60),
          ],
        },
        {
          id: 'piernaB', nombre: 'Pierna B',
          ejercicios: [
            ej('Peso muerto', 3, '5', 180, { rir: '2' }),
            ej('Sentadilla búlgara', 3, '8-10', 90, { notas: 'Repeticiones por pierna' }),
            ej('Hip thrust', 3, '8-12', 120),
            ej('Extensión de cuádriceps', 3, '12-15', 60),
            ej('Gemelos sentado', 3, '15-20', 60),
            ej('Rueda abdominal', 3, '10-12', 60),
          ],
        },
      ],
      semana: { lunes: 'torsoA', martes: 'piernaA', miercoles: null, jueves: 'torsoB', viernes: 'piernaB', sabado: null, domingo: null },
    },
    dieta: {
      nombre: 'Recomposición ~2300 kcal (ejemplo)',
      fechaInicio: start,
      objetivos: { kcal: 2300, proteina: 170, carbohidratos: 230, grasas: 70, aguaMl: 3000 },
      notas: 'Cantidades en crudo. Las verduras pueden variarse libremente.',
      tiposDia: [
        {
          id: 'entreno', nombre: 'Día de entreno', kcal: 2450, proteina: 175, carbohidratos: 270, grasas: 70,
          comidas: [
            { nombre: 'Desayuno', hora: '08:00', alimentos: [al('Copos de avena', 70, 'g', 'Despensa'), al('Leche semidesnatada', 250, 'ml', 'Huevos y lácteos'), al('Plátano', 1, 'ud', 'Frutas y verduras'), al('Proteína whey', 30, 'g', 'Suplementos')] },
            { nombre: 'Comida', hora: '14:00', alimentos: [al('Arroz basmati', 90, 'g', 'Despensa'), al('Pechuga de pollo', 180, 'g', 'Carnes y pescados'), al('Verduras variadas', 200, 'g', 'Frutas y verduras'), al('Aceite de oliva virgen extra', 10, 'ml', 'Despensa')] },
            { nombre: 'Merienda', hora: '17:30', alimentos: [al('Yogur griego natural', 170, 'g', 'Huevos y lácteos'), al('Nueces', 20, 'g', 'Despensa'), al('Arándanos', 80, 'g', 'Frutas y verduras')] },
            { nombre: 'Cena', hora: '21:00', alimentos: [al('Salmón', 160, 'g', 'Carnes y pescados'), al('Patata', 250, 'g', 'Frutas y verduras'), al('Ensalada mixta', 150, 'g', 'Frutas y verduras'), al('Aceite de oliva virgen extra', 10, 'ml', 'Despensa')] },
          ],
        },
        {
          id: 'descanso', nombre: 'Día de descanso', kcal: 2100, proteina: 165, carbohidratos: 170, grasas: 75,
          comidas: [
            { nombre: 'Desayuno', hora: '08:30', alimentos: [al('Huevos', 3, 'ud', 'Huevos y lácteos'), al('Pan integral', 60, 'g', 'Panadería'), al('Tomate', 100, 'g', 'Frutas y verduras'), al('Aceite de oliva virgen extra', 5, 'ml', 'Despensa')] },
            { nombre: 'Comida', hora: '14:00', alimentos: [al('Ternera magra', 170, 'g', 'Carnes y pescados'), al('Quinoa', 60, 'g', 'Despensa'), al('Brócoli', 200, 'g', 'Frutas y verduras'), al('Aceite de oliva virgen extra', 10, 'ml', 'Despensa')] },
            { nombre: 'Merienda', hora: '17:30', alimentos: [al('Queso fresco batido 0%', 250, 'g', 'Huevos y lácteos'), al('Fresas', 150, 'g', 'Frutas y verduras')] },
            { nombre: 'Cena', hora: '21:00', alimentos: [al('Merluza', 200, 'g', 'Carnes y pescados'), al('Calabacín', 200, 'g', 'Frutas y verduras'), al('Aguacate', 60, 'g', 'Frutas y verduras')] },
          ],
        },
      ],
      semana: { lunes: 'entreno', martes: 'entreno', miercoles: 'descanso', jueves: 'entreno', viernes: 'entreno', sabado: 'descanso', domingo: 'descanso' },
    },
    hitos: [
      { fecha: start, tipo: 'fotos', titulo: 'Fotos iniciales' },
    ],
    hitosRecurrentes: [
      { tipo: 'pesaje', titulo: 'Pesaje en ayunas', cadaDias: 7, desde: start },
      { tipo: 'perimetros', titulo: 'Perímetros', cadaDias: 14, desde: start },
      { tipo: 'fotos', titulo: 'Fotos de progreso', cadaDias: 28, desde: addDays(start, 28) },
      { tipo: 'revision', titulo: 'Exportar progreso a Claude', cadaDias: 14, desde: addDays(start, 13) },
    ],
  };
}

/** Texto para iniciar la conversación con Claude desde cero (Ajustes → Copiar instrucciones). */
export function firstMessage(profile) {
  const p = profile || {};
  const datos = [
    p.sexo && `sexo: ${p.sexo}`, p.nacimiento && `fecha de nacimiento: ${p.nacimiento}`,
    p.alturaCm && `altura: ${p.alturaCm} cm`, p.pesoObjetivo && `peso objetivo: ${p.pesoObjetivo} kg`,
    p.objetivo && `objetivo: ${p.objetivo}`,
  ].filter(Boolean).join('; ');
  return `Quiero que seas mi entrenador personal y nutricionista. Uso la app FitCoach para registrar entrenos, dieta, agua, peso, perímetros y fotos.${datos ? `\nMis datos: ${datos}.` : ''}
Te iré enviando exports de mi progreso. Hazme las preguntas que necesites (experiencia, material disponible, días por semana, lesiones, preferencias y alergias alimentarias) y después diseña mi plan.

${SPEC_TEXT}`;
}
