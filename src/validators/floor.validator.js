import { body, param, query } from 'express-validator';
import buildingService from '../services/building.service.js';

export const listFloorsValidator = [
  query('building_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Building ID must be a positive integer'),

  query('pg_id')
    .optional({ checkFalsy: true })
    .toInt()
    .isInt({ min: 1 })
    .withMessage('PG facility ID must be a positive integer'),

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

export const createFloorValidator = [
  body('building_id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Building ID is required and must be a valid integer')
    .custom(async (building_id) => {
      const building = await buildingService.findById(building_id);
      if (!building) {
        throw new Error('Selected building does not exist');
      }
      return true;
    }),

  body('floor_number')
    .toInt()
    .isInt()
    .withMessage('Floor number is required and must be an integer (e.g. 0 for Ground, 1 for 1st)'),

  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Floor name must be between 1 and 100 characters'),
];

export const updateFloorValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Floor ID must be a valid positive integer'),

  body('floor_number')
    .optional()
    .toInt()
    .isInt()
    .withMessage('Floor number must be an integer'),

  body('name')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Floor name must be between 1 and 100 characters'),
];

export const floorIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Floor ID must be a valid positive integer'),
];

export default {
  listFloorsValidator,
  createFloorValidator,
  updateFloorValidator,
  floorIdParamValidator,
};
