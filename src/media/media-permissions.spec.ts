import { Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import type { AuthUser, UserRole } from '@common/auth-user.js';
import type { MediaRecord } from './schemas/media.schema.js';
import { canAccessMedia } from './media-permissions.js';

function createUser(role: UserRole = 'user'): AuthUser {
  return { id: new Types.ObjectId().toString(), email: 'x@example.com', role };
}

const owner = createUser();
const friend = createUser();
const stranger = createUser();
const admin = createUser('admin');

const media = {
  _id: new Types.ObjectId(),
  ownerId: new Types.ObjectId(owner.id),
  allowedUserIds: [new Types.ObjectId(friend.id)],
} as MediaRecord;

describe('canAccessMedia', () => {
  it('owner can do everything', () => {
    expect(canAccessMedia(owner, media, 'view')).toBe(true);
    expect(canAccessMedia(owner, media, 'delete')).toBe(true);
    expect(canAccessMedia(owner, media, 'manage')).toBe(true);
  });

  it('allowed user can only view', () => {
    expect(canAccessMedia(friend, media, 'view')).toBe(true);
    expect(canAccessMedia(friend, media, 'delete')).toBe(false);
    expect(canAccessMedia(friend, media, 'manage')).toBe(false);
  });

  it('other users can do nothing', () => {
    expect(canAccessMedia(stranger, media, 'view')).toBe(false);
    expect(canAccessMedia(stranger, media, 'delete')).toBe(false);
    expect(canAccessMedia(stranger, media, 'manage')).toBe(false);
  });

  it('admin can view and delete but not change permissions', () => {
    expect(canAccessMedia(admin, media, 'view')).toBe(true);
    expect(canAccessMedia(admin, media, 'delete')).toBe(true);
    expect(canAccessMedia(admin, media, 'manage')).toBe(false);
  });
});
