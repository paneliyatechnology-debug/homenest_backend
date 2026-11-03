import moment from 'moment';
import db from '../config/db.js';
import { AppError } from '../utils/apiResponse.js';
import { HTTP_STATUS, ROLES } from '../constants/index.js';
import { buildFileUrl } from '../utils/url.js';
import { deleteCommunityImageFile } from '../middlewares/upload.middleware.js';
import socketService, { SOCKET_EVENTS } from './socket.service.js';

/**
 * Service managing Community Module:
 * - Community Feed & Posts
 * - Likes & Comments
 * - Community Events (Ongoing, Upcoming, Past)
 * - Resident Birthdays
 */
class CommunityService {
  /**
   * Helper: Format relative time string e.g. "3h ago", "2m ago", "1d ago"
   * @param {Date|string} date
   * @returns {string} Relative time
   */
  formatTimeAgo = (date) => {
    if (!date) return '-';
    const now = moment();
    const then = moment(date);
    const diffMinutes = now.diff(then, 'minutes');
    const diffHours = now.diff(then, 'hours');
    const diffDays = now.diff(then, 'days');

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return then.format('DD MMM');
  };

  /**
   * Helper: Format event date and time string e.g. "24 March 2026 • 10:30 AM"
   * @param {Date|string} date
   * @returns {string} Formatted date/time
   */
  formatEventDateTime = (date) => {
    if (!date) return '';
    return moment(date).format('DD MMMM YYYY • hh:mm A');
  };

  /**
   * Helper: Resolve Tenant PG and Branch scope
   * @param {Object} user
   * @returns {Promise<{ pgId: number, branchId: number|null }>}
   */
  resolveUserScope = async (user) => {
    if (user.role === ROLES.RESIDENT) {
      const activeStay = await db('resident_pg_stays')
        .where('resident_pg_stays.resident_id', user.id)
        .where('resident_pg_stays.status', 'active')
        .whereNull('resident_pg_stays.deleted_at')
        .first();

      const pgId = activeStay?.pg_id || user.pg_id || 1;
      const branchId = activeStay?.branch_id || user.branch_id || null;
      return { pgId: Number(pgId), branchId: branchId ? Number(branchId) : null };
    }

    if (user.role === ROLES.SUPER_ADMIN) {
      const firstPg = await db('pgs').whereNull('deleted_at').orderBy('id', 'asc').first();
      return { pgId: user.pg_id ? Number(user.pg_id) : (firstPg?.id || 1), branchId: null };
    }

    // Admin / Branch Manager
    let pg = await db('pgs').where({ owner_id: user.id }).whereNull('deleted_at').first();
    if (!pg && user.pg_id) {
      pg = await db('pgs').where({ id: user.pg_id }).whereNull('deleted_at').first();
    }
    if (!pg) {
      const staffBranch = await db('user_branches').where({ user_id: user.id }).first();
      if (staffBranch) {
        const branch = await db('branches').where({ id: staffBranch.branch_id }).first();
        if (branch) pg = { id: branch.pg_id };
      }
    }
    if (!pg) {
      throw new AppError('No PG property associated with this account', HTTP_STATUS.BAD_REQUEST);
    }

    return { pgId: Number(pg.id), branchId: null };
  };

  /**
   * Helper: Resolve author's room number for community posts & comments
   * @param {number} userId
   * @param {number} pgId
   * @returns {Promise<string|null>} Room number or null
   */
  resolveUserRoomNo = async (userId, pgId) => {
    const stay = await db('resident_pg_stays')
      .where('resident_pg_stays.resident_id', userId)
      .where('resident_pg_stays.pg_id', pgId)
      .where('resident_pg_stays.status', 'active')
      .whereNull('resident_pg_stays.deleted_at')
      .leftJoin('rooms', 'resident_pg_stays.room_id', 'rooms.id')
      .select('rooms.room_no')
      .first();

    return stay?.room_no || null;
  };

  // ==========================================
  // 1. Community Feed & Posts
  // ==========================================

  /**
   * List community posts with filtering by category (All, Updates, Events, Birthdays)
   *
   * @param {Object} user - Authenticated user
   * @param {Object} query - Filter & pagination query
   * @returns {Promise<{ posts: Array, pagination: Object }>}
   */
  getPosts = async (user, query = {}) => {
    const { pgId } = await this.resolveUserScope(user);
    const page = Math.max(1, parseInt(query.page || 1, 10));
    const limit = Math.max(1, Math.min(100, parseInt(query.limit || 10, 10)));
    const offset = (page - 1) * limit;

    const baseQuery = db('community_posts')
      .where('community_posts.pg_id', pgId)
      .whereNull('community_posts.deleted_at');

    // Filter pill / category handling
    const category = (query.category || '').toLowerCase().trim();
    if (category && category !== 'all') {
      if (category === 'updates' || category === 'update') {
        baseQuery.where('community_posts.category', 'update');
      } else if (category === 'events' || category === 'event') {
        baseQuery.where('community_posts.category', 'event');
      } else if (category === 'birthdays' || category === 'birthday') {
        baseQuery.where('community_posts.category', 'birthday');
      } else {
        baseQuery.where('community_posts.category', category);
      }
    }

    // Text search in post content
    if (query.search && query.search.trim()) {
      baseQuery.whereILike('community_posts.content', `%${query.search.trim()}%`);
    }

    // Branch filter if provided
    if (query.branch_id) {
      baseQuery.where('community_posts.branch_id', Number(query.branch_id));
    }

    // Count total records
    const countRes = await baseQuery.clone().count('community_posts.id as total').first();
    const totalRecords = parseInt(countRes?.total || 0, 10);
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    // Fetch posts
    const rows = await baseQuery.clone()
      .leftJoin('users', 'community_posts.user_id', 'users.id')
      .leftJoin('resident_pg_stays', function () {
        this.on('community_posts.user_id', '=', 'resident_pg_stays.resident_id')
          .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
          .andOnNull('resident_pg_stays.deleted_at');
      })
      .leftJoin('rooms', 'resident_pg_stays.room_id', 'rooms.id')
      .leftJoin('community_post_likes', function () {
        this.on('community_posts.id', '=', 'community_post_likes.post_id')
          .andOn('community_post_likes.user_id', '=', db.raw('?', [user.id]));
      })
      .select(
        'community_posts.*',
        'users.name as author_name',
        'users.profile_photo as author_photo',
        'users.role as author_role',
        'rooms.room_no as author_room_no',
        db.raw('CASE WHEN community_post_likes.id IS NOT NULL THEN 1 ELSE 0 END as is_liked')
      )
      .orderBy('community_posts.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    const posts = rows.map((post) => {
      const roomSubtitle = post.author_room_no ? `${post.author_room_no} • ` : '';
      return {
        id: post.id,
        author: {
          id: post.user_id,
          name: post.author_name || 'HomeNest Member',
          room_no: post.author_room_no || null,
          role: post.author_role || 'resident',
          subtitle: `${roomSubtitle}${this.formatTimeAgo(post.created_at)}`,
          profile_photo_url: post.author_photo ? buildFileUrl('users', post.author_photo) : null,
        },
        content: post.content,
        image_url: post.image ? buildFileUrl('community', post.image) : null,
        category: post.category,
        likes_count: Number(post.likes_count || 0),
        comments_count: Number(post.comments_count || 0),
        is_liked: Boolean(post.is_liked),
        time_ago: this.formatTimeAgo(post.created_at),
        created_at: post.created_at,
        updated_at: post.updated_at,
      };
    });

    return {
      posts,
      pagination: {
        page,
        limit,
        total_records: totalRecords,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    };
  };

  /**
   * Get single post by ID
   *
   * @param {number} postId
   * @param {Object} user
   * @returns {Promise<Object>} Post detail
   */
  getPostById = async (postId, user) => {
    const { pgId } = await this.resolveUserScope(user);

    const post = await db('community_posts')
      .where('community_posts.id', postId)
      .where('community_posts.pg_id', pgId)
      .whereNull('community_posts.deleted_at')
      .leftJoin('users', 'community_posts.user_id', 'users.id')
      .leftJoin('resident_pg_stays', function () {
        this.on('community_posts.user_id', '=', 'resident_pg_stays.resident_id')
          .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
          .andOnNull('resident_pg_stays.deleted_at');
      })
      .leftJoin('rooms', 'resident_pg_stays.room_id', 'rooms.id')
      .leftJoin('community_post_likes', function () {
        this.on('community_posts.id', '=', 'community_post_likes.post_id')
          .andOn('community_post_likes.user_id', '=', db.raw('?', [user.id]));
      })
      .select(
        'community_posts.*',
        'users.name as author_name',
        'users.profile_photo as author_photo',
        'users.role as author_role',
        'rooms.room_no as author_room_no',
        db.raw('CASE WHEN community_post_likes.id IS NOT NULL THEN 1 ELSE 0 END as is_liked')
      )
      .first();

    if (!post) {
      throw new AppError('Community post not found', HTTP_STATUS.NOT_FOUND);
    }

    const roomSubtitle = post.author_room_no ? `${post.author_room_no} • ` : '';

    return {
      id: post.id,
      author: {
        id: post.user_id,
        name: post.author_name || 'HomeNest Member',
        room_no: post.author_room_no || null,
        role: post.author_role || 'resident',
        subtitle: `${roomSubtitle}${this.formatTimeAgo(post.created_at)}`,
        profile_photo_url: post.author_photo ? buildFileUrl('users', post.author_photo) : null,
      },
      content: post.content,
      image_url: post.image ? buildFileUrl('community', post.image) : null,
      category: post.category,
      likes_count: Number(post.likes_count || 0),
      comments_count: Number(post.comments_count || 0),
      is_liked: Boolean(post.is_liked),
      time_ago: this.formatTimeAgo(post.created_at),
      created_at: post.created_at,
      updated_at: post.updated_at,
    };
  };

  /**
   * Create a new community post (Screen 2 Form)
   *
   * @param {Object} body
   * @param {Object|null} file - Optional image attachment
   * @param {Object} user - Author
   * @returns {Promise<{ id: number }>}
   */
  createPost = async (body, file, user) => {
    const { pgId, branchId } = await this.resolveUserScope(user);

    const postPayload = {
      pg_id: pgId,
      branch_id: body.branch_id ? Number(body.branch_id) : branchId,
      user_id: user.id,
      content: body.content.trim(),
      image: file ? file.filename : null,
      category: (body.category || 'update').toLowerCase().trim(),
      likes_count: 0,
      comments_count: 0,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    };

    const [id] = await db('community_posts').insert(postPayload);

    // Real-time: Notify all community members in the PG of new post
    try {
      const fullPost = await this.getPostById(id, user);
      socketService.emitToPg(pgId, SOCKET_EVENTS.COMMUNITY_POST_NEW, fullPost);
    } catch (e) {}

    return { id };
  };

  /**
   * Update an existing post
   *
   * @param {number} postId
   * @param {Object} body
   * @param {Object|null} file
   * @param {Object} user
   * @returns {Promise<{ id: number }>}
   */
  updatePost = async (postId, body, file, user) => {
    const post = await db('community_posts')
      .where({ id: postId })
      .whereNull('deleted_at')
      .first();

    if (!post) {
      throw new AppError('Community post not found', HTTP_STATUS.NOT_FOUND);
    }

    // Only post author, Admin, or Super Admin can edit
    if (post.user_id !== user.id && user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      throw new AppError('You do not have permission to edit this post', HTTP_STATUS.FORBIDDEN);
    }

    const updatePayload = {
      updated_at: db.fn.now(),
    };

    if (body.content !== undefined) {
      updatePayload.content = body.content.trim();
    }
    if (body.category !== undefined) {
      updatePayload.category = body.category.toLowerCase().trim();
    }
    if (file) {
      if (post.image) {
        deleteCommunityImageFile(post.image);
      }
      updatePayload.image = file.filename;
    }

    await db('community_posts').where({ id: postId }).update(updatePayload);
    return { id: postId };
  };

  /**
   * Soft delete a community post
   *
   * @param {number} postId
   * @param {Object} user
   * @returns {Promise<{ id: number }>}
   */
  deletePost = async (postId, user) => {
    const post = await db('community_posts')
      .where({ id: postId })
      .whereNull('deleted_at')
      .first();

    if (!post) {
      throw new AppError('Community post not found', HTTP_STATUS.NOT_FOUND);
    }

    // Only post author, Admin, or Super Admin can delete
    if (post.user_id !== user.id && user.role !== ROLES.ADMIN && user.role !== ROLES.SUPER_ADMIN) {
      throw new AppError('You do not have permission to delete this post', HTTP_STATUS.FORBIDDEN);
    }

    await db('community_posts').where({ id: postId }).update({
      deleted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return { id: postId };
  };

  // ==========================================
  // 2. Likes Management
  // ==========================================

  /**
   * Toggle Like / Unlike on a community post
   *
   * @param {number} postId
   * @param {Object} user
   * @returns {Promise<{ id: number, is_liked: boolean, likes_count: number }>}
   */
  toggleLikePost = async (postId, user) => {
    const post = await db('community_posts')
      .where({ id: postId })
      .whereNull('deleted_at')
      .first();

    if (!post) {
      throw new AppError('Community post not found', HTTP_STATUS.NOT_FOUND);
    }

    const existingLike = await db('community_post_likes')
      .where({ post_id: postId, user_id: user.id })
      .first();

    let isLiked = false;
    let newLikesCount = Number(post.likes_count || 0);

    if (existingLike) {
      // Unlike
      await db('community_post_likes')
        .where({ id: existingLike.id })
        .del();

      newLikesCount = Math.max(0, newLikesCount - 1);
      await db('community_posts')
        .where({ id: postId })
        .update({ likes_count: newLikesCount });
      isLiked = false;
    } else {
      // Like
      await db('community_post_likes').insert({
        post_id: postId,
        user_id: user.id,
        created_at: db.fn.now(),
      });

      newLikesCount += 1;
      await db('community_posts')
        .where({ id: postId })
        .update({ likes_count: newLikesCount });
      isLiked = true;
    }

    // Real-time: Broadcast like update to PG and post thread
    socketService.emitToPg(post.pg_id, SOCKET_EVENTS.COMMUNITY_POST_LIKED, {
      post_id: postId,
      likes_count: newLikesCount,
      is_liked: isLiked,
      user_id: user.id,
    });
    socketService.emitToPost(postId, SOCKET_EVENTS.COMMUNITY_POST_LIKED, {
      post_id: postId,
      likes_count: newLikesCount,
      is_liked: isLiked,
      user_id: user.id,
    });

    if (isLiked && post.user_id !== user.id) {
      socketService.emitToUser(post.user_id, SOCKET_EVENTS.NOTIFICATION_NEW, {
        title: 'New Like on your post',
        message: `${user.name || 'A resident'} liked your post.`,
        post_id: postId,
      });
    }

    return {
      id: postId,
      is_liked: isLiked,
      likes_count: newLikesCount,
    };
  };

  // ==========================================
  // 3. Comments Management
  // ==========================================

  /**
   * List comments on a community post
   *
   * @param {number} postId
   * @param {Object} query
   * @returns {Promise<{ comments: Array, pagination: Object }>}
   */
  getComments = async (postId, query = {}) => {
    const page = Math.max(1, parseInt(query.page || 1, 10));
    const limit = Math.max(1, Math.min(100, parseInt(query.limit || 20, 10)));
    const offset = (page - 1) * limit;

    const baseQuery = db('community_post_comments')
      .where('community_post_comments.post_id', postId)
      .whereNull('community_post_comments.deleted_at');

    const countRes = await baseQuery.clone().count('community_post_comments.id as total').first();
    const totalRecords = parseInt(countRes?.total || 0, 10);
    const totalPages = Math.ceil(totalRecords / limit) || 1;

    const rows = await baseQuery.clone()
      .leftJoin('users', 'community_post_comments.user_id', 'users.id')
      .leftJoin('resident_pg_stays', function () {
        this.on('community_post_comments.user_id', '=', 'resident_pg_stays.resident_id')
          .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
          .andOnNull('resident_pg_stays.deleted_at');
      })
      .leftJoin('rooms', 'resident_pg_stays.room_id', 'rooms.id')
      .select(
        'community_post_comments.*',
        'users.name as author_name',
        'users.profile_photo as author_photo',
        'rooms.room_no as author_room_no'
      )
      .orderBy('community_post_comments.created_at', 'asc')
      .limit(limit)
      .offset(offset);

    const comments = rows.map((comment) => ({
      id: comment.id,
      post_id: comment.post_id,
      author: {
        id: comment.user_id,
        name: comment.author_name || 'HomeNest Member',
        room_no: comment.author_room_no || null,
        profile_photo_url: comment.author_photo ? buildFileUrl('users', comment.author_photo) : null,
      },
      content: comment.content,
      time_ago: this.formatTimeAgo(comment.created_at),
      created_at: comment.created_at,
    }));

    return {
      comments,
      pagination: {
        page,
        limit,
        total_records: totalRecords,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_prev: page > 1,
      },
    };
  };

  /**
   * Add a comment to a community post
   *
   * @param {number} postId
   * @param {Object} body
   * @param {Object} user
   * @returns {Promise<{ id: number }>}
   */
  addComment = async (postId, body, user) => {
    const post = await db('community_posts')
      .where({ id: postId })
      .whereNull('deleted_at')
      .first();

    if (!post) {
      throw new AppError('Community post not found', HTTP_STATUS.NOT_FOUND);
    }

    const [commentId] = await db('community_post_comments').insert({
      post_id: postId,
      user_id: user.id,
      content: body.content.trim(),
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    // Increment comments_count on post
    await db('community_posts')
      .where({ id: postId })
      .increment('comments_count', 1);

    // Real-time: Broadcast new comment to PG and post thread
    socketService.emitToPg(post.pg_id, SOCKET_EVENTS.COMMUNITY_COMMENT_NEW, {
      post_id: postId,
      comment: {
        id: commentId,
        content: body.content.trim(),
        author: {
          id: user.id,
          name: user.name,
        },
        created_at: moment().toISOString(),
      },
    });
    socketService.emitToPost(postId, SOCKET_EVENTS.COMMUNITY_COMMENT_NEW, {
      post_id: postId,
      comment: {
        id: commentId,
        content: body.content.trim(),
        author: {
          id: user.id,
          name: user.name,
        },
        created_at: moment().toISOString(),
      },
    });

    if (post.user_id !== user.id) {
      socketService.emitToUser(post.user_id, SOCKET_EVENTS.NOTIFICATION_NEW, {
        title: 'New Comment on your post',
        message: `${user.name || 'A resident'} commented on your post: "${body.content.trim().slice(0, 40)}..."`,
        post_id: postId,
      });
    }

    // Real-time: Broadcast new comment to PG and post thread
    socketService.emitToPg(post.pg_id, SOCKET_EVENTS.COMMUNITY_COMMENT_NEW, {
      post_id: postId,
      comment: {
        id: commentId,
        content: body.content.trim(),
        author: {
          id: user.id,
          name: user.name,
        },
        created_at: moment().toISOString(),
      },
    });
    socketService.emitToPost(postId, SOCKET_EVENTS.COMMUNITY_COMMENT_NEW, {
      post_id: postId,
      comment: {
        id: commentId,
        content: body.content.trim(),
        author: {
          id: user.id,
          name: user.name,
        },
        created_at: moment().toISOString(),
      },
    });

    if (post.user_id !== user.id) {
      socketService.emitToUser(post.user_id, SOCKET_EVENTS.NOTIFICATION_NEW, {
        title: 'New Comment on your post',
        message: `${user.name || 'A resident'} commented on your post: "${body.content.trim().slice(0, 40)}..."`,
        post_id: postId,
      });
    }

    return { id: commentId };
  };

  /**
   * Delete a comment
   *
   * @param {number} commentId
   * @param {Object} user
   * @returns {Promise<{ id: number }>}
   */
  deleteComment = async (commentId, user) => {
    const comment = await db('community_post_comments')
      .where({ id: commentId })
      .whereNull('deleted_at')
      .first();

    if (!comment) {
      throw new AppError('Comment not found', HTTP_STATUS.NOT_FOUND);
    }

    // Comment author, Post author, or Admin can delete
    const post = await db('community_posts').where({ id: comment.post_id }).first();
    const canDelete =
      comment.user_id === user.id ||
      post?.user_id === user.id ||
      user.role === ROLES.ADMIN ||
      user.role === ROLES.SUPER_ADMIN;

    if (!canDelete) {
      throw new AppError('You do not have permission to delete this comment', HTTP_STATUS.FORBIDDEN);
    }

    await db('community_post_comments')
      .where({ id: commentId })
      .update({
        deleted_at: db.fn.now(),
        updated_at: db.fn.now(),
      });

    // Decrement comments_count on post
    if (post && post.comments_count > 0) {
      await db('community_posts')
        .where({ id: comment.post_id })
        .decrement('comments_count', 1);
    }

    return { id: commentId };
  };

  // ==========================================
  // 4. Community Events (Screen 3)
  // ==========================================

  /**
   * List community events grouped by timeline (Ongoing, Upcoming, Past) or filtered by timeline
   *
   * @param {Object} user
   * @param {Object} query
   * @returns {Promise<Object>}
   */
  getEvents = async (user, query = {}) => {
    const { pgId } = await this.resolveUserScope(user);

    const baseQuery = db('community_events')
      .where('community_events.pg_id', pgId)
      .whereNull('community_events.deleted_at');

    if (query.category) {
      baseQuery.whereILike('community_events.category', `%${query.category.trim()}%`);
    }

    if (query.search) {
      baseQuery.where((qb) => {
        qb.whereILike('community_events.title', `%${query.search.trim()}%`)
          .orWhereILike('community_events.description', `%${query.search.trim()}%`)
          .orWhereILike('community_events.location', `%${query.search.trim()}%`);
      });
    }

    // Specific timeline filter (ongoing | upcoming | past)
    if (query.timeline && ['ongoing', 'upcoming', 'past'].includes(query.timeline.toLowerCase())) {
      const rows = await baseQuery.clone()
        .where('community_events.status', query.timeline.toLowerCase())
        .orderBy('community_events.event_date', query.timeline === 'past' ? 'desc' : 'asc');

      const events = rows.map((e) => this.formatEventItem(e));
      return { events };
    }

    // Default: Grouped response matching Screen 3 layout (Ongoing, Upcoming, Past)
    const allRows = await baseQuery.clone()
      .orderBy('community_events.event_date', 'asc');

    const ongoing = [];
    const upcoming = [];
    const past = [];

    allRows.forEach((row) => {
      const formatted = this.formatEventItem(row);
      if (row.status === 'ongoing') {
        ongoing.push(formatted);
      } else if (row.status === 'past') {
        past.push(formatted);
      } else {
        upcoming.push(formatted);
      }
    });

    return {
      ongoing,
      upcoming,
      past,
    };
  };

  /**
   * Helper: Format single event card item
   * @param {Object} event
   * @returns {Object}
   */
  formatEventItem = (event) => ({
    id: event.id,
    title: event.title,
    category: event.category,
    event_date: event.event_date,
    date_formatted: this.formatEventDateTime(event.event_date),
    location: event.location || 'Common room',
    image_url: event.image ? buildFileUrl('community', event.image) : null,
    status: event.status,
    description: event.description,
    created_at: event.created_at,
  });

  /**
   * Get event detail by ID
   *
   * @param {number} eventId
   * @param {Object} user
   * @returns {Promise<Object>}
   */
  getEventById = async (eventId, user) => {
    const { pgId } = await this.resolveUserScope(user);

    const event = await db('community_events')
      .where({ id: eventId, pg_id: pgId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new AppError('Community event not found', HTTP_STATUS.NOT_FOUND);
    }

    return this.formatEventItem(event);
  };

  /**
   * Create a community event
   *
   * @param {Object} body
   * @param {Object|null} file
   * @param {Object} user
   * @returns {Promise<{ id: number }>}
   */
  createEvent = async (body, file, user) => {
    const { pgId, branchId } = await this.resolveUserScope(user);

    const payload = {
      pg_id: pgId,
      branch_id: body.branch_id ? Number(body.branch_id) : branchId,
      created_by: user.id,
      title: body.title.trim(),
      category: body.category.trim(),
      event_date: moment(body.event_date).toDate(),
      location: body.location ? body.location.trim() : 'Common room',
      image: file ? file.filename : null,
      status: (body.status || 'upcoming').toLowerCase().trim(),
      description: body.description ? body.description.trim() : null,
      created_at: db.fn.now(),
      updated_at: db.fn.now(),
    };

    const [id] = await db('community_events').insert(payload);
    return { id };
  };

  /**
   * Update an existing community event
   *
   * @param {number} eventId
   * @param {Object} body
   * @param {Object|null} file
   * @param {Object} user
   * @returns {Promise<{ id: number }>}
   */
  updateEvent = async (eventId, body, file, user) => {
    const event = await db('community_events')
      .where({ id: eventId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new AppError('Community event not found', HTTP_STATUS.NOT_FOUND);
    }

    const updatePayload = {
      updated_at: db.fn.now(),
    };

    if (body.title !== undefined) updatePayload.title = body.title.trim();
    if (body.category !== undefined) updatePayload.category = body.category.trim();
    if (body.event_date !== undefined) updatePayload.event_date = moment(body.event_date).toDate();
    if (body.location !== undefined) updatePayload.location = body.location.trim();
    if (body.status !== undefined) updatePayload.status = body.status.toLowerCase().trim();
    if (body.description !== undefined) updatePayload.description = body.description ? body.description.trim() : null;

    if (file) {
      if (event.image) {
        deleteCommunityImageFile(event.image);
      }
      updatePayload.image = file.filename;
    }

    await db('community_events').where({ id: eventId }).update(updatePayload);
    return { id: eventId };
  };

  /**
   * Delete a community event
   *
   * @param {number} eventId
   * @param {Object} user
   * @returns {Promise<{ id: number }>}
   */
  deleteEvent = async (eventId, user) => {
    const event = await db('community_events')
      .where({ id: eventId })
      .whereNull('deleted_at')
      .first();

    if (!event) {
      throw new AppError('Community event not found', HTTP_STATUS.NOT_FOUND);
    }

    await db('community_events').where({ id: eventId }).update({
      deleted_at: db.fn.now(),
      updated_at: db.fn.now(),
    });

    return { id: eventId };
  };

  // ==========================================
  // 5. Resident Birthdays (Filter Pill Tab)
  // ==========================================

  /**
   * Get upcoming birthdays in the community for the current month or all upcoming
   *
   * @param {Object} user
   * @param {Object} query - Optional query: month (1-12 or 'all'), branch_id
   * @returns {Promise<{ birthdays: Array }>}
   */
  getUpcomingBirthdays = async (user, query = {}) => {
    const { pgId } = await this.resolveUserScope(user);
    const requestedMonth = query.month ? parseInt(query.month, 10) : null;
    const currentMonth = moment().month() + 1; // 1 to 12

    let baseQuery = db('users')
      .where('users.role', ROLES.RESIDENT)
      .whereNull('users.deleted_at')
      .whereNotNull('users.date_of_birth')
      .join('resident_pg_stays', function () {
        this.on('users.id', '=', 'resident_pg_stays.resident_id')
          .andOn('resident_pg_stays.pg_id', '=', db.raw('?', [pgId]))
          .andOn('resident_pg_stays.status', '=', db.raw('?', ['active']))
          .andOnNull('resident_pg_stays.deleted_at');
      })
      .leftJoin('rooms', 'resident_pg_stays.room_id', 'rooms.id')
      .select(
        'users.id',
        'users.name',
        'users.profile_photo',
        'users.date_of_birth',
        'rooms.room_no'
      );

    if (query.branch_id) {
      baseQuery.where('resident_pg_stays.branch_id', Number(query.branch_id));
    }

    let residents = [];

    if (query.month === 'all') {
      residents = await baseQuery.clone()
        .orderByRaw('MONTH(users.date_of_birth) ASC, DAY(users.date_of_birth) ASC');
    } else if (requestedMonth && requestedMonth >= 1 && requestedMonth <= 12) {
      residents = await baseQuery.clone()
        .whereRaw('MONTH(users.date_of_birth) = ?', [requestedMonth])
        .orderByRaw('DAY(users.date_of_birth) ASC');
    } else {
      residents = await baseQuery.clone()
        .whereRaw('MONTH(users.date_of_birth) = ?', [currentMonth])
        .orderByRaw('DAY(users.date_of_birth) ASC');

      // If no resident born in current month, gracefully return upcoming active residents' birthdays
      if (residents.length === 0) {
        residents = await baseQuery.clone()
          .orderByRaw('MONTH(users.date_of_birth) ASC, DAY(users.date_of_birth) ASC')
          .limit(10);
      }
    }

    const birthdays = residents.map((r) => {
      const dob = moment(r.date_of_birth);
      const thisYearBday = moment().month(dob.month()).date(dob.date());
      return {
        id: r.id,
        name: r.name,
        room_no: r.room_no || null,
        profile_photo_url: r.profile_photo ? buildFileUrl('users', r.profile_photo) : null,
        birthday_date: thisYearBday.format('DD MMMM'),
        is_today: thisYearBday.isSame(moment(), 'day'),
      };
    });

    return { birthdays };
  };
}

export default new CommunityService();

