import { Router } from 'express';
import agreementController from '../controllers/agreement.controller.js';
import {
  createAgreementValidator,
  updateAgreementValidator,
  agreementIdParamValidator,
} from '../validators/agreement.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All agreement routes require authentication
router.use(authenticate);

/**
 * @route   POST /api/v1/agreements
 * @desc    Create a new agreement record (matches Create New Agreement portal screen)
 * @access  Private (Admin / Super Admin)
 */
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(createAgreementValidator),
  agreementController.createAgreement
);

/**
 * @route   GET /api/v1/agreements
 * @desc    Get all agreement records (with filtering by resident, pg_id, status, search, pagination)
 * @access  Private
 */
router.get('/', agreementController.getAllAgreements);

/**
 * @route   GET /api/v1/agreements/:id
 * @desc    Get agreement record details by ID
 * @access  Private
 */
router.get('/:id', validate(agreementIdParamValidator), agreementController.getAgreementById);

/**
 * @route   PUT /api/v1/agreements/:id
 * @desc    Update agreement record
 * @access  Private (Admin / Super Admin)
 */
router.put(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(updateAgreementValidator),
  agreementController.updateAgreement
);

/**
 * @route   DELETE /api/v1/agreements/:id
 * @desc    Delete agreement record
 * @access  Private (Admin / Super Admin)
 */
router.delete(
  '/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  validate(agreementIdParamValidator),
  agreementController.deleteAgreement
);

export default router;

