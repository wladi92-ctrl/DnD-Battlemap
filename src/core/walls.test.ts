import { describe, expect, it } from 'vitest';
import {
  distanceToSegment,
  movementBlocked,
  segmentsIntersect,
  sightBlocked,
  wallBlocksMovement,
  wallBlocksSight,
  type WallLike,
} from './walls';

const p = (x: number, y: number) => ({ x, y });
const c = p;
const wall = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  extra: Partial<WallLike> = {},
): WallLike => ({
  x1,
  y1,
  x2,
  y2,
  kind: 'wall',
  ...extra,
});

describe('Streckenschnitt', () => {
  it('kreuzende, parallele, berührende und kollineare Strecken', () => {
    expect(segmentsIntersect(p(0, 0), p(2, 2), p(0, 2), p(2, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(2, 0), p(0, 1), p(2, 1))).toBe(false);
    expect(segmentsIntersect(p(0, 0), p(1, 1), p(1, 1), p(2, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(2, 0), p(1, 0), p(3, 0))).toBe(true);
    expect(segmentsIntersect(p(0, 0), p(1, 0), p(2, 0), p(3, 0))).toBe(false);
  });

  it('Abstand Punkt–Strecke', () => {
    expect(distanceToSegment(p(1, 1), p(0, 0), p(2, 0))).toBe(1);
    expect(distanceToSegment(p(3, 0), p(0, 0), p(2, 0))).toBe(1);
    expect(distanceToSegment(p(0, 0), p(0, 0), p(0, 0))).toBe(0);
  });
});

describe('Kantenwände', () => {
  it('Wand auf der Kante zwischen zwei Feldern blockiert den Schritt', () => {
    const walls = [wall(1, 0, 1, 3)]; // senkrechte Linie bei x=1
    expect(movementBlocked(walls, c(0, 1), c(1, 1))).toBe(true);
    expect(movementBlocked(walls, c(0, 1), c(0, 2))).toBe(false);
    expect(movementBlocked(walls, c(1, 1), c(2, 1))).toBe(false);
  });

  it('kein Durchquetschen diagonal an einer Wandecke', () => {
    const walls = [wall(1, 0, 1, 1), wall(1, 1, 2, 1)]; // Ecke bei (1,1)
    expect(movementBlocked(walls, c(0, 0), c(1, 1))).toBe(true);
    // diagonal an einem einzelnen Wandende vorbei (Ende liegt nicht auf der Diagonale)
    expect(movementBlocked([wall(1, 0, 1, 0.5)], c(0, 1), c(1, 0))).toBe(false);
  });

  it('Türen, Fenster und Geheimtüren', () => {
    const door = wall(1, 0, 1, 1, { kind: 'door', state: 'closed' });
    expect([wallBlocksMovement(door), wallBlocksSight(door)]).toEqual([true, true]);
    const open = { ...door, state: 'open' as const };
    expect([wallBlocksMovement(open), wallBlocksSight(open)]).toEqual([false, false]);
    const locked = { ...door, state: 'locked' as const };
    expect(wallBlocksMovement(locked)).toBe(true);
    const win = wall(1, 0, 1, 1, { kind: 'window' });
    expect([wallBlocksMovement(win), wallBlocksSight(win)]).toEqual([true, false]);
    const secret = wall(1, 0, 1, 1, { kind: 'secret' });
    expect([wallBlocksMovement(secret), wallBlocksSight(secret)]).toEqual([true, true]);
  });

  it('Sichtlinie durch Fenster frei, durch Wand blockiert', () => {
    const a = p(0.5, 0.5);
    const b = p(3.5, 0.5);
    expect(sightBlocked([wall(2, 0, 2, 1, { kind: 'window' })], a, b)).toBe(false);
    expect(sightBlocked([wall(2, 0, 2, 1)], a, b)).toBe(true);
    expect(sightBlocked([wall(2, 1, 2, 2)], a, b)).toBe(false);
  });
});
