import communityService from '../services/community.service.js';
import { success, successAction } from '../utils/apiResponse.js';
import { HTTP_STATUS } from '../constants/index.js';

/**
 * Controller managing Community module:
 * - Community Feed & Posts
 * - Post Likes & Comments
 * - Community Events
 * - Resident Birthdays
 */

// ==========================================
// 1. Community Feed & Posts
// ==========================================

export const getPosts = async (req, res, next) => {
  try {
    const { posts, pagination } = await communityService.getPosts(req.user, req.query);
    return success(res, 'Community posts retrieved successfully', posts, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

export const getPostById = async (req, res, next) => {
  try {
    const post = await communityService.getPostById(req.params.id, req.user);
    return success(res, 'Community post details retrieved successfully', post);
  } catch (err) {
    next(err);
  }
};

export const createPost = async (req, res, next) => {
  try {
    const result = await communityService.createPost(req.body, req.file, req.user);
    return successAction(res, 'Post created successfully', result.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const updatePost = async (req, res, next) => {
  try {
    const result = await communityService.updatePost(req.params.id, req.body, req.file, req.user);
    return successAction(res, 'Post updated successfully', result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export const deletePost = async (req, res, next) => {
  try {
    const result = await communityService.deletePost(req.params.id, req.user);
    return successAction(res, 'Post deleted successfully', result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 2. Likes Management
// ==========================================

export const toggleLikePost = async (req, res, next) => {
  try {
    const result = await communityService.toggleLikePost(req.params.id, req.user);
    const message = result.is_liked ? 'Post liked successfully' : 'Post unliked successfully';
    return success(res, message, result);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 3. Comments Management
// ==========================================

export const getComments = async (req, res, next) => {
  try {
    const { comments, pagination } = await communityService.getComments(req.params.id, req.query);
    return success(res, 'Comments retrieved successfully', comments, HTTP_STATUS.OK, pagination);
  } catch (err) {
    next(err);
  }
};

export const addComment = async (req, res, next) => {
  try {
    const result = await communityService.addComment(req.params.id, req.body, req.user);
    return successAction(res, 'Comment added successfully', result.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const deleteComment = async (req, res, next) => {
  try {
    const result = await communityService.deleteComment(req.params.id, req.user);
    return successAction(res, 'Comment deleted successfully', result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 4. Community Events
// ==========================================

export const getEvents = async (req, res, next) => {
  try {
    const data = await communityService.getEvents(req.user, req.query);
    return success(res, 'Community events retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

export const getEventById = async (req, res, next) => {
  try {
    const event = await communityService.getEventById(req.params.id, req.user);
    return success(res, 'Community event details retrieved successfully', event);
  } catch (err) {
    next(err);
  }
};

export const createEvent = async (req, res, next) => {
  try {
    const result = await communityService.createEvent(req.body, req.file, req.user);
    return successAction(res, 'Community event created successfully', result.id, HTTP_STATUS.CREATED);
  } catch (err) {
    next(err);
  }
};

export const updateEvent = async (req, res, next) => {
  try {
    const result = await communityService.updateEvent(req.params.id, req.body, req.file, req.user);
    return successAction(res, 'Community event updated successfully', result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

export const deleteEvent = async (req, res, next) => {
  try {
    const result = await communityService.deleteEvent(req.params.id, req.user);
    return successAction(res, 'Community event deleted successfully', result.id, HTTP_STATUS.OK);
  } catch (err) {
    next(err);
  }
};

// ==========================================
// 5. Resident Birthdays
// ==========================================

export const getBirthdays = async (req, res, next) => {
  try {
    const data = await communityService.getUpcomingBirthdays(req.user, req.query);
    return success(res, 'Community birthdays retrieved successfully', data);
  } catch (err) {
    next(err);
  }
};

export default {
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost,
  toggleLikePost,
  getComments,
  addComment,
  deleteComment,
  getEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  getBirthdays,
};

