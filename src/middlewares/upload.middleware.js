import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

// ==========================================
// UPLOAD DIRECTORIES CONFIGURATION
// ==========================================

const rooms_upload_dir = path.join(process.cwd(), 'uploads', 'rooms');
const users_upload_dir = path.join(process.cwd(), 'uploads', 'users');
const pgs_upload_dir = path.join(process.cwd(), 'uploads', 'pgs');
const documents_upload_dir = path.join(process.cwd(), 'uploads', 'documents');
const visitors_upload_dir = path.join(process.cwd(), 'uploads', 'visitors');
const branches_upload_dir = path.join(process.cwd(), 'uploads', 'branches');
const food_menu_upload_dir = path.join(process.cwd(), 'uploads', 'food_menu');
const food_feedback_upload_dir = path.join(process.cwd(), 'uploads', 'food_feedback');
const complaints_upload_dir = path.join(process.cwd(), 'uploads', 'complaints');
const staff_upload_dir = path.join(process.cwd(), 'uploads', 'staff');
const notices_upload_dir = path.join(process.cwd(), 'uploads', 'notices');
const community_upload_dir = path.join(process.cwd(), 'uploads', 'community');
const payments_upload_dir = path.join(process.cwd(), 'uploads', 'payments');

const allUploadDirs = [
  rooms_upload_dir,
  users_upload_dir,
  pgs_upload_dir,
  documents_upload_dir,
  visitors_upload_dir,
  branches_upload_dir,
  food_menu_upload_dir,
  food_feedback_upload_dir,
  complaints_upload_dir,
  staff_upload_dir,
  notices_upload_dir,
  community_upload_dir,
  payments_upload_dir,
];

// Ensure all upload directories exist on application initialization
allUploadDirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ==========================================
// REUSABLE HELPER FACTORIES
// ==========================================

/**
 * Creates a standard Multer disk storage engine for a target folder and filename prefix.
 * @param {string} uploadDir - Absolute directory path
 * @param {string} prefix - Filename prefix (e.g., 'room', 'branch')
 */
const createDiskStorage = (uploadDir, prefix) =>
  multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  });

/**
 * Creates a standard file deletion function for cleaning up files from disk.
 * @param {string} uploadDir - Target directory path
 * @param {string} label - Human-readable label for logging warnings
 */
const createDeleter = (uploadDir, label) => (filename) => {
  if (!filename) return;
  try {
    const filePath = path.join(uploadDir, path.basename(filename));
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.warn(`[Warning] Could not delete ${label}: ${filename}`, err.message);
  }
};

/**
 * Common Multer error interceptor
 */
const handleMulterError = (err, next, limitMessage = 'File size exceeds 5MB limit') => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return next(new AppError(limitMessage, HTTP_STATUS.BAD_REQUEST));
  }
  return next(err);
};

// ==========================================
// FILE TYPE FILTERS
// ==========================================

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const imageMimetypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const documentMimetypes = [...imageMimetypes, 'application/pdf'];
const noticeMimetypes = [
  ...documentMimetypes,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const fileFilter = (req, file, cb) => {
  if (imageMimetypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only JPG, PNG, and WebP images are allowed (max 5MB)', HTTP_STATUS.BAD_REQUEST), false);
  }
};

const docFilter = (req, file, cb) => {
  if (documentMimetypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only PDF, JPG, PNG, and WebP files are allowed (max 5MB)', HTTP_STATUS.BAD_REQUEST), false);
  }
};

const noticeFilter = (req, file, cb) => {
  if (noticeMimetypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new AppError('Invalid file type. Only PDF, DOC, DOCX, and JPG/PNG images are allowed (max 5MB)', HTTP_STATUS.BAD_REQUEST), false);
  }
};

// ==========================================
// MULTER INSTANCES
// ==========================================

// Room
const upload_room = multer({
  storage: createDiskStorage(rooms_upload_dir, 'room'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// User / Resident
const DOC_FIELD_NAMES = ['aadhar_card', 'address_proof', 'education_certificate', 'signature', 'agreement_file', 'agreement'];
const users_storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DOC_FIELD_NAMES.includes(file.fieldname) ? documents_upload_dir : users_upload_dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = DOC_FIELD_NAMES.includes(file.fieldname) ? `doc-${file.fieldname}` : 'user';
    cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload_user = multer({
  storage: users_storage,
  fileFilter: docFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// PG Registration
const registration_storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ['logo', 'pg_logo'].includes(file.fieldname) ? pgs_upload_dir : users_upload_dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = ['logo', 'pg_logo'].includes(file.fieldname) ? 'pg-logo' : 'user';
    cb(null, `${prefix}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload_registration = multer({
  storage: registration_storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Branch
const upload_branch = multer({
  storage: createDiskStorage(branches_upload_dir, 'branch'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Visitor
const upload_visitor = multer({
  storage: createDiskStorage(visitors_upload_dir, 'visitor'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Food Menu & Feedback
const upload_food_menu = multer({
  storage: createDiskStorage(food_menu_upload_dir, 'food'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});
const upload_food_feedback = multer({
  storage: createDiskStorage(food_feedback_upload_dir, 'feedback'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Complaints
const upload_complaints = multer({
  storage: createDiskStorage(complaints_upload_dir, 'complaint'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Notices
const upload_notice = multer({
  storage: createDiskStorage(notices_upload_dir, 'notice'),
  fileFilter: noticeFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Community
const upload_community = multer({
  storage: createDiskStorage(community_upload_dir, 'community'),
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// Payments
const upload_payment = multer({
  storage: createDiskStorage(payments_upload_dir, 'payment'),
  fileFilter: docFilter,
  limits: { fileSize: MAX_FILE_SIZE },
});

// ==========================================
// UPLOAD MIDDLEWARES
// ==========================================

export const handleRoomImageUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_room.single('image')(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Room image file size exceeds 5MB limit');
    next();
  });
};

export const handleUserPhotoUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_user.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'passport_photo', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'aadhar_card', maxCount: 1 },
    { name: 'address_proof', maxCount: 1 },
    { name: 'education_certificate', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'agreement_file', maxCount: 1 },
    { name: 'agreement', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Uploaded file size exceeds 5MB limit');

    const profileFile =
      req.files?.profile_photo?.[0] ||
      req.files?.passport_photo?.[0] ||
      req.files?.image?.[0] ||
      req.files?.photo?.[0];

    if (profileFile) {
      req.body.profile_photo = profileFile.filename;
      req.file = profileFile;
    }

    if (req.files?.aadhar_card?.[0]) req.body.aadhar_card = req.files.aadhar_card[0].filename;
    if (req.files?.address_proof?.[0]) req.body.address_proof = req.files.address_proof[0].filename;
    if (req.files?.education_certificate?.[0]) req.body.education_certificate = req.files.education_certificate[0].filename;
    if (req.files?.signature?.[0]) req.body.signature = req.files.signature[0].filename;

    const agreementFile = req.files?.agreement_file?.[0] || req.files?.agreement?.[0];
    if (agreementFile) req.body.agreement_file = agreementFile.filename;

    next();
  });
};

export const handleUserProfileUpload = handleUserPhotoUpload;
export const handleStaffPhotoUpload = handleUserPhotoUpload;

export const handlePgRegistrationUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_registration.fields([
    { name: 'profile_photo', maxCount: 1 },
    { name: 'profile_image', maxCount: 1 },
    { name: 'image', maxCount: 1 },
    { name: 'logo', maxCount: 1 },
    { name: 'pg_logo', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Uploaded file size exceeds 5MB limit');

    const profileFile =
      req.files?.profile_photo?.[0] ||
      req.files?.profile_image?.[0] ||
      req.files?.image?.[0];
    if (profileFile) req.body.profile_photo = profileFile.filename;

    const logoFile = req.files?.logo?.[0] || req.files?.pg_logo?.[0];
    if (logoFile) req.body.logo = logoFile.filename;

    next();
  });
};

export const handleBranchPhotoUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_branch.fields([
    { name: 'branch_photo', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Branch photo file size exceeds 5MB limit');
    if (req.files) {
      req.file = req.files['branch_photo']?.[0] || req.files['photo']?.[0] || req.files['image']?.[0] || null;
    }
    next();
  });
};

export const handleVisitorPhotoUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_visitor.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'visitor_photo', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Visitor photo file size exceeds 5MB limit');
    if (req.files) {
      req.file = req.files['photo']?.[0] || req.files['visitor_photo']?.[0] || req.files['image']?.[0] || null;
    }
    next();
  });
};

export const handleFoodMenuImageUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_food_menu.fields([
    { name: 'image', maxCount: 1 },
    { name: 'food_image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Food image file size exceeds 5MB limit');
    if (req.files) {
      req.file = req.files['image']?.[0] || req.files['food_image']?.[0] || req.files['photo']?.[0] || null;
    }
    next();
  });
};

export const handleFoodFeedbackImageUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_food_feedback.fields([
    { name: 'image', maxCount: 1 },
    { name: 'feedback_image', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Feedback image file size exceeds 5MB limit');
    if (req.files) {
      req.file = req.files['image']?.[0] || req.files['feedback_image']?.[0] || req.files['photo']?.[0] || null;
    }
    next();
  });
};

export const handleComplaintAttachmentsUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) {
    req.filesList = [];
    return next();
  }
  upload_complaints.fields([
    { name: 'attachments', maxCount: 5 },
    { name: 'images', maxCount: 5 },
    { name: 'photos', maxCount: 5 },
  ])(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError('Attachment file size exceeds 5MB limit', HTTP_STATUS.BAD_REQUEST));
      }
      if (err instanceof multer.MulterError && err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new AppError('Maximum 5 attachment images allowed', HTTP_STATUS.BAD_REQUEST));
      }
      return next(err);
    }
    req.filesList = req.files
      ? [...(req.files['attachments'] || []), ...(req.files['images'] || []), ...(req.files['photos'] || [])]
      : [];
    next();
  });
};

export const handleNoticeAttachmentUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_notice.fields([
    { name: 'file', maxCount: 1 },
    { name: 'attachment', maxCount: 1 },
    { name: 'document', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Notice attachment file size exceeds 5MB limit');
    if (req.files) {
      req.file = req.files['file']?.[0] || req.files['attachment']?.[0] || req.files['document']?.[0] || null;
    }
    next();
  });
};

export const handleCommunityImageUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_community.single('image')(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Photo file size cannot exceed 5MB');
    next();
  });
};

export const handlePaymentProofUpload = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  upload_payment.fields([
    { name: 'image', maxCount: 1 },
    { name: 'payment_image', maxCount: 1 },
    { name: 'receipt_image', maxCount: 1 },
    { name: 'proof', maxCount: 1 },
  ])(req, res, (err) => {
    if (err) return handleMulterError(err, next, 'Payment proof file size exceeds 5MB limit');

    const file =
      req.files?.image?.[0] ||
      req.files?.payment_image?.[0] ||
      req.files?.receipt_image?.[0] ||
      req.files?.proof?.[0];

    if (file) {
      req.file = file;
      req.body.image = file.filename;
    }
    next();
  });
};

// ==========================================
// SAFE DISK FILE DELETERS
// ==========================================

export const deleteRoomImageFile = createDeleter(rooms_upload_dir, 'room image');
export const deleteUserPhotoFile = createDeleter(users_upload_dir, 'user photo');
export const deletePgLogoFile = createDeleter(pgs_upload_dir, 'PG logo');
export const deleteDocumentFile = createDeleter(documents_upload_dir, 'document');
export const deleteBranchPhotoFile = createDeleter(branches_upload_dir, 'branch photo');
export const deleteVisitorPhotoFile = createDeleter(visitors_upload_dir, 'visitor photo');
export const deleteFoodMenuImageFile = createDeleter(food_menu_upload_dir, 'food menu image');
export const deleteFoodFeedbackImageFile = createDeleter(food_feedback_upload_dir, 'food feedback image');
export const deleteComplaintAttachmentFile = createDeleter(complaints_upload_dir, 'complaint attachment');
export const deleteStaffPhotoFile = deleteUserPhotoFile;
export const deleteNoticeAttachmentFile = createDeleter(notices_upload_dir, 'notice attachment');
export const deleteCommunityImageFile = createDeleter(community_upload_dir, 'community image');
export const deletePaymentProofFile = createDeleter(payments_upload_dir, 'payment proof file');

// ==========================================
// DEFAULT EXPORT
// ==========================================

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
  handleFoodMenuImageUpload,
  deleteFoodMenuImageFile,
  handleFoodFeedbackImageUpload,
  deleteFoodFeedbackImageFile,
  handleComplaintAttachmentsUpload,
  deleteComplaintAttachmentFile,
  handleStaffPhotoUpload,
  deleteStaffPhotoFile,
  handleNoticeAttachmentUpload,
  deleteNoticeAttachmentFile,
  handleCommunityImageUpload,
  deleteCommunityImageFile,
  handlePaymentProofUpload,
  deletePaymentProofFile,
};
