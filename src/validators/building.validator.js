import { body, param, query } from 'express-validator';
import pgService from '../services/pg.service.js';
import db from '../config/db.js';

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
    .withMessage('Building name must be between 1 and 100 characters'),
];

export const updateBuildingValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Building ID must be a valid positive integer'),

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
    .optional({ checkFalsy: true })
    .trim()
    .notEmpty()
    .withMessage('Building name cannot be empty')
    .isLength({ min: 1, max: 100 })
    .withMessage('Building name must be between 1 and 100 characters'),
];

export const buildingIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Building ID must be a valid positive integer'),
];

export default {
  listBuildingsValidator,
  createBuildingValidator,
  updateBuildingValidator,
  buildingIdParamValidator,
};
