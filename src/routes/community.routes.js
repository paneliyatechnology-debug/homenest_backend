import { Router } from 'express';
import communityController from '../controllers/community.controller.js';
import {
  createPostValidator,
  updatePostValidator,
  postIdParamValidator,
  commentIdParamValidator,
  listPostsQueryValidator,
  createCommentValidator,
  eventIdParamValidator,
  createEventValidator,
  updateEventValidator,
  listEventsQueryValidator,
} from '../validators/community.validator.js';
import validate from '../middlewares/validate.middleware.js';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { handleCommunityImageUpload } from '../middlewares/upload.middleware.js';
import ROLES from '../constants/roles.js';

const router = Router();

// All community routes require authentication
router.use(authenticate);

// ==========================================
// 1. Community Events (Screen 3)
// Note: Placed above /posts/:id to avoid parameter shadowing
// ==========================================

router.get(
  '/events',
  validate(listEventsQueryValidator),
  communityController.getEvents
);

router.get(
  '/events/:id',
  validate(eventIdParamValidator),
  communityController.getEventById
);

router.post(
  '/events',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  handleCommunityImageUpload,
  validate(createEventValidator),
  communityController.createEvent
);

router.put(
  '/events/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  handleCommunityImageUpload,
  validate(updateEventValidator),
  communityController.updateEvent
);

router.delete(
  '/events/:id',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN, ROLES.BRANCH_MANAGER),
  validate(eventIdParamValidator),
  communityController.deleteEvent
);

// ==========================================
// 2. Upcoming Birthdays (Filter Pill Tab)
// ==========================================

router.get('/birthdays', communityController.getBirthdays);

// ==========================================
// 3. Comments Management (Standalone Action)
// ==========================================

router.delete(
  '/comments/:id',
  validate(commentIdParamValidator),
  communityController.deleteComment
);

// ==========================================
// 4. Community Feed & Posts (Screen 1 & 2)
// ==========================================

router.get(
  '/',
  validate(listPostsQueryValidator),
  communityController.getPosts
);

router.get(
  '/posts',
  validate(listPostsQueryValidator),
  communityController.getPosts
);

router.get(
  '/posts/:id',
  validate(postIdParamValidator),
  communityController.getPostById
);

router.post(
  '/posts',
  handleCommunityImageUpload,
  validate(createPostValidator),
  communityController.createPost
);

router.put(
  '/posts/:id',
  handleCommunityImageUpload,
  validate(updatePostValidator),
  communityController.updatePost
);

router.delete(
  '/posts/:id',
  validate(postIdParamValidator),
  communityController.deletePost
);

// ==========================================
// 5. Post Interaction (Likes & Comments)
// ==========================================

router.post(
  '/posts/:id/like',
  validate(postIdParamValidator),
  communityController.toggleLikePost
);

router.get(
  '/posts/:id/comments',
  validate(postIdParamValidator),
  communityController.getComments
);

router.post(
  '/posts/:id/comments',
  validate(createCommentValidator),
  communityController.addComment
);

export default router;

