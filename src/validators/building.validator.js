import { body, param, query } from 'express-validator';
import pgService from '../services/pg.service.js';

export const listBuildingsValidator = [
  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Branch (PG ID) must be a valid integer'),

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
