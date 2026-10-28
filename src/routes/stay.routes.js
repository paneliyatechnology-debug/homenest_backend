import { Router } from 'express';
import stayController from '../controllers/stay.controller.js';
import {
  vacateStayValidator,
} from '../validators/stay.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All stay management routes require authentication
router.use(authenticate);

/**
 * @route   GET /api/v1/stays/my-history
 * @desc    Get logged-in resident's stay timeline across multiple PGs
 * @access  Private (Resident)
 */
router.get('/my-history', stayController.getMyStays);

/**
 * @route   GET /api/v1/stays/:id
 * @desc    Get details of a specific stay record
 * @access  Private
 */
router.get('/:id', stayController.getStayById);

/**
 * @route   PUT /api/v1/stays/:id/vacate
 * @desc    Check-out / vacate resident from PG
 * @access  Private (PG Owner / Super Admin)
 */
router.put(
  '/:id/vacate',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(vacateStayValidator),
  stayController.vacateStay
);

export default router;

