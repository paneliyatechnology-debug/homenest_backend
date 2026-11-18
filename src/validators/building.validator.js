import { body, param, query } from 'express-validator';
import pgService from '../services/pg.service.js';
import db from '../config/db.js';

export const buildingStatsQueryValidator = [
  query('branch_id')
    .optional({ checkFalsy: true })
    .custom((val) => {
      if (val === 'all' || val === 'All') return true;
      const num = Number(val);
      if (!Number.isInteger(num) || num < 1) {
        throw new Error('Branch ID must be a positive integer or "all"');
      }
      return true;
    }),

  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG ID must be a valid integer'),
];

export const listBuildingsValidator = [
  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch (PG ID) must be a valid integer'),

  query('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer'),

  query('search')
    .optional({ checkFalsy: true })
    .trim(),

  query('page')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),

  query('limit')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

export const createBuildingValidator = [
  body('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch (PG ID) must be a valid integer')
    .custom(async (pg_id) => {
      const pg = await pgService.findById(pg_id);
      if (!pg) {
        throw new Error('Selected branch (PG) does not exist');
      }
      return true;
    }),

  body('branch_id')
    .notEmpty()
    .withMessage('Branch ID is required')
    .bail()
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer')
    .custom(async (branch_id, { req }) => {
      const branch = await db('branches').where({ id: branch_id }).whereNull('deleted_at').first();
      if (!branch) {
        throw new Error('Selected branch does not exist');
      }
      const pg_id = req.body.pg_id || req.pg_id;
      if (pg_id && Number(branch.pg_id) !== Number(pg_id)) {
        throw new Error('Selected branch does not belong to this PG facility');
      }
      req.resolved_branch = branch;
      return true;
    }),

  body('name')
    .trim()
    .notEmpty()
    .withMessage('Building name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Building name must be between 1 and 100 characters')
    .custom(async (name, { req }) => {
      const branch_id = req.body.branch_id;
      if (!branch_id) return true;
      const existing = await db('buildings')
        .where({ branch_id: Number(branch_id) })
        .whereRaw('LOWER(TRIM(name)) = ?', [String(name).trim().toLowerCase()])
        .whereNull('deleted_at')
        .first();
      if (existing) {
        throw new Error(`Building '${name.trim()}' already exists in this branch`);
      }
      return true;
    }),

  body('total_floors')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1, max: 100 })
    .withMessage('Total floors must be between 1 and 100'),

  body('starting_floor')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 0, max: 1 })
    .withMessage('Starting floor must be 0 (Ground) or 1'),

  body('floors')
    .optional()
    .isArray()
    .withMessage('Floors must be an array of floor definitions')
    .custom((floors) => {
      if (!Array.isArray(floors)) return true;
      const seenNames = new Set();
      const seenNumbers = new Set();
      for (const f of floors) {
        if (!f || typeof f !== 'object') continue;
        if (f.name && String(f.name).trim()) {
          const norm = String(f.name).trim().toLowerCase();
          if (seenNames.has(norm)) {
            throw new Error(`Floor name '${String(f.name).trim()}' cannot be duplicated in the same building`);
          }
          seenNames.add(norm);
        }
        if (f.floor_number !== undefined && f.floor_number !== null && f.floor_number !== '') {
          const num = Number(f.floor_number);
          if (!isNaN(num)) {
            if (seenNumbers.has(num)) {
              throw new Error(`Floor number '${num}' cannot be duplicated in the same building`);
            }
            seenNumbers.add(num);
          }
        }
      }
      return true;
    }),

  body('floors.*.floor_number')
    .optional()
    .toInt()
    .isInt({ min: 0, max: 100 })
    .withMessage('Floor number must be between 0 and 100'),

  body('floors.*.name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Floor name must be between 1 and 100 characters'),
];

export const updateBuildingValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Building ID must be a valid positive integer'),

  body('branch_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch ID must be a positive integer')
    .custom(async (branch_id, { req }) => {
      const branch = await db('branches').where({ id: branch_id }).whereNull('deleted_at').first();
      if (!branch) {
        throw new Error('Selected branch does not exist');
      }
      const pg_id = req.body.pg_id || req.pg_id;
      if (pg_id && Number(branch.pg_id) !== Number(pg_id)) {
        throw new Error('Selected branch does not belong to this PG facility');
      }
      req.resolved_branch = branch;
      return true;
    }),

  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage('Building name cannot be empty')
    .isLength({ min: 1, max: 100 })
    .withMessage('Building name must be between 1 and 100 characters')
    .custom(async (name, { req }) => {
      const buildingId = req.params.id;
      const currentBuilding = await db('buildings').where({ id: buildingId }).whereNull('deleted_at').first();
      if (!currentBuilding) return true;
      const branch_id = req.body.branch_id !== undefined ? Number(req.body.branch_id) : currentBuilding.branch_id;
      const existing = await db('buildings')
        .where({ branch_id })
        .whereRaw('LOWER(TRIM(name)) = ?', [String(name).trim().toLowerCase()])
        .whereNull('deleted_at')
        .whereNot({ id: buildingId })
        .first();
      if (existing) {
        throw new Error(`Building '${name.trim()}' already exists in this branch`);
      }
      return true;
    }),

  body('total_floors')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1, max: 100 })
    .withMessage('Total floors must be between 1 and 100'),

  body('floors')
    .optional()
    .isArray()
    .withMessage('Floors must be an array of floor definitions')
    .custom((floors) => {
      if (!Array.isArray(floors)) return true;
      const seenNames = new Set();
      const seenNumbers = new Set();
      for (const f of floors) {
        if (!f || typeof f !== 'object') continue;
        if (f.name && String(f.name).trim()) {
          const norm = String(f.name).trim().toLowerCase();
          if (seenNames.has(norm)) {
            throw new Error(`Floor name '${String(f.name).trim()}' cannot be duplicated in the same building`);
          }
          seenNames.add(norm);
        }
        if (f.floor_number !== undefined && f.floor_number !== null && f.floor_number !== '') {
          const num = Number(f.floor_number);
          if (!isNaN(num)) {
            if (seenNumbers.has(num)) {
              throw new Error(`Floor number '${num}' cannot be duplicated in the same building`);
            }
            seenNumbers.add(num);
          }
        }
      }
      return true;
    }),

  body('floors.*.id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Floor ID must be a positive integer'),

  body('floors.*.floor_number')
    .optional()
    .toInt()
    .isInt({ min: 0, max: 100 })
    .withMessage('Floor number must be between 0 and 100'),

  body('floors.*.name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Floor name must be between 1 and 100 characters'),
];

export const buildingIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Building ID must be a valid positive integer'),
];

export default {
  buildingStatsQueryValidator,
  listBuildingsValidator,
  createBuildingValidator,
  updateBuildingValidator,
  buildingIdParamValidator,
};
