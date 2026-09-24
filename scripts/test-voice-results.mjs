import assert from 'node:assert/strict';
import { joinSpeechResults } from '../src/components/ui/speechResults.ts';

const results = (...phrases) => phrases.map(transcript => ({ 0: { transcript }, isFinal: true }));

assert.equal(joinSpeechResults(results('Probando el dictado', 'Probando, el dictado funciona')),
  'Probando, el dictado funciona', 'hipótesis acumulada reemplaza la anterior');
assert.equal(joinSpeechResults(results('Descripción de foto', 'foto durante el trabajo')),
  'Descripción de foto durante el trabajo', 'solapamiento parcial no duplica palabras');
assert.equal(joinSpeechResults(results('Técnico revisó', 'tecnico reviso la unidad')),
  'tecnico reviso la unidad', 'acento distinto no duplica la frase');
assert.equal(joinSpeechResults(results('Antes', 'Durante')),
  'Antes Durante', 'frases independientes se conservan');

console.log('Dictado: 4 casos de acumulación y continuidad aprobados.');
