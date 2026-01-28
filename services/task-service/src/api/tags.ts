/**
 * Tag Service API Endpoints
 * Implements REST API for tag management
 * Reference: contracts/task-service.openapi.yaml
 */

import { Router, Request, Response, NextFunction } from 'express';
import { TagRepository } from '../persistence/tag-repository.js';
import pino from 'pino';

const logger = pino({ name: 'tag-api' });

const router = Router();
const tagRepository = new TagRepository();

// Middleware to extract user ID from headers
function getUserId(req: Request): string {
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    throw new Error('Missing X-User-Id header');
  }
  return userId;
}

/**
 * GET /tags - List all tags for the user
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { orderBy } = req.query;

    const orderByUsage = orderBy !== 'name';
    const tags = await tagRepository.findAllByUser(userId, orderByUsage);

    logger.info({ count: tags.length, userId }, 'Tags listed');

    res.json({
      tags: tags.map((tag) => ({
        id: tag.id,
        name: tag.name,
        usageCount: tag.usageCount,
        createdAt: tag.createdAt.toISOString(),
      })),
      total: tags.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tags/:name - Get a specific tag by name
 */
router.get('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { name } = req.params;

    const tag = await tagRepository.findByName(name, userId);
    if (!tag) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }

    res.json({
      id: tag.id,
      name: tag.name,
      usageCount: tag.usageCount,
      createdAt: tag.createdAt.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /tags/:name - Delete a tag (only if unused)
 */
router.delete('/:name', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { name } = req.params;

    const tag = await tagRepository.findByName(name, userId);
    if (!tag) {
      res.status(404).json({ error: 'Tag not found' });
      return;
    }

    if (tag.usageCount > 0) {
      res.status(400).json({
        error: 'Cannot delete tag that is in use',
        usageCount: tag.usageCount,
      });
      return;
    }

    await tagRepository.delete(tag.id, userId);

    logger.info({ tagId: tag.id, tagName: name, userId }, 'Tag deleted');

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /tags - Delete all unused tags
 */
router.delete('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = getUserId(req);
    const { unusedOnly } = req.query;

    if (unusedOnly !== 'true') {
      res.status(400).json({ error: 'Must specify unusedOnly=true to delete tags' });
      return;
    }

    const deletedCount = await tagRepository.deleteUnused(userId);

    logger.info({ deletedCount, userId }, 'Unused tags deleted');

    res.json({ deletedCount });
  } catch (error) {
    next(error);
  }
});

export default router;
