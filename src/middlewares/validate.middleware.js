import { validationResult } from 'express-validator';
import { HTTP_STATUS } from '../constants/index.js';
import { error } from '../utils/apiResponse.js';

/**
 * Middleware to execute express-validator validation chains.
 * If validation fails, responds with 422 Unprocessable Entity and field errors.
 * @param {Array} validations - Array of express-validator rules
 * @returns {import('express').RequestHandler}
 */
export const validate = (validations) => {
  return async (req, res, next) => {
    // Run all validations in parallel
    await Promise.all(validations.map((v) => v.run(req)));

    const errors = validationResult(req);
    if (errors.isEmpty()) {
      return next();
    }

    const formatted_errors = errors.array().map((err) => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value,
    }));

    return error(res, 'Validation failed', HTTP_STATUS.UNPROCESSABLE_ENTITY, formatted_errors);
  };
};

export default validate;
