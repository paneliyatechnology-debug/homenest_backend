import { body, param } from 'express-validator';
import buildingService from '../services/building.service.js';

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

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be either active or inactive'),
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

  body('status')
    .optional({ checkFalsy: true })
    .trim()
    .toLowerCase()
    .isIn(['active', 'inactive'])
    .withMessage('Status must be either active or inactive'),
];

export const floorIdParamValidator = [
  param('id')
    .toInt()
    .isInt({ min: 1 })
    .withMessage('Floor ID must be a valid positive integer'),
];

export default {
  createFloorValidator,
  updateFloorValidator,
  floorIdParamValidator,
};

