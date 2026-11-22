import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  coordinates,
  date,
  decimal,
} from '../dist/modules/resources/resource-input.js';

test('recursos conserva cadenas decimales y rechaza pérdida de precisión', () => {
  assert.equal(decimal('0.125', 3), '0.125');
  assert.equal(decimal('12.34', 2), '12.34');
  for (const invalid of [
    0.1,
    '0',
    '1.001',
    '-1',
    'NaN',
    '2e2',
    '1000000000000',
  ]) {
    assert.throws(() => decimal(invalid, 2));
  }
});

test('coordenadas como pareja y fechas sin normalización silenciosa', () => {
  assert.deepEqual(coordinates('-0.200000', '-78.100000'), {
    lat: '-0.200000',
    lon: '-78.100000',
  });
  assert.deepEqual(coordinates(undefined, undefined), { lat: null, lon: null });
  assert.throws(() => coordinates(undefined, '-50'));
  assert.throws(() => coordinates('91', '-50'));
  assert.throws(() => coordinates('0', '180.01'));
  assert.equal(date('2024-02-29'), '2024-02-29');
  assert.throws(() => date('2026-02-29'));
});
