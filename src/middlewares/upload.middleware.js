import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

const rooms_upload_dir = path.join(process.cwd(), 'uploads', 'rooms');
const users_upload_dir = path.join(process.cwd(), 'uploads', 'users');
const pgs_upload_dir = path.join(process.cwd(), 'uploads', 'pgs');
const documents_upload_dir = path.join(process.cwd(), 'uploads', 'documents');
const visitors_upload_dir = path.join(process.cwd(), 'uploads', 'visitors');
const branches_upload_dir = path.join(process.cwd(), 'uploads', 'branches');

// Ensure upload directories exist
[rooms_upload_dir, users_upload_dir, pgs_upload_dir, documents_upload_dir, visitors_upload_dir, branches_upload_dir].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Allowed mimetypes
const allowed_mimetypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const allowed_user_and_doc_mimetypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];

const file_filter = (req, file, cb) => {
  if (allowed_mimetypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(
      new AppError(
        'Invalid file type. Only JPG, PNG, and WebP images are allowed (max 5MB)',
        HTTP_STATUS.BAD_REQUEST
      ),
      false
    );
  }
};

// Rooms storage
const rooms_storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, rooms_upload_dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique_name = `room-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique_name);
  },
});

// Users/Residents profile & documents storage
const users_storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (['aadhar_card', 'address_proof', 'education_certificate', 'signature'].includes(file.fieldname)) {
      cb(null, documents_upload_dir);
    } else {
      cb(null, users_upload_dir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = ['aadhar_card', 'address_proof', 'education_certificate', 'signature'].includes(file.fieldname)
      ? `doc-${file.fieldname}`
      : 'user';
    const unique_name = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique_name);
  },
});

const upload_room = multer({
  storage: rooms_storage,
  fileFilter: file_filter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

const upload_user = multer({
  storage: users_storage,
  fileFilter: (req, file, cb) => {
    if (allowed_user_and_doc_mimetypes.includes(file.mimetype.toLowerCase())) {
      cb(null, true);
    } else {
      cb(
        new AppError(
          'Invalid file type. Only PDF, JPG, PNG, and WebP files are allowed (max 5MB)',
          HTTP_STATUS.BAD_REQUEST
        ),
        false
      );
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// PG Registration storage supporting both owner profile photo and PG logo
const registration_storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (['logo', 'pg_logo'].includes(file.fieldname)) {
      cb(null, pgs_upload_dir);
    } else {
      cb(null, users_upload_dir);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = ['logo', 'pg_logo'].includes(file.fieldname) ? 'pg-logo' : 'user';
    const unique_name = `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique_name);
  },
});

const upload_registration = multer({
  storage: registration_storage,
  fileFilter: file_filter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per file
});

/**
 * Middleware for room image upload.
 * Seamlessly handles multipart/form-data or JSON payloads.
 * Image is completely optional.
 */
export const handleRoomImageUpload = (req, res, next) => {
  const content_type = req.headers['content-type'] || '';
  if (content_type.startsWith('multipart/form-data')) {
    upload_room.single('image')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('Room image file size exceeds 5MB limit', HTTP_STATUS.BAD_REQUEST));
        }
        return next(err);
      }
      next();
    });
  } else {
    next();
  }
};

/**
 * Middleware for user/resident profile photo and documents upload.
 * Seamlessly handles multipart/form-data with fields:
 * - 'profile_photo', 'passport_photo', 'image' (saved to uploads/users/)
 * - 'aadhar_card', 'address_proof', 'education_certificate', 'signature' (saved to uploads/documents/)
 * Files are optional. Also seamlessly supports JSON bodies.
 */
export const handleUserPhotoUpload = (req, res, next) => {
  const content_type = req.headers['content-type'] || '';
  if (content_type.startsWith('multipart/form-data')) {
    upload_user.fields([
      { name: 'profile_photo', maxCount: 1 },
      { name: 'passport_photo', maxCount: 1 },
      { name: 'image', maxCount: 1 },
      { name: 'aadhar_card', maxCount: 1 },
      { name: 'address_proof', maxCount: 1 },
      { name: 'education_certificate', maxCount: 1 },
      { name: 'signature', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('Uploaded file size exceeds 5MB limit', HTTP_STATUS.BAD_REQUEST));
        }
        return next(err);
      }
      if (req.files?.profile_photo?.[0]) {
        req.body.profile_photo = req.files.profile_photo[0].filename;
        req.file = req.files.profile_photo[0];
      } else if (req.files?.passport_photo?.[0]) {
        req.body.profile_photo = req.files.passport_photo[0].filename;
        req.file = req.files.passport_photo[0];
      } else if (req.files?.image?.[0]) {
        req.body.profile_photo = req.files.image[0].filename;
        req.file = req.files.image[0];
      }

      if (req.files?.aadhar_card?.[0]) {
        req.body.aadhar_card = req.files.aadhar_card[0].filename;
      }
      if (req.files?.address_proof?.[0]) {
        req.body.address_proof = req.files.address_proof[0].filename;
      }
      if (req.files?.education_certificate?.[0]) {
        req.body.education_certificate = req.files.education_certificate[0].filename;
      }
      if (req.files?.signature?.[0]) {
        req.body.signature = req.files.signature[0].filename;
      }

      next();
    });
  } else {
    next();
  }
};

export const handleUserProfileUpload = handleUserPhotoUpload;

/**
 * Middleware for PG Owner + PG Registration upload.
 * Seamlessly handles multipart/form-data for:
 * - Owner profile image: 'profile_photo', 'profile_image', or 'image' (saved to uploads/users/)
 * - PG logo: 'logo' or 'pg_logo' (saved to uploads/pgs/)
 * Both files are completely optional. Also seamlessly supports JSON bodies.
 */
export const handlePgRegistrationUpload = (req, res, next) => {
  const content_type = req.headers['content-type'] || '';
  if (content_type.startsWith('multipart/form-data')) {
    upload_registration.fields([
      { name: 'profile_photo', maxCount: 1 },
      { name: 'profile_image', maxCount: 1 },
      { name: 'image', maxCount: 1 },
      { name: 'logo', maxCount: 1 },
      { name: 'pg_logo', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('Uploaded file size exceeds 5MB limit', HTTP_STATUS.BAD_REQUEST));
        }
        return next(err);
      }

      // Map owner profile photo
      if (req.files?.profile_photo?.[0]) {
        req.body.profile_photo = req.files.profile_photo[0].filename;
      } else if (req.files?.profile_image?.[0]) {
        req.body.profile_photo = req.files.profile_image[0].filename;
      } else if (req.files?.image?.[0]) {
        req.body.profile_photo = req.files.image[0].filename;
      }

      // Map PG logo
      if (req.files?.logo?.[0]) {
        req.body.logo = req.files.logo[0].filename;
      } else if (req.files?.pg_logo?.[0]) {
        req.body.logo = req.files.pg_logo[0].filename;
      }

      next();
    });
  } else {
    next();
  }
};

/**
 * Delete a local room image file safely
 * @param {string|null} filename
 */
export const deleteRoomImageFile = (filename) => {
  if (!filename) return;
  try {
    const file_path = path.join(rooms_upload_dir, path.basename(filename));
    if (fs.existsSync(file_path)) {
      fs.unlinkSync(file_path);
    }
  } catch (err) {
    console.warn(`[Warning] Could not delete room image: ${filename}`, err.message);
  }
};

/**
 * Delete a local user profile photo safely
 * @param {string|null} filename
 */
export const deleteUserPhotoFile = (filename) => {
  if (!filename) return;
  try {
    const file_path = path.join(users_upload_dir, path.basename(filename));
    if (fs.existsSync(file_path)) {
      fs.unlinkSync(file_path);
    }
  } catch (err) {
    console.warn(`[Warning] Could not delete user photo: ${filename}`, err.message);
  }
};

/**
 * Delete a local PG logo file safely
 * @param {string|null} filename
 */
export const deletePgLogoFile = (filename) => {
  if (!filename) return;
  try {
    const file_path = path.join(pgs_upload_dir, path.basename(filename));
    if (fs.existsSync(file_path)) {
      fs.unlinkSync(file_path);
    }
  } catch (err) {
    console.warn(`[Warning] Could not delete PG logo: ${filename}`, err.message);
  }
};

/**
 * Delete a local uploaded document safely
 * @param {string|null} filename
 */
export const deleteDocumentFile = (filename) => {
  if (!filename) return;
  try {
    const file_path = path.join(documents_upload_dir, path.basename(filename));
    if (fs.existsSync(file_path)) {
      fs.unlinkSync(file_path);
    }
  } catch (err) {
    console.warn(`[Warning] Could not delete document: ${filename}`, err.message);
  }
};

// Visitors photo storage
const visitors_storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, visitors_upload_dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique_name = `visitor-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique_name);
  },
});

const upload_visitor = multer({
  storage: visitors_storage,
  fileFilter: file_filter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Branches photo storage
const branches_storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, branches_upload_dir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique_name = `branch-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, unique_name);
  },
});

const upload_branch = multer({
  storage: branches_storage,
  fileFilter: file_filter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

/**
 * Middleware for branch photo upload.
 * Seamlessly handles multipart/form-data with field 'branch_photo', 'photo', or 'image'.
 * Also supports JSON payloads. Photo is optional.
 */
export const handleBranchPhotoUpload = (req, res, next) => {
  const content_type = req.headers['content-type'] || '';
  if (content_type.startsWith('multipart/form-data')) {
    upload_branch.fields([
      { name: 'branch_photo', maxCount: 1 },
      { name: 'photo', maxCount: 1 },
      { name: 'image', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('Branch photo file size exceeds 5MB limit', HTTP_STATUS.BAD_REQUEST));
        }
        return next(err);
      }
      if (req.files) {
        req.file = req.files['branch_photo']?.[0] || req.files['photo']?.[0] || req.files['image']?.[0] || null;
      }
      next();
    });
  } else {
    next();
  }
};

/**
 * Delete a local branch photo file safely
 * @param {string|null} filename
 */
export const deleteBranchPhotoFile = (filename) => {
  if (!filename) return;
  try {
    const file_path = path.join(branches_upload_dir, path.basename(filename));
    if (fs.existsSync(file_path)) {
      fs.unlinkSync(file_path);
    }
  } catch (err) {
    console.warn(`[Warning] Could not delete branch photo: ${filename}`, err.message);
  }
};

/**
 * Middleware for visitor photo upload.
 * Seamlessly handles multipart/form-data with field 'photo', 'visitor_photo', or 'image'.
 * Also supports JSON payloads. Photo is optional.
 */
export const handleVisitorPhotoUpload = (req, res, next) => {
  const content_type = req.headers['content-type'] || '';
  if (content_type.startsWith('multipart/form-data')) {
    upload_visitor.fields([
      { name: 'photo', maxCount: 1 },
      { name: 'visitor_photo', maxCount: 1 },
      { name: 'image', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          return next(new AppError('Visitor photo file size exceeds 5MB limit', HTTP_STATUS.BAD_REQUEST));
        }
        return next(err);
      }
      if (req.files) {
        req.file = req.files['photo']?.[0] || req.files['visitor_photo']?.[0] || req.files['image']?.[0] || null;
      }
      next();
    });
  } else {
    next();
  }
};

/**
 * Delete a local visitor photo file safely
 * @param {string|null} filename
 */
export const deleteVisitorPhotoFile = (filename) => {
  if (!filename) return;
  try {
    const file_path = path.join(visitors_upload_dir, path.basename(filename));
    if (fs.existsSync(file_path)) {
      fs.unlinkSync(file_path);
    }
  } catch (err) {
    console.warn(`[Warning] Could not delete visitor photo: ${filename}`, err.message);
  }
};

export default {
  handleRoomImageUpload,
  handleUserPhotoUpload,
  handleUserProfileUpload,
  handlePgRegistrationUpload,
  handleVisitorPhotoUpload,
  handleBranchPhotoUpload,
  deleteRoomImageFile,
  deleteUserPhotoFile,
  deletePgLogoFile,
  deleteDocumentFile,
  deleteVisitorPhotoFile,
  deleteBranchPhotoFile,
};
